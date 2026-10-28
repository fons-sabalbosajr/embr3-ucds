// ---------------------------------------------------------------------------
// VERA'S LAW LIBRARY — retrieval over the environmental laws EMB enforces.
//
// The corpus (laws/corpus.json, built by scripts/build-law-corpus.js) holds
// the enacted text of PD 1586, RA 8749, RA 9275, RA 6969, RA 9003, RA 9729 and
// RA 9512, section by section, as published by the Lawphil Project. A legal
// question is answered from those sections only:
//
//   1. find()      — the sections that bear on the question: a section named
//                    outright ("Section 28 of RA 9275") first, then the best
//                    matches by BM25 over each section's heading and text,
//                    the law named in the question weighed up. Nothing at all
//                    unless the question is a legal one or names a law, so an
//                    ordinary "how do I upload my ECC" never pulls in a decree.
//   2. promptBlock — the sections, verbatim, each labelled with its law and
//                    section, for the model to read and cite.
//   3. verify()    — after the model answers: every section it cites, and
//                    every peso amount it quotes, must be in the sections it
//                    was given. What is not is named in a caution under the
//                    answer, and the sources it was given are listed.
//
// Implementing rules (IRRs, DAOs, memorandum circulars) are not in the corpus,
// and VERA says so rather than filling the gap.
// ---------------------------------------------------------------------------

const corpus = require('./laws/corpus.json');

const LAWS = new Map(corpus.laws.map((l) => [l.id, l]));
const CHUNKS = corpus.laws.flatMap((l) => l.chunks.map((c) => ({ ...c, lawNumber: l.number, lawShort: l.short, url: l.url })));

// ── Words ────────────────────────────────────────────────────────────────────

const STOPWORDS = new Set(
  'a an the of to in on for and or is are be by as at with from that this these those it its shall may any all such other which who whom whose than then there their into upon under within without per not no nor if so do does did has have had been being was were will would can could should must hereby herein thereof thereto said act section sec'.split(
    ' '
  )
);

/** The same crude stemmer on both sides, so they meet. */
function stem(w) {
  let s = w;
  if (s.length > 4 && s.endsWith('ies')) s = `${s.slice(0, -3)}y`;
  else if (s.length > 4 && /(ses|xes|zes|ches|shes)$/.test(s)) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1);
  if (s.length > 5 && s.endsWith('ing')) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith('ed')) s = s.slice(0, -2);
  if (s.length > 6 && s.endsWith('ment')) s = s.slice(0, -4);
  else if (s.length > 6 && s.endsWith('tion')) s = s.slice(0, -4);
  return s;
}

const tokens = (text) =>
  String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .map(stem);

// ── The index (built once) ───────────────────────────────────────────────────

const K1 = 1.4;
const B = 0.72;
const docs = CHUNKS.map((c) => {
  // The heading counts three times over: it says what the section is about.
  const terms = [...tokens(c.heading), ...tokens(c.heading), ...tokens(c.heading), ...tokens(c.text)];
  const tf = new Map();
  for (const t of terms) tf.set(t, (tf.get(t) || 0) + 1);
  return { chunk: c, tf, len: terms.length };
});
const avgLen = docs.reduce((s, d) => s + d.len, 0) / docs.length;
const df = new Map();
for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1);
const idf = (t) => Math.log(1 + (docs.length - (df.get(t) || 0) + 0.5) / ((df.get(t) || 0) + 0.5));

function bm25(d, qTerms) {
  let s = 0;
  for (const t of qTerms) {
    const f = d.tf.get(t);
    if (!f) continue;
    s += idf(t) * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * d.len) / avgLen)));
  }
  return s;
}

// ── Reading the question ─────────────────────────────────────────────────────

