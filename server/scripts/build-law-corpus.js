#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Build VERA's environmental-law corpus (services/vera/laws/corpus.json).
//
// The laws EMB Region III enforces, as enacted, from the Lawphil Project
// (Arellano Law Foundation): each page's text, split into its sections, the
// wording kept as published. VERA answers legal questions from these sections
// only, and cites them (services/vera/lawRetrieval).
//
//   node scripts/build-law-corpus.js            download and build
//   node scripts/build-law-corpus.js <dir>      build from <dir>/<ID>.html already downloaded
//
// Run again to refresh; the corpus is committed so the server never fetches.
// To add a law, add it to LAWS. Implementing rules (IRRs, DAOs) are not here.
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

const LAWS = [
  { id: 'PD1586', number: 'P.D. No. 1586', short: 'Environmental Impact Statement System', year: 1978, url: 'https://lawphil.net/statutes/presdecs/pd1978/pd_1586_1978.html', aliases: ['pd 1586', 'pd1586', 'p.d. 1586', 'presidential decree 1586', 'eis system', 'environmental impact statement', 'ecc', 'environmental compliance certificate'] },
  { id: 'RA8749', number: 'R.A. No. 8749', short: 'Philippine Clean Air Act of 1999', year: 1999, url: 'https://lawphil.net/statutes/repacts/ra1999/ra_8749_1999.html', aliases: ['ra 8749', 'ra8749', 'r.a. 8749', 'republic act 8749', 'clean air act', 'air pollution', 'air quality', 'emission'] },
  { id: 'RA9275', number: 'R.A. No. 9275', short: 'Philippine Clean Water Act of 2004', year: 2004, url: 'https://lawphil.net/statutes/repacts/ra2004/ra_9275_2004.html', aliases: ['ra 9275', 'ra9275', 'r.a. 9275', 'republic act 9275', 'clean water act', 'water pollution', 'wastewater', 'discharge permit', 'water quality'] },
  { id: 'RA6969', number: 'R.A. No. 6969', short: 'Toxic Substances and Hazardous and Nuclear Wastes Control Act of 1990', year: 1990, url: 'https://lawphil.net/statutes/repacts/ra1990/ra_6969_1990.html', aliases: ['ra 6969', 'ra6969', 'r.a. 6969', 'republic act 6969', 'toxic substances', 'hazardous waste', 'hazardous wastes', 'chemical', 'nuclear waste'] },
  { id: 'RA9003', number: 'R.A. No. 9003', short: 'Ecological Solid Waste Management Act of 2000', year: 2001, url: 'https://lawphil.net/statutes/repacts/ra2001/ra_9003_2001.html', aliases: ['ra 9003', 'ra9003', 'r.a. 9003', 'republic act 9003', 'solid waste', 'ecological solid waste', 'open dump', 'sanitary landfill', 'mrf', 'materials recovery'] },
  { id: 'RA9729', number: 'R.A. No. 9729', short: 'Climate Change Act of 2009', year: 2009, url: 'https://lawphil.net/statutes/repacts/ra2009/ra_9729_2009.html', aliases: ['ra 9729', 'ra9729', 'r.a. 9729', 'republic act 9729', 'climate change act', 'climate change commission', 'climate change'] },
  { id: 'RA9512', number: 'R.A. No. 9512', short: 'National Environmental Awareness and Education Act of 2008', year: 2008, url: 'https://lawphil.net/statutes/repacts/ra2008/ra_9512_2008.html', aliases: ['ra 9512', 'ra9512', 'r.a. 9512', 'republic act 9512', 'environmental awareness', 'environmental education'] },
];

const MAX_CHUNK = 2400; // characters; a long section (definitions) is split by paragraph

/** The page's text: tags out, entities decoded, one paragraph per line. */
function textOf(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h\d|tr|li|center|blockquote|table)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;?/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&ndash;|&mdash;/g, '-')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}

const SECTION_RE = /^(?:SECTION|Section|SEC\.|Sec\.)\s*(\d+[-A-Za-z]?)\s*\.?\s*/;
const HEADING_RE = /^(CHAPTER|Chapter|ARTICLE|Article|TITLE|Title|RULE|Rule)\s+([IVXLC\d]+)\b/;

