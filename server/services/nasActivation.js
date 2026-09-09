const { connectToMongo, getDb } = require('../config/db');

// ---------------------------------------------------------------------------
// Application-wide NAS activation.
//
// The state lives in MongoDB, not in a session and not in the browser, because
// "is the records share available?" is a property of the deployment rather
// than of whoever happens to be looking. A developer switching it on switches
// it on for everyone; closing their tab does not switch it off.
//
// It expires on a clock rather than on someone remembering. The old ERMS share
// is unavailable at weekends, so an activation that outlives its window would
// leave every document request failing against a share nobody expects to be
// reachable. The window is evaluated on the server on every read:
//
//     active = enabled AND now within [startsAt, endsAt]
//
// A front-end countdown is a display of this, never the authority for it.
// ---------------------------------------------------------------------------

const COLLECTION = 'app-config';
const DOC_ID = 'nas-activation';

const collection = () => getDb().collection(COLLECTION);

/** The stored record, or the default "off" shape. */
async function readState() {
  await connectToMongo();
  const doc = await collection().findOne({ _id: DOC_ID });
  return {
    enabled: doc?.enabled === true,
    startsAt: doc?.startsAt ? new Date(doc.startsAt) : null,
    endsAt: doc?.endsAt ? new Date(doc.endsAt) : null,
    updatedAt: doc?.updatedAt ? new Date(doc.updatedAt) : null,
    updatedBy: doc?.updatedBy || null,
    note: doc?.note || null,
  };
}

/**
 * Whether the share may be used right now, and why not when it may not.
 *
 * `reason` distinguishes states that look identical from a failed request but
 * mean different things to whoever has to fix them:
 *
 *   not-configured  no share is set in the environment
 *   disabled        a developer turned it off
 *   not-yet         an activation window that starts later
 *   expired         the window has passed — the case this exists for
 */
async function evaluate(now = new Date()) {
  const nas = require('./nasStorage');

  if (!nas.isConfigured()) {
    return { active: false, reason: 'not-configured' };
  }
  // The environment switch is a deployment-level override: if the server was
  // started with NAS_ENABLED=false, no stored activation can turn it on.
  if (!nas.nasConfig().enabled) {
    return { active: false, reason: 'disabled-by-environment' };
  }

  const state = await readState();
  if (!state.enabled) {
    return { active: false, reason: 'disabled', ...windowOf(state) };
  }
  if (state.startsAt && now < state.startsAt) {
    return { active: false, reason: 'not-yet', ...windowOf(state) };
  }
  if (state.endsAt && now > state.endsAt) {
    return { active: false, reason: 'expired', ...windowOf(state) };
  }

  return {
    active: true,
    reason: null,
    ...windowOf(state),
    remainingMs: state.endsAt ? Math.max(state.endsAt - now, 0) : null,
  };
}

const windowOf = (state) => ({
  startsAt: state.startsAt,
  endsAt: state.endsAt,
  updatedAt: state.updatedAt,
  updatedBy: state.updatedBy,
  note: state.note,
});

/**
 * Turn activation on or off.
 *
 * `durationMinutes` is a convenience over endsAt — "give me four hours" is what
 * someone actually wants, and computing the end on the server means the client
 * cannot extend a window by lying about its own clock.
 */
async function setActivation({ enabled, startsAt, endsAt, durationMinutes, note }, actor) {
  await connectToMongo();

  const now = new Date();
  let start = startsAt ? new Date(startsAt) : null;
  let end = endsAt ? new Date(endsAt) : null;

  if (enabled) {
    if (!start) start = now;
    if (!end && durationMinutes) {
      const minutes = Number(durationMinutes);
      if (!Number.isFinite(minutes) || minutes <= 0) {
        return { ok: false, status: 400, code: 'BAD_DURATION', message: 'Duration must be a positive number of minutes.' };
      }
      end = new Date(start.getTime() + minutes * 60000);
    }
    if (end && start && end <= start) {
      return { ok: false, status: 400, code: 'BAD_WINDOW', message: 'The activation window ends before it starts.' };
    }
  }

  const doc = {
    enabled: enabled === true,
    startsAt: enabled ? start : null,
    endsAt: enabled ? end : null,
    note: note ? String(note).slice(0, 300) : null,
    updatedAt: now,
    updatedBy: actor?.username || 'unknown',
  };

  await collection().updateOne({ _id: DOC_ID }, { $set: doc }, { upsert: true });
  return { ok: true, state: await evaluate() };
}

/**
 * Gate for anything that reads the share.
 *
 * Deliberately separate from requireNasConfig: "no share configured" and "the
 * share is outside its activation window" are different problems with
 * different fixes, and collapsing them into one message sends people to the
 * wrong place.
 */
async function requireNasActive(req, res, next) {
  try {
    const state = await evaluate();
    if (state.active) {
      req.nasActivation = state;
      return next();
    }
    const messages = {
      'not-configured': 'The records share is not configured on this server.',
      'disabled-by-environment': 'Document access is switched off for this deployment.',
      disabled: 'Document access is currently switched off.',
      'not-yet': 'Document access is scheduled to start later.',
      expired: 'The document access window has expired.',
    };
    return res.status(503).json({
      code: 'NAS_INACTIVE',
      reason: state.reason,
      message: messages[state.reason] || 'Document access is unavailable.',
      endsAt: state.endsAt || null,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { readState, evaluate, setActivation, requireNasActive, COLLECTION, DOC_ID };
