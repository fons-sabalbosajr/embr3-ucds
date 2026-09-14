// ---------------------------------------------------------------------------
// Email templates.
//
// One place, so the E-Universe identity is not retyped into every message and
// a change to the footer does not mean hunting through controllers. Every
// message the server sends is built here: password reset and the notice after
// it, the sign-up request and its acknowledgement, new-account credentials,
// and the storage step-up code.
//
// The shell is table-based with inline styles only. Mail clients — Gmail and
// Outlook in particular — drop <style> blocks and class names, which is why
// the old reset mail arrived as an unstyled grey button on a white page. No
// remote or embedded images either: they are blocked by default, and the
// inline seal that used to ride along as an attachment showed as a broken
// square in most inboxes. Every message also has a plain-text twin.
//
// Nothing in a template ever carries operational detail. A message is
// delivered to an inbox that may be read on a phone, forwarded, or sitting in
// a mailbox long after a link expired, so it names no host, no share, no
// account and no configuration — only what the recipient needs to act.
// ---------------------------------------------------------------------------

const PRODUCT = 'E-Universe';
const TAGLINE = 'Unified Information and Records Management System';
const OWNER = 'Environmental Management Bureau · Regional Office III';
const ADDRESS =
  'Diosdado Macapagal Government Center, Maimpis, City of San Fernando, Pampanga';

// The navigation navy and the default accent from ThemeProvider, so the mail
// looks like the application it comes from.
const C = {
  navy: '#0d1522',
  navySoft: '#1a2536',
  accent: '#2f7ecb',
  page: '#eef1f5',
  card: '#ffffff',
  line: '#e2e7ee',
  ink: '#1b2430',
  inkSoft: '#4f5b6b',
  inkFaint: '#8a95a5',
  calloutBg: '#f3f7fc',
  calloutLine: '#d6e4f5',
  warnText: '#8a4b2b',
};

const FONT = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const escape = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

const plural = (n, unit) => `${n} ${unit}${Number(n) === 1 ? '' : 's'}`;

// --- Building blocks ---------------------------------------------------------

const p = (html, opts = {}) =>
  `<p style="margin:0 0 ${opts.gap ?? 16}px;font-size:${opts.size ?? 15}px;line-height:1.65;color:${
    opts.color ?? C.ink
  }">${html}</p>`;

const small = (html) => p(html, { size: 13, color: C.inkSoft, gap: 12 });

/** A button that survives Outlook: a table cell, not a styled anchor. */
function button({ href, label }) {
  const url = escape(href);
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px">
      <tr>
        <td style="border-radius:8px;background:${C.accent}">
          <a href="${url}" target="_blank"
             style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">
            ${escape(label)}
          </a>
        </td>
      </tr>
    </table>`;
}

/** The link spelled out, for clients that do not render the button. */
const fallbackLink = (href) =>
  `<p style="margin:0 0 16px;font-size:12px;line-height:1.6;color:${C.inkFaint};word-break:break-all">
     If the button does not work, copy this address into your browser:<br>
     <a href="${escape(href)}" style="color:${C.accent}">${escape(href)}</a>
   </p>`;

/** A framed block for the one thing the recipient came for. */
function callout({ label, value, mono = false }) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px">
      <tr>
        <td style="padding:18px 20px;background:${C.calloutBg};border:1px solid ${C.calloutLine};border-radius:10px;text-align:center">
          <div style="font-size:11px;letter-spacing:.8px;text-transform:uppercase;color:${C.inkSoft};margin-bottom:8px">${escape(
            label
          )}</div>
          <div style="font-size:${mono ? 30 : 18}px;font-weight:700;letter-spacing:${mono ? 8 : 0}px;color:${
            C.navy
          };font-family:${mono ? 'Consolas,Menlo,monospace' : FONT}">${escape(value)}</div>
        </td>
      </tr>
    </table>`;
}