// A law named by its number — "RA 9275", "R.A. No. 9275", "Republic Act 9275", "PD 1586".
const NUMBER_RE = /\b(r\.?\s?a\.?|republic\s+act|p\.?\s?d\.?|presidential\s+decree)\s*(?:no\.?|number)?\s*(\d{4})\b/gi;
// Names that mean one law and nothing else.
const NAMES = [
  [/\bclean\s+air\s+act\b/i, 'RA8749'],
  [/\bclean\s+water\s+act\b/i, 'RA9275'],
  [/\becological\s+solid\s+waste\b|\bsolid\s+waste\s+management\s+act\b/i, 'RA9003'],
  [/\btoxic\s+substances\b|\bhazardous\s+and\s+nuclear\s+wastes?\b/i, 'RA6969'],
  [/\bclimate\s+change\s+act\b|\bclimate\s+change\s+commission\b/i, 'RA9729'],
  [/\benvironmental\s+(awareness|education)\s+act\b/i, 'RA9512'],
  [/\b(eis|environmental\s+impact\s+statement)\s+system\b/i, 'PD1586'],
];
// Words that make a question a legal one.
const LEGAL_RE =
  /\b(law|laws|legal|legally|illegal|illegally|unlawful|lawful|bawal|act|decree|section|sec\.|provision|provisions|penalt(y|ies)|fine[sd]?|punish\w*|imprison\w*|prohibit\w*|violat\w*|liab\w*|offen[cs]e\w*|sanction\w*|mandat\w*|requir\w+\s+by\s+law|according\s+to|declared?\s+policy|definition|defined|batas|multa|parusa|ipinagbabawal)\b/i;
// Words that tie a legal question to one law, when no number or name is given.
const TOPIC = [
  [/\bair\b|\bemission|\bsmoke|\bvehicle|\bincinerat|\bleaded\b/i, 'RA8749'],
  [/\bwater\b|\bwastewater|\bdischarge|\bsewage|\bseptage|\beffluent/i, 'RA9275'],
  [/\bsolid\s+waste|\bgarbage|\blandfill|\bdump|\bsegregat|\brecycl|\bmrf\b|\bcompost/i, 'RA9003'],
  [/\btoxic|\bhazardous|\bchemical|\bnuclear/i, 'RA6969'],
  [/\bclimate/i, 'RA9729'],
  [/\beducation|\bawareness|\bcurricul|\bearth\s+day/i, 'RA9512'],
  [/\beis\b|\becc\b|\benvironmental\s+compliance\s+certificate|\benvironmentally\s+critical|\bimpact\s+(statement|assessment)/i, 'PD1586'],
];

/** The laws a question names outright, by number or name. */
function lawsNamed(message) {
  const s = String(message || '');
  const out = new Set();
  for (const m of s.matchAll(NUMBER_RE)) {
    const id = `${/^p/i.test(m[1]) ? 'PD' : 'RA'}${m[2]}`;
    if (LAWS.has(id)) out.add(id);
  }
  for (const [re, id] of NAMES) if (re.test(s)) out.add(id);
  return [...out];
}

/** "Section 28", "Sec. 28", "§28" in the question. */
const sectionsNamed = (message) => [...String(message || '').matchAll(/(?:\bsec(?:tion)?\.?|§)\s*(\d+[a-z]?)\b/gi)].map((m) => m[1].toLowerCase());

// How people say it vs how the laws spell it: "ECC" never appears in PD 1586.
const EXPAND = [
  [/\becc\b/i, 'environmental compliance certificate'],
  [/\bcnc\b/i, 'certificate non coverage'],
  [/\beis\b/i, 'environmental impact statement'],
  [/\beia\b/i, 'environmental impact assessment'],
  [/\becp\b/i, 'environmentally critical project'],
  [/\beca\b/i, 'environmentally critical area'],
  [/\bhw\b|\bhazwaste/i, 'hazardous waste'],
  [/\bpab\b/i, 'pollution adjudication board'],
  [/\blgus?\b/i, 'local government unit'],
  [/\bmrfs?\b/i, 'materials recovery facility'],
  [/\bgarbage|\btrash|\brubbish/i, 'solid waste'],
  [/\bfine[sd]?\b|\bpenalt|\bmulta\b|\bparusa\b/i, 'fine penalty'],
];
const expanded = (message) => [message, ...EXPAND.filter(([re]) => re.test(message)).map(([, w]) => w)].join(' ');
const PENALTY_ASK = /\b(penalt(y|ies)|fine[sd]?|punish\w*|imprison\w*|sanction\w*|liab\w*|multa|parusa)\b/i;
const PENALTY_HEADING = /penalt|fines?\b|sanction|punish/i;

