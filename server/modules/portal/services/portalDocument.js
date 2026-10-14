const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');
const { APP_NAME } = require('../../erms/services/watermark');

// ---------------------------------------------------------------------------
// The document as the Document Portal hands it to one reader.
//
// Made on the server, for each opening:
//
//   * Only the approved pages. The PDF is rebuilt with those pages and no
//     others, so a page that was not approved never leaves the server — not
//     hidden by the viewer, absent from the bytes.
//   * Watermarked into the pages themselves: who is reading (the name they
//     gave and the computer's address), their designation, when, and the request's
//     reference, across every page and in a footer line. The browser's viewer
//     cannot be stopped from being photographed or screenshotted; the mark
//     makes any copy say whose it was. Being in the PDF rather than drawn by
//     the viewer, it is also in a file someone digs out of the browser.
//   * Stripped of the original's metadata (title, author, producer) — the
//     office's scan software and file names stay on the share.
//
// A JPEG or PNG scan becomes a one-page PDF so it gets the same treatment.
// Anything else (a TIFF, a Word file) is refused rather than served unmarked.
// If a PDF cannot be read, it is refused too: serving it whole would ignore
// the page rule.
// ---------------------------------------------------------------------------

class PortalDocumentError extends Error {
  constructor(message, code, status = 422) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// The standard PDF font covers Latin-1; anything outside it would throw, so a
// name with other characters is drawn with "?" in their place.
const latin1 = (s) => String(s || '').replace(/[^\x20-\x7E -ÿ]/g, '?');

function stampTime(now = new Date()) {
  return now.toLocaleString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** The words of the mark for this reader and this request. */
function markFor(request, now = new Date()) {
  const ref = String(request._id || request.id || '').slice(-8).toUpperCase();
  // The name they gave, and the computer it came from: the portal has no
  // accounts, so the address is what ties a copy back to a desk.
  const ip = request.client?.ip ? String(request.client.ip).replace(/^::ffff:/, '') : null;
  const who = `${request.requesterName}${ip ? ` (${ip})` : ''}`;
  return {
    ref,
    diagonal: latin1(`${APP_NAME} · ${who} · ${request.designation} · ${stampTime(now)}`),
    footer: latin1(`${APP_NAME} Document Portal · view only · ${who}, ${request.designation} · ${stampTime(now)} · Ref ${ref}`),
  };
}

async function loadSource(buffer, contentType) {
  if (contentType === 'application/pdf') {
    try {
      const src = await PDFDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false });
      return src;
    } catch {
      throw new PortalDocumentError('This document could not be prepared for the portal. Ask the office to check the scan.', 'UNREADABLE_PDF');
    }
  }
  if (contentType === 'image/jpeg' || contentType === 'image/png') {
    try {
      const pdf = await PDFDocument.create();
      const image = contentType === 'image/png' ? await pdf.embedPng(buffer) : await pdf.embedJpg(buffer);
      const page = pdf.addPage([image.width, image.height]);
      page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
      return pdf;
    } catch {
      throw new PortalDocumentError('This scan could not be prepared for the portal.', 'UNREADABLE_IMAGE');
    }
  }
  throw new PortalDocumentError('This kind of file cannot be shown in the Document Portal. Ask the office for a PDF scan.', 'UNSUPPORTED_TYPE', 415);
}

/**
 * @param {Buffer} buffer        the file as it is on the share
 * @param {string} contentType
 * @param {object} request       the approved portal request (pages, requester, designation)
 * @returns {{ bytes: Buffer, total: number, pages: number[] }}  pages: the original page numbers included
 */
/**
 * `watermark`: print the reader across every page (the Developer's room
 * setting, services/portalSettings). Off, the pages are sent clean — still
 * only the approved ones.
 */
async function prepare(buffer, contentType, request, now = new Date(), { watermark = false } = {}) {
  const src = await loadSource(buffer, contentType);
  const total = src.getPageCount();
  const wanted = request.pages?.all === false ? (request.pages.list || []).filter((p) => p >= 1 && p <= total) : Array.from({ length: total }, (_, i) => i + 1);
  if (!wanted.length) {
    throw new PortalDocumentError(`None of the approved pages are in this document (it has ${total}). Ask the office to correct the approval.`, 'NO_PAGES', 409);
  }

  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, wanted.map((p) => p - 1));
  const font = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);
  const mark = markFor(request, now);

  copied.forEach((page, i) => {
    out.addPage(page);
    if (!watermark) return;
    const { width, height } = page.getSize();
    const short = Math.min(width, height);

    // Diagonal, repeated, faint: readable on a photograph, not in the way.
    const size = Math.max(9, Math.round(short / 34));
    const step = size * 9;
    const textWidth = font.widthOfTextAtSize(mark.diagonal, size);
    for (let y = -height; y < height * 2; y += step) {
      for (let x = -textWidth; x < width + textWidth; x += textWidth + size * 6) {
        page.drawText(mark.diagonal, { x, y, size, font, color: rgb(0.12, 0.16, 0.22), opacity: 0.13, rotate: degrees(30) });
      }
    }

    // A footer line on a light band, with where this page sits in the original.
    const footSize = Math.max(6, Math.round(short / 95));
    const label = latin1(`Page ${wanted[i]} of ${total}  ·  `);
    const band = footSize * 2.4;
    page.drawRectangle({ x: 0, y: 0, width, height: band, color: rgb(1, 1, 1), opacity: 0.82 });
    page.drawText(label, { x: footSize, y: band / 2 - footSize / 3, size: footSize, font: bold, color: rgb(0.1, 0.1, 0.1) });
    page.drawText(mark.footer, { x: footSize + bold.widthOfTextAtSize(label, footSize), y: band / 2 - footSize / 3, size: footSize, font, color: rgb(0.2, 0.2, 0.2), maxWidth: width - footSize * 2 });
  });

  out.setTitle(`${APP_NAME} Document Portal · Ref ${mark.ref}`);
  out.setAuthor(APP_NAME);
  out.setSubject('View only');
  out.setKeywords([]);
  out.setProducer(APP_NAME);
  out.setCreator(APP_NAME);
  const bytes = Buffer.from(await out.save({ useObjectStreams: true }));
  return { bytes, total, pages: wanted };
}

/** The page count only, for the Records Unit choosing pages to approve. */
async function countPages(buffer, contentType) {
  const src = await loadSource(buffer, contentType);
  return src.getPageCount();
}

module.exports = { prepare, countPages, markFor, PortalDocumentError };