/** Label/value rows: who registered, what the credentials are. */
function details(rows) {
  const body = rows
    .filter(([, v]) => v !== undefined && v !== null && String(v) !== '')
    .map(
      ([k, v, opts = {}]) => `
        <tr>
          <td style="padding:9px 14px;font-size:12px;letter-spacing:.4px;text-transform:uppercase;color:${
            C.inkSoft
          };border-bottom:1px solid ${C.line};white-space:nowrap;vertical-align:top">${escape(k)}</td>
          <td style="padding:9px 14px;font-size:14px;color:${C.ink};border-bottom:1px solid ${
            C.line
          };font-family:${opts.mono ? 'Consolas,Menlo,monospace' : FONT};font-weight:${
            opts.mono ? 600 : 400
          };word-break:break-word">${escape(v)}</td>
        </tr>`
    )
    .join('');
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="margin:4px 0 20px;border:1px solid ${C.line};border-radius:10px;border-collapse:separate;overflow:hidden">
      ${body}
    </table>`;
}

/**
 * Shared shell so every message looks like it comes from the same system.
 *
 * `preheader` is the line inbox lists show after the subject; it is hidden in
 * the body. `note` is the security line in the footer, in a warmer colour so
 * it is read rather than skimmed past.
 */
function layout({ heading, preheader, body, note }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escape(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${C.page};font-family:${FONT};-webkit-text-size-adjust:100%">
  ${
    preheader
      ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${C.page};opacity:0">${escape(
          preheader
        )}${'&#847;&zwnj;&nbsp;'.repeat(30)}</div>`
      : ''
  }
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page}">
    <tr>
      <td align="center" style="padding:32px 16px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">

          <!-- Header -->
          <tr>
            <td style="background:${C.navy};border-radius:12px 12px 0 0;padding:22px 28px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle">
                    <div style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:.2px;line-height:1.2">
                      <span style="color:${C.accent}">E</span>-Universe
                    </div>
                    <div style="font-size:11.5px;color:#aeb9c9;margin-top:3px;letter-spacing:.2px">${TAGLINE}</div>
                  </td>
                  <td align="right" style="vertical-align:middle;font-size:10.5px;letter-spacing:.8px;text-transform:uppercase;color:#7f8ca0;white-space:nowrap">
                    EMB&nbsp;Region&nbsp;III
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr><td style="height:4px;background:${C.accent};font-size:0;line-height:0">&nbsp;</td></tr>

          <!-- Body -->
          <tr>
            <td style="background:${C.card};padding:30px 28px 10px;border-left:1px solid ${C.line};border-right:1px solid ${C.line}">
              <h1 style="margin:0 0 18px;font-size:20px;font-weight:600;line-height:1.3;color:${C.ink}">${escape(
                heading
              )}</h1>
              ${body}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:${C.card};padding:18px 28px 24px;border:1px solid ${C.line};border-top:1px solid ${
              C.line
            };border-radius:0 0 12px 12px">
              ${
                note
                  ? `<p style="margin:0 0 14px;font-size:12.5px;line-height:1.6;color:${C.warnText}">${note}</p>`
                  : ''
              }
              <p style="margin:0;font-size:11.5px;line-height:1.7;color:${C.inkFaint}">
                <strong style="color:${C.inkSoft}">${OWNER}</strong><br>
                ${ADDRESS}<br>
                This is an automated message from ${PRODUCT}. Replies to this address are not read.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** The plain-text twin, with the same footer. */
const textBody = (lines) =>
  [...lines, '', '—', OWNER, ADDRESS, `This is an automated message from ${PRODUCT}. Replies are not read.`].join(
    '\n'
  );

// --- Templates ----------------------------------------------------------------

