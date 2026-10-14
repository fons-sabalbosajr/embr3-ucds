// ---------------------------------------------------------------------------
// Who may ask, and the terms they accept, on the public Document Portal.
//
// Two kinds of requester, two sets of terms:
//
//   An EMB Region III employee asks as part of their work. They accept the
//   Data Privacy terms only: what is done with their own details, and their
//   duty toward the personal information in the document.
//
//   Anyone else — a private citizen, a student, an employee of another
//   government agency — asks as a member of the public, under the people's
//   right to information (1987 Constitution, Art. III Sec. 7) as made to work
//   in the Executive Branch by Executive Order No. 2, s. 2016 (Freedom of
//   Information). EO 2 asks a requester for their name and contact details,
//   valid proof of identification, the information sought and the purpose;
//   gives the office 15 working days to answer (extendable by 20 for
//   extensive or voluminous records); lets it deny what falls under the
//   exceptions, in writing, with an appeal; and allows fees only for
//   reproduction. They accept the FOI terms AND the Data Privacy terms.
//
// The Data Privacy terms follow the Data Privacy Act of 2012 (Republic Act
// No. 10173) and its Implementing Rules: transparency, legitimate purpose
// and proportionality; what is collected and why; who sees it; and the data
// subject's rights.
//
// The text is served to the page from here (GET /api/portal/terms), so what
// a person reads and what the server records they accepted are one thing.
// Change the wording and change TERMS_VERSION: every request records the
// version it accepted.
// ---------------------------------------------------------------------------

const TERMS_VERSION = '2026-10-13.4';

const REQUESTER_TYPES = Object.freeze([
  {
    value: 'emb-employee',
    label: 'EMB Region III employee',
    designationLabel: 'Section, unit or division',
    designationHint: 'Start typing, then choose yours from the list.',
    designationPlaceholder: 'e.g. Planning and Information System Management Unit',
    public: false,
  },
  {
    value: 'government',
    label: 'Government employee (other agency)',
    designationLabel: 'Agency and office',
    designationHint: 'The agency, and the office or position you are with.',
    designationPlaceholder: 'e.g. Department of Health — Regional Office III, Sanitary Engineer',
    public: true,
  },
  {
    value: 'student',
    label: 'Student',
    designationLabel: 'School or university, and course',
    designationHint: 'Where you study, and your course or program.',
    designationPlaceholder: 'e.g. Bulacan State University — BS Environmental Science',
    public: true,
  },
  {
    value: 'citizen',
    label: 'Private citizen',
    designationLabel: 'Occupation or affiliation',
    designationHint: 'What you do, or the organization you are with, if any.',
    designationPlaceholder: 'e.g. Resident of San Fernando, Pampanga',
    public: true,
  },
]);

const TYPE_VALUES = REQUESTER_TYPES.map((t) => t.value);
const typeOf = (value) => REQUESTER_TYPES.find((t) => t.value === value) || null;
/** Anyone not employed by EMB Region III asks under FOI. */
const isPublicRequester = (value) => typeOf(value)?.public === true;

// Valid proof of identification (EO 2) a member of the public will show the
// Records Unit if asked. Only the kind is recorded, never the number.
const ID_TYPES = Object.freeze([
  'Philippine Identification (PhilSys) ID',
  'Passport',
  "Driver's license",
  'UMID / SSS ID',
  'PRC ID',
  'Postal ID',
  "Voter's ID or certification",
  'Senior citizen or PWD ID',
  'Government office ID',
  'School ID',
]);

const FOI_TERMS = Object.freeze({
  title: 'Freedom of Information (Executive Order No. 2, s. 2016)',
  intro:
    'You are asking for a record of the Environmental Management Bureau Region III as a member of the public, under the right to information ' +
    'guaranteed by the 1987 Constitution (Article III, Section 7) and Executive Order No. 2, series of 2016, which makes that right work in the Executive Branch.',
  items: [
    'Your request must state your name and contact details, describe the document you need, and give the purpose — this form asks for each. ' +
      'You must be able to show valid proof of identification; the office may ask you to present the ID you named before approving.',
    'The office answers your request within fifteen (15) working days. For extensive or voluminous records this may be extended by up to twenty (20) working days, and you will be told why.',
    'Access may be refused, wholly or in part, when the information falls under an exception recognized by the Constitution, by law or by jurisprudence — for example, personal information protected by the Data Privacy Act, or matters under investigation or adjudication. ' +
      'A refusal is given in writing with its reason, and you may appeal it as provided in the DENR People\'s FOI Manual.',
    'Approval may cover only some pages of a document. The rest are withheld, and only what was approved is shown to you.',
    'Viewing in this portal is free. Documents are shown for reading only, for the time approved; no copy is given here unless the office allows a download for your request. A certified copy, if you need one, is requested from the office unit that keeps the document and may carry reproduction fees.',
    'Once you first open the document, your access ends twenty-four (24) hours later — or sooner, if the approved time ends first.',
    'Use the information only for the purpose you stated. Do not alter it, misrepresent it, or present it as an official copy. ' +
      'The office may decline a request that repeats one already answered.',
    'Giving false information in this request may lead to its denial and to liability under the law.',
  ],
});

const PRIVACY_TERMS = Object.freeze({
  title: 'Data Privacy (Republic Act No. 10173, the Data Privacy Act of 2012)',
  intro:
    'EMB Region III processes the personal information in this request under the Data Privacy Act of 2012 and its Implementing Rules, following the principles of transparency, legitimate purpose and proportionality.',
  items: [
    'What we collect: your name, your designation (or school, agency or occupation), the purpose of your request, and — if you are not an EMB Region III employee — your contact details and the type of ID you will present. ' +
      'We also keep this computer\'s network address and the times you asked and viewed.',
    'Why: to identify you, to decide your request, to contact you about it, and to keep the record and audit trail the office is required to keep. It is not used for any other purpose.',
    'Who sees it: the unit that keeps the document (the Records Unit, Legal Services or the Laboratory), the officers who decide document access, and the system developer. Other people in the room never see your name or designation — only an unnamed seat and its clock.',
    'Every time you open the document, your name, designation, this computer\'s address and the time are recorded, so that any copy can be traced to the request it came from. The office may also print them on the pages.',
    'Messages you exchange with the office about your request are kept only for that conversation: they are deleted once it has been idle for twelve (12) hours. Do not send passwords or ID numbers in them.',
    'How long: the request and its log are kept as part of the office\'s records and disposed of securely when the retention period under the office\'s records rules ends.',
    'Your rights: you may ask to be informed about, to access, and to correct your personal information; to object to its processing or have it blocked or erased where the law allows; and to file a complaint with the National Privacy Commission. Contact the EMB Region III Data Protection Officer through the office.',
    'The document you view may itself contain personal information about others. You must not copy, photograph, share or disclose it, and must use it only for the purpose you stated. Unauthorized processing or disclosure of personal information is punishable under the Data Privacy Act.',
  ],
});

/** The terms a requester of this type must accept. */
function termsFor(type) {
  return isPublicRequester(type) ? ['foi', 'privacy'] : ['privacy'];
}

function publicTerms() {
  return {
    version: TERMS_VERSION,
    requesterTypes: REQUESTER_TYPES,
    idTypes: ID_TYPES,
    foi: FOI_TERMS,
    privacy: PRIVACY_TERMS,
  };
}

module.exports = { TERMS_VERSION, REQUESTER_TYPES, TYPE_VALUES, ID_TYPES, typeOf, isPublicRequester, termsFor, publicTerms };