// The system's own words that sound legal: a Notice of Violation is a document
// the Legal Services Unit files, not a question about the law.
const SYSTEM_TERMS_RE = /\bnotices?\s+of\s+violation\b|\bnovs?\b|\btechnical\s+conference\b|\bdocket(\s+no\.?)?\b|\bcase\s+folder\b/gi;
// "How do I upload / attach / find …": how to use E-Universe, not what a law says.
const HOW_TO_RE =
  /\b(how\s+(do|can|to|should)|where\s+(do|can|is|are)|steps?\s+(to|for)|paano|saan)\b[^?]{0,80}\b(upload|add|attach|file|open|find|edit|encode|print|scan|delete|remove|search|create|save|request|download|view|see|change|update|link|archive|share)\b/i;

/** Is this a question VERA should answer from the law library? */
function wantsLaw(message) {
  const s = String(message || '');
  if (lawsNamed(s).length > 0) return true;
  if (HOW_TO_RE.test(s)) return false;
  return LEGAL_RE.test(s.replace(SYSTEM_TERMS_RE, ' '));
}

// Below this a match is a common word, not the law speaking to the question.
const MIN_SCORE = 4;
const MAX_CHUNKS = 4;
const MAX_CHARS = 9000;

/**
 * The sections for a question, best first.
 * @returns {{chunks: object[], laws: string[]}} empty when the question is not a legal one
 */
function find(message, { limit = MAX_CHUNKS } = {}) {
  if (!wantsLaw(message)) return { chunks: [], laws: [] };
  const named = lawsNamed(message);
  const topical = TOPIC.filter(([re]) => re.test(message)).map(([, id]) => id);
  const prefer = new Set(named.length ? named : topical);
  const picked = [];
  const take = (c) => {
    if (!picked.some((p) => p.id === c.id)) picked.push(c);
  };

  // A section named outright, of a law named outright (or the only law in view).
  const secs = sectionsNamed(message);
  if (secs.length && prefer.size) {
    for (const id of prefer) for (const s of secs) CHUNKS.filter((c) => c.law === id && c.section.toLowerCase() === s).forEach(take);
  }

  const q = tokens(expanded(message));
  let scored = [];
  if (q.length) {
    scored = docs
      .filter((d) => !named.length || named.includes(d.chunk.law))
      .map((d) => ({ d, s: bm25(d, q) * (prefer.has(d.chunk.law) ? 1.6 : 1) }))
      .sort((a, b) => b.s - a.s);
    // A law named outright is answered from it even on a weaker match: the
    // question is about that law, whatever its words.
    const floor = named.length ? MIN_SCORE / 3 : MIN_SCORE;
    const good = scored.filter((x) => x.s >= floor);
    // "What is the fine for…": the penalties section of the law in question,
    // which seldom shares the question's words.
    if (PENALTY_ASK.test(message)) {
      const lawsInView = [...new Set([...prefer, ...good.slice(0, 2).map((x) => x.d.chunk.law)])];
      for (const law of lawsInView) {
        const pen = scored.find((x) => x.d.chunk.law === law && PENALTY_HEADING.test(x.d.chunk.heading || ''));
        if (pen) take(pen.d.chunk);
      }
    }
    for (const { d } of good) {
      if (picked.length >= limit) break;
      take(d.chunk);
    }
  }
  // Within the size the prompt can carry.
  const out = [];
  let size = 0;
  for (const c of picked.slice(0, limit)) {
    if (size + c.text.length > MAX_CHARS && out.length) break;
    out.push(c);
    size += c.text.length;
  }
  return { chunks: out, laws: [...new Set(out.map((c) => c.law))] };
}