/** Account recovery: the link to choose a new password. */
function passwordReset({ name, username, resetLink, minutes = 60 }) {
  const who = String(name || '').trim();
  const account = String(username || '').trim();
  const expiry = minutes >= 60 ? plural(Math.round(minutes / 60), 'hour') : plural(minutes, 'minute');

  const html = layout({
    heading: 'Reset your password',
    preheader: `Your link to choose a new ${PRODUCT} password. It expires in ${expiry}.`,
    body: `
      ${p(`Hello${who ? ` ${escape(who)}` : ''},`)}
      ${p(
        `We received a request to reset the password on your ${PRODUCT} account. Choose a new one with the button below.`
      )}
      ${button({ href: resetLink, label: 'Choose a new password' })}
      ${small(`This link works for <strong>${expiry}</strong> and can be used once.`)}
      ${
        account
          ? small(
              `Your username is <strong style="font-family:Consolas,Menlo,monospace">${escape(
                account
              )}</strong>; you can sign in with it or with this email address.`
            )
          : ''
      }
      ${fallbackLink(resetLink)}`,
    note:
      'If you did not ask to reset your password, no action is needed — your current password ' +
      'still works and this link will expire on its own. If these keep arriving, tell your system administrator.',
  });

  const text = textBody([
    `${PRODUCT} — reset your password`,
    '',
    `Hello${who ? ` ${who}` : ''},`,
    '',
    `We received a request to reset the password on your ${PRODUCT} account.`,
    'Open this link to choose a new one:',
    '',
    resetLink,
    '',
    `It works for ${expiry} and can be used once.`,
    ...(account ? ['', `Your username is ${account}; you can sign in with it or with this email address.`] : []),
    '',
    'If you did not ask for this, no action is needed — your current password',
    'still works and the link will expire on its own.',
  ]);

  return { subject: `Reset your ${PRODUCT} password`, text, html };
}

/** Sent after a reset succeeds, so a change the owner did not make is noticed. */
function passwordChanged({ name, when = new Date() }) {
  const who = String(name || '').trim();
  const stamp = new Date(when).toLocaleString('en-PH', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  });

  const html = layout({
    heading: 'Your password was changed',
    preheader: `The password on your ${PRODUCT} account was changed on ${stamp}.`,
    body: `
      ${p(`Hello${who ? ` ${escape(who)}` : ''},`)}
      ${p(`The password on your ${PRODUCT} account was changed on <strong>${escape(stamp)}</strong>.`)}
      ${p('If that was you, there is nothing else to do — sign in with your new password as usual.')}`,
    note:
      'If you did not change your password, someone else may have access to your email or your account. ' +
      'Tell your system administrator right away so the account can be secured.',
  });

  const text = textBody([
    `${PRODUCT} — your password was changed`,
    '',
    `Hello${who ? ` ${who}` : ''},`,
    '',
    `The password on your ${PRODUCT} account was changed on ${stamp}.`,
    'If that was you, there is nothing else to do.',
    '',
    'If you did not change your password, tell your system administrator',
    'right away so the account can be secured.',
  ]);

  return { subject: `Your ${PRODUCT} password was changed`, text, html };
}

/** To the administrator: someone has asked for an account. */
function registrationReceived({ name, division, position, email, reviewUrl }) {
  const html = layout({
    heading: 'New access request',
    preheader: `${name} (${division}) has requested an ${PRODUCT} account.`,
    body: `
      ${p(`A request for an ${PRODUCT} account is waiting for review.`)}
      ${details([
        ['Name', name],
        ['Division / Section', division],
        ['Position', position],
        ['Email', email],
      ])}
      ${p(
        'Approve it under <strong>Admin &rsaquo; User Accounts &rsaquo; Signed Up Users</strong>. Approving creates the account and sends the person their credentials.',
        { size: 14 }
      )}
      ${reviewUrl ? button({ href: reviewUrl, label: 'Open User Accounts' }) : ''}`,
    note: 'Only approve people you can verify are EMB Region III personnel. The request was submitted from the public site and has not been checked.',
  });

  const text = textBody([
    `${PRODUCT} — new access request`,
    '',
    `A request for an ${PRODUCT} account is waiting for review.`,
    '',
    `Name:               ${name}`,
    `Division / Section: ${division}`,
    `Position:           ${position}`,
    `Email:              ${email}`,
    '',
    'Approve it under Admin > User Accounts > Signed Up Users.',
    ...(reviewUrl ? ['', reviewUrl] : []),
  ]);

  return { subject: `Access request from ${name}`, text, html };
}

