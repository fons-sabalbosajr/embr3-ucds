// ---------------------------------------------------------------------------
// VERA ROLE POLICY — what VERA may do for each account type.
//
// The knowledge itself is already scoped by role and domain (assistant
// contextFor), and figures and record searches by the person's own access
// (figures.js, lookup.js). This adds the administrator's say over the two
// things that cost or reveal something, per role:
//
//   model     answers come from the AI model (off: the help library only —
//             nothing that role types is sent to a provider)
//   figures   live counts and record searches are worked into answers
//
// Both default to on, which is how VERA behaved before the policy existed.
// Stored in vera-settings as `roleAccess`; set in Admin Settings › VERA.
// ---------------------------------------------------------------------------

const { ROLES, ROLE_LABELS } = require('../authorization');

const CAPABILITIES = Object.freeze({
  model: 'AI model answers',
  figures: 'Live figures and record search',
});

const ROLE_KEYS = Object.values(ROLES);

/** The access a role has, with the defaults filled in. */
function accessFor(cfg, role) {
  const stored = cfg?.roleAccess?.[role] || {};
  return Object.fromEntries(Object.keys(CAPABILITIES).map((k) => [k, stored[k] !== false]));
}

/** Every role's access, for the settings screen. */
function describe(cfg) {
  return ROLE_KEYS.map((role) => ({ role, label: ROLE_LABELS[role] || role, ...accessFor(cfg, role) }));
}

/**
 * A `roleAccess` value from the settings form, checked: known roles and
 * capabilities only, booleans only. Returns { value } or { error }.
 */
function parse(input) {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) return { error: 'roleAccess must be an object keyed by role' };
  const value = {};
  for (const [role, caps] of Object.entries(input)) {
    if (!ROLE_KEYS.includes(role)) return { error: `roleAccess: unknown role "${role}"` };
    if (caps == null || typeof caps !== 'object') return { error: `roleAccess.${role} must be an object` };
    value[role] = {};
    for (const [cap, on] of Object.entries(caps)) {
      if (!CAPABILITIES[cap]) return { error: `roleAccess.${role}: unknown capability "${cap}"` };
      value[role][cap] = on !== false;
    }
  }
  return { value };
}

module.exports = { CAPABILITIES, accessFor, describe, parse };
