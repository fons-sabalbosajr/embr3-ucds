// ---------------------------------------------------------------------------
// Email templates.
//
// One place, so the E-Universe identity is not retyped into every message and
// a change to the footer does not mean hunting through controllers. The
// password-reset mail in authController still builds its own HTML; it can move
// here when it is next touched.
//
// Nothing in a template ever carries operational detail. A verification email
// is delivered to an inbox that may be read on a phone, forwarded, or sitting
// in a mailbox long after the code expired, so it names no host, no share, no
// account and no configuration — only what the code is for.
// ---------------------------------------------------------------------------

const PRODUCT = 'E-Universe';
const TAGLINE = 'Unified Information and Records Management System';
const OWNER = 'Environmental Management Bureau · Region III';

const escape = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

/** Shared shell so every message looks like it comes from the same system. */
function layout({ heading, body, footerNote }) {
  return `
  <div style="margin:0;padding:24px;background:#f4f6f4;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif">
    <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e3e7e3">
      <tr>
        <td style="padding:24px 28px;background:#2f5d3a">
          <div style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:.2px">${PRODUCT}</div>
          <div style="font-size:12px;color:#c9dcc9;margin-top:2px">${TAGLINE}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:28px">
          <h1 style="margin:0 0 16px;font-size:17px;font-weight:600;color:#1b1f1b">${heading}</h1>
          ${body}
        </td>
      </tr>
      <tr>
        <td style="padding:16px 28px 24px;border-top:1px solid #eef1ee">
          ${
            footerNote
              ? `<p style="margin:0 0 10px;font-size:12px;line-height:1.6;color:#8a4b4b">${footerNote}</p>`
              : ''
          }
          <p style="margin:0;font-size:11px;line-height:1.6;color:#8b918b">
            ${OWNER}<br>
            This is an automated message from ${PRODUCT}. Please do not reply.
          </p>
        </td>
      </tr>
    </table>
  </div>`;
}

/**
 * The step-up code for records-share configuration.
 *
 * Deliberately does not say which server, share or account it protects: the
 * recipient already knows what they clicked, and an inbox is not a place to
 * put infrastructure detail.
 */
function nasVerificationCode({ code, minutes }) {
  const safeCode = escape(code);
  const mins = Number(minutes) || 10;

  const text = [
    `${PRODUCT} — storage configuration verification`,
    '',
    `Your verification code is ${safeCode}`,
    '',
    `It expires in ${mins} minutes and can be used once.`,
    '',
    'This code authorises access to the records storage configuration in',
    `${PRODUCT}. If you did not request it, no action is needed — the code is`,
    'useless on its own. If you receive these unexpectedly, tell your system',
    'administrator.',
    '',
    OWNER,
  ].join('\n');

  const html = layout({
    heading: 'Storage configuration verification',
    body: `
      <p style="margin:0 0 20px;font-size:14px;line-height:1.65;color:#3d453d">
        Use this code to continue. It confirms it is you before the records
        storage configuration is opened.
      </p>
      <div style="margin:0 0 20px;padding:18px;background:#f4f8f4;border:1px solid #dce7dc;border-radius:8px;text-align:center">
        <div style="font-size:11px;letter-spacing:.8px;text-transform:uppercase;color:#6b756b;margin-bottom:8px">
          Verification code
        </div>
        <div style="font-size:32px;font-weight:700;letter-spacing:8px;color:#2f5d3a;font-family:Consolas,Menlo,monospace">
          ${safeCode}
        </div>
      </div>
      <p style="margin:0;font-size:13px;line-height:1.65;color:#5b635b">
        Expires in <strong>${mins} minutes</strong>. It can be used once.
      </p>`,
    footerNote:
      'If you did not request this, no action is needed — the code is useless ' +
      'on its own. If these arrive unexpectedly, tell your system administrator.',
  });

  return {
    subject: `${PRODUCT} verification code: ${safeCode}`,
    text,
    html,
  };
}

module.exports = { nasVerificationCode, layout, PRODUCT, TAGLINE, OWNER };