const label = (c) => `${c.lawNumber}, Sec. ${c.section}${c.parts > 1 ? ` (part ${c.part} of ${c.parts})` : ''}`;

/** The sections as the model reads them. */
function promptBlock(chunks) {
  return chunks
    .map((c) => `[${label(c)}${c.heading ? ` — ${c.heading}` : ''}] (${c.lawNumber}, ${c.lawShort})\n${c.text}`)
    .join('\n\n');
}

const RULES = [
  '- LAW: for anything about what a law says — duties, prohibitions, penalties, definitions — answer ONLY from the LAW TEXT below, which is the enacted text.',
  '- Cite every legal statement as (R.A. No. 9275, Sec. 28) — the law and section it comes from. Never cite a law or section that is not in the LAW TEXT.',
  '- Amounts, periods, penalties and defined terms: word for word from the LAW TEXT. Never round, convert or estimate them.',
  '- If the LAW TEXT does not answer it, say: "The law text I have does not cover that." Then name what might (the law\'s implementing rules, a DENR Administrative Order) and point to the Legal Services Unit. Do not fill the gap from memory.',
  '- The LAW TEXT is the law as enacted; later amendments and the implementing rules are not included — say so when it matters. This is information, not legal advice.',
].join('\n');

const AMOUNT_RE = /(?:₱|\bP(?:hp)?\.?\s?)\s?(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d{4,}(?:\.\d{2})?)/gi;
const amountOf = (s) => {
  const v = Number(String(s).replace(/,/g, ''));
  return Number.isFinite(v) ? v : null;
};

/**
 * Check a model's answer against the sections it was given.
 * @returns {{text: string, unverified: string[], cited: string[]}}
 */
function verify(answer, chunks) {
  const text = String(answer || '');
  if (!chunks.length) return { text, unverified: [], cited: [] };
  const given = new Set(chunks.map((c) => `${c.law}:${c.section.toLowerCase()}`));
  const lawsGiven = [...new Set(chunks.map((c) => c.law))];
  const unverified = [];
  const cited = new Set();

  // "R.A. No. 9275, Sec. 28", "RA 9003 Section 49", "Sec. 27 of RA 9275", and a bare
  // "Sec. 28" when only one law was given.
  const pairs = [];
  for (const m of text.matchAll(/\b(r\.?\s?a\.?|republic\s+act|p\.?\s?d\.?|presidential\s+decree)\s*(?:no\.?)?\s*(\d{4})[^.;\n)]{0,24}?\b(?:sec(?:tion)?s?\.?|§)\s*(\d+[a-z]?)/gi)) {
    pairs.push([`${/^p/i.test(m[1]) ? 'PD' : 'RA'}${m[2]}`, m[3]]);
  }
  for (const m of text.matchAll(/\b(?:sec(?:tion)?\.?|§)\s*(\d+[a-z]?)\s*(?:,\s*)?(?:of\s+)?(?:the\s+)?(r\.?\s?a\.?|republic\s+act|p\.?\s?d\.?|presidential\s+decree)\s*(?:no\.?)?\s*(\d{4})/gi)) {
    pairs.push([`${/^p/i.test(m[2]) ? 'PD' : 'RA'}${m[3]}`, m[1]]);
  }
  if (lawsGiven.length === 1) {
    for (const m of text.matchAll(/\b(?:sec(?:tion)?\.?|§)\s*(\d+[a-z]?)\b/gi)) pairs.push([lawsGiven[0], m[1]]);
  }
  for (const [law, sec] of pairs) {
    const key = `${law}:${sec.toLowerCase()}`;
    if (given.has(key)) cited.add(key);
    else {
      // A section the given text itself refers to ("violates Sec. 48") is
      // named in it, not invented — only flag what appears nowhere given.
      const mentioned = chunks.some((c) => c.law === law && new RegExp(`\\bsec(?:tion)?\\.?\\s*${sec}\\b`, 'i').test(c.text));
      if (!mentioned) unverified.push(`${LAWS.get(law)?.number || law}, Sec. ${sec}`);
    }
  }

  // Amounts in pesos must be among the amounts the text given states, compared
  // as numbers ("P10,000" is "P10,000.00").
  const amountsGiven = new Set(chunks.flatMap((c) => [...c.text.matchAll(AMOUNT_RE)].map((m) => amountOf(m[1]))));
  for (const m of text.matchAll(AMOUNT_RE)) {
    const v = amountOf(m[1]);
    if (v != null && !amountsGiven.has(v)) unverified.push(`the amount ${m[0].trim()}`);
  }

  return { text, unverified: [...new Set(unverified)], cited: [...cited] };
}

