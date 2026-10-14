// The text drawn across every page of a scan in the viewer (Settings ›
// Data privacy › watermark): the application's name and the date it was
// viewed, in the office's time zone — "E-Universe · Oct 12, 2026". It marks
// a photograph or screenshot of a scan as coming from the system, and when.

const APP_NAME = 'E-Universe';

function watermarkText(now = new Date()) {
  const date = now.toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' });
  return `${APP_NAME} · ${date}`;
}

module.exports = { APP_NAME, watermarkText };