/** To the applicant: we have it, here is what happens next. */
function registrationAcknowledged({ name }) {
  const who = String(name || '').trim();

  const html = layout({
    heading: 'We received your request',
    preheader: `Your ${PRODUCT} access request has been sent to the administrator for approval.`,
    body: `
      ${p(`Hello${who ? ` ${escape(who)}` : ''},`)}
      ${p(
        `Your request for an ${PRODUCT} account has been recorded and sent to the system administrator for approval.`
      )}
      ${p(
        'Once it is approved you will receive a second email at this address with your username and a temporary password. There is nothing you need to do in the meantime.',
        { size: 14 }
      )}`,
    note: 'If you did not submit this request, you can ignore this message — no account is created until an administrator approves it.',
  });

  const text = textBody([
    `${PRODUCT} — we received your request`,
    '',
    `Hello${who ? ` ${who}` : ''},`,
    '',
    `Your request for an ${PRODUCT} account has been recorded and sent to the`,
    'system administrator for approval.',
    '',
    'Once it is approved you will receive a second email at this address with',
    'your username and a temporary password.',
  ]);

  return { subject: `Your ${PRODUCT} access request`, text, html };
}

/** To the new user: the account exists, here is how to get in. */
function accountApproved({ name, username, password, loginUrl }) {
  const who = String(name || '').trim();

  const html = layout({
    heading: 'Your account is ready',
    preheader: `Your ${PRODUCT} access request was approved. Your sign-in details are inside.`,
    body: `
      ${p(`Hello${who ? ` ${escape(who)}` : ''},`)}
      ${p(`Your request was approved and an ${PRODUCT} account has been created for you.`)}
      ${details([
        ['Username', username, { mono: true }],
        ['Temporary password', password, { mono: true }],
      ])}
      ${button({ href: loginUrl, label: `Sign in to ${PRODUCT}` })}
      ${small(
        'Change this password after your first sign-in: choose <em>Forgot your password?</em> on the sign-in page and follow the link that is emailed to you.'
      )}
      ${fallbackLink(loginUrl)}`,
    note: 'Keep these details to yourself. Nobody from the Bureau will ask you for your password, and this message should not be forwarded.',
  });

  const text = textBody([
    `${PRODUCT} — your account is ready`,
    '',
    `Hello${who ? ` ${who}` : ''},`,
    '',
    `Your request was approved and an ${PRODUCT} account has been created for you.`,
    '',
    `Username:           ${username}`,
    `Temporary password: ${password}`,
    '',
    `Sign in at: ${loginUrl}`,
    '',
    'Change this password after your first sign-in using "Forgot your password?"',
    'on the sign-in page.',
    '',
    'Keep these details to yourself and do not forward this message.',
  ]);

  return { subject: `Your ${PRODUCT} account is ready`, text, html };
}

/**
 * The step-up code for records-share configuration.
 *
 * Deliberately does not say which server, share or account it protects: the
 * recipient already knows what they clicked, and an inbox is not a place to
 * put infrastructure detail.
 */
function nasVerificationCode({ code, minutes }) {
  const mins = Number(minutes) || 10;

  const html = layout({
    heading: 'Storage configuration verification',
    preheader: `Your verification code is ${code}. It expires in ${mins} minutes.`,
    body: `
      ${p('Use this code to continue. It confirms it is you before the records storage configuration is opened.')}
      ${callout({ label: 'Verification code', value: code, mono: true })}
      ${small(`Expires in <strong>${plural(mins, 'minute')}</strong>. It can be used once.`)}`,
    note:
      'If you did not request this, no action is needed — the code is useless on its own. ' +
      'If these arrive unexpectedly, tell your system administrator.',
  });

  const text = textBody([
    `${PRODUCT} — storage configuration verification`,
    '',
    `Your verification code is ${code}`,
    '',
    `It expires in ${plural(mins, 'minute')} and can be used once.`,
    '',
    'This code authorises access to the records storage configuration in',
    `${PRODUCT}. If you did not request it, no action is needed — the code is`,
    'useless on its own. If you receive these unexpectedly, tell your system',
    'administrator.',
  ]);

  return { subject: `${PRODUCT} verification code: ${code}`, text, html };
}

module.exports = {
  passwordReset,
  passwordChanged,
  registrationReceived,
  registrationAcknowledged,
  accountApproved,
  nasVerificationCode,
  layout,
  PRODUCT,
  TAGLINE,
  OWNER,
};