/** One law's page → its title and sections. */
function parse(law, html) {
  const lines = textOf(html).split('\n');
  // The body starts at the first section; what precedes is the title block.
  const first = lines.findIndex((l) => SECTION_RE.test(l));
  if (first < 0) throw new Error(`${law.id}: no sections found`);
  const preamble = lines.slice(0, first);
  // The long title: the first capitalised line that is not the act's number or the palace's name.
  const title =
    preamble.find((l) => l.length > 25 && l === l.toUpperCase() && !/^(PRESIDENTIAL DECREE|REPUBLIC ACT|MALACA|P\.D\.|R\.A\.)/i.test(l)) || law.short;
  const dated = (preamble.join(' ').match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}/) || [])[0] || null;

  const sections = [];
  let part = { chapter: null, article: null };
  let current = null;
  for (const line of lines.slice(first)) {
    if (/^Approved[,:]?$|^The Lawphil Project/i.test(line)) break;
    const h = HEADING_RE.exec(line);
    if (h && line.length < 120) {
      const kind = h[1].toLowerCase();
      if (kind === 'chapter' || kind === 'title') part = { chapter: line, article: null };
      else part = { ...part, article: line };
      continue;
    }
    const s = SECTION_RE.exec(line);
    if (s) {
      const rest = line.slice(s[0].length);
      // "Short Title. - This Act…" and "Fines and Penalties - (a)…" (RA 9003
      // writes no period) → the heading. The dash must stand apart, so a
      // hyphenated word ("non-attainment") is never taken for it.
      const hm = /^([A-Z][^.\n]{1,160}?)(?:\.\s*|\s+)[-–]+(?:\s+|$)/.exec(rest) || /^([A-Z][^.]{2,100}?)\.\s+/.exec(rest);
      current = { number: s[1], heading: hm ? hm[1].trim() : null, chapter: part.chapter, article: part.article, lines: [hm ? rest.slice(hm[0].length) : rest] };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }

  // Sections as chunks: a long one is split at paragraph ends.
  const chunks = [];
  for (const sec of sections) {
    const paras = sec.lines.filter(Boolean);
    let buf = [];
    let size = 0;
    let n = 1;
    const push = () => {
      if (!buf.length) return;
      chunks.push({
        id: `${law.id}-s${sec.number}${n > 1 || size > MAX_CHUNK ? `-p${n}` : ''}`,
        law: law.id,
        section: sec.number,
        heading: sec.heading,
        part: n,
        chapter: sec.chapter,
        article: sec.article,
        text: buf.join('\n'),
      });
      buf = [];
      size = 0;
      n += 1;
    };
    for (const p of paras) {
      if (size + p.length > MAX_CHUNK && buf.length) push();
      buf.push(p);
      size += p.length + 1;
    }
    push();
  }
  // A section in one piece keeps the plain id; one split keeps -p1, -p2…
  const counts = chunks.reduce((m, c) => m.set(`${c.law}-${c.section}`, (m.get(`${c.law}-${c.section}`) || 0) + 1), new Map());
  for (const c of chunks) {
    if (counts.get(`${c.law}-${c.section}`) === 1) c.id = `${c.law}-s${c.section}`;
    else c.id = `${c.law}-s${c.section}-p${c.part}`;
    c.parts = counts.get(`${c.law}-${c.section}`);
  }
  return { ...law, title, dated, sectionCount: sections.length, chunks };
}

async function download(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'E-Universe VERA law corpus builder (EMB Region III)' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  // Lawphil serves windows-1252.
  return new TextDecoder('windows-1252').decode(await res.arrayBuffer());
}

async function main() {
  const from = process.argv[2] || null;
  const laws = [];
  for (const law of LAWS) {
    const html = from ? new TextDecoder('windows-1252').decode(fs.readFileSync(path.join(from, `${law.id}.html`))) : await download(law.url);
    const parsed = parse(law, html);
    laws.push(parsed);
    console.log(`${law.id}: ${parsed.sectionCount} sections, ${parsed.chunks.length} chunks — ${parsed.title.slice(0, 70)}`);
  }
  const out = path.join(__dirname, '..', 'services', 'vera', 'laws', 'corpus.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(
    out,
    JSON.stringify({ builtAt: new Date().toISOString(), source: 'The Lawphil Project - Arellano Law Foundation (lawphil.net)', laws }, null, 1)
  );
  console.log(`wrote ${out}`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

module.exports = { LAWS, parse, textOf };