/** The footer under a law answer: the sources given, and any caution. */
function footer(chunks, check) {
  // The sections the answer rests on: those it cites, when it cites any;
  // otherwise all it was given.
  const cited = new Set(check.cited || []);
  const used = cited.size ? chunks.filter((c) => cited.has(`${c.law}:${c.section.toLowerCase()}`)) : chunks;
  const sources = [...new Map(used.map((c) => [`${c.law}-${c.section}`, c])).values()]
    .map((c) => `${c.lawNumber} (${c.lawShort}), Sec. ${c.section}${c.heading ? ` — ${c.heading}` : ''}`)
    .join('; ');
  const lines = [`Sources (the enacted text): ${sources}.`];
  // Dates and permit numbers not in the firm's permit file (permitAnalysis.verifyFacts).
  if (check.facts?.length) {
    lines.unshift(`⚠ Not in the register's permit file, so not confirmed: ${check.facts.join('; ')}. The firm's Clearances and Permits tab shows what the register holds.`);
  }
  if (check.unverified.length) {
    lines.unshift(
      `⚠ Not found in the law text VERA was given, so not confirmed: ${check.unverified.join('; ')}. Check it against the law before relying on it.`
    );
  }
  return `\n\n${lines.join('\n')}`;
}

/** Without a model: the best section, verbatim, with its citation. */
function libraryAnswer(chunks) {
  if (!chunks.length) return null;
  const top = chunks[0];
  const more = chunks.slice(1, 3).map((c) => `${c.lawNumber}, Sec. ${c.section}${c.heading ? ` (${c.heading})` : ''}`);
  return (
    `From ${top.lawNumber} (${top.lawShort}), Sec. ${top.section}${top.heading ? ` — ${top.heading}` : ''}:\n\n${top.text}` +
    (more.length ? `\n\nSee also: ${more.join('; ')}.` : '') +
    '\n\n(The enacted text, from VERA\'s law library. The implementing rules are not included; this is information, not legal advice.)'
  );
}

/** The chunks of the sections named, as [law, section] pairs, in that order. */
function sections(refs = []) {
  const out = [];
  for (const [law, section] of refs) {
    for (const c of CHUNKS) if (c.law === law && c.section.toLowerCase() === String(section).toLowerCase() && !out.includes(c)) out.push(c);
  }
  return out;
}

/** Chunks from several sources, each once, first come first kept, within the prompt's size. */
function merge(...lists) {
  const out = [];
  let size = 0;
  for (const c of lists.flat()) {
    if (out.some((x) => x.id === c.id)) continue;
    if (size + c.text.length > MAX_CHARS * 1.5 && out.length) break;
    out.push(c);
    size += c.text.length;
  }
  return out;
}

/** For the settings screen: what the library holds. */
const summary = () => ({
  builtAt: corpus.builtAt,
  source: corpus.source,
  laws: corpus.laws.map((l) => ({ id: l.id, number: l.number, short: l.short, sections: l.sectionCount, url: l.url })),
});

module.exports = { find, sections, merge, wantsLaw, lawsNamed, promptBlock, verify, footer, libraryAnswer, summary, RULES, LAWS };
