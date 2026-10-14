// ---------------------------------------------------------------------------
// VERA KNOWLEDGE BASE — E-Universe
//
// What VERA answers from. Everything here is how-to content about this
// application: no credentials, no environment values, no records, no live
// figures. It is sent to a third-party model when one is configured, so it
// must stay that way (tests/vera.test.js checks for secrets).
//
// Entry shape: { id, category, question, answer, keywords }
//   - `keywords` is what retrieval scores against. Use the words staff
//     actually type, not only the words on the screen; a missing keyword is
//     the usual reason an answerable question comes back "out of scope".
//     Keep them domain-bearing: a bare "who" or "how do i" makes unrelated
//     questions match.
//   - `answer` names the exact menu, screen, tab and button, in order. VERA
//     is told to be specific and can only be as specific as this text.
//
// Which corpus an article sits in is an access decision, not filing:
//   PUBLIC_KB   the sign-in pages — anyone, unidentified.
//   COMMON_KB   everyone signed in.
//   UCDS_KB     accounts with the UCDS domain (Planning).
//   ERMS_KB     accounts with the ERMS domain (Records, Legal, Laboratory).
//   ADMIN_KB    accounts with the admin domain.
//   DEV_KB      developer accounts only.
// Ported in approach from VERA in the EMB Region III DTRMS (embr3-hr-pms).
// ---------------------------------------------------------------------------

const ASSISTANT_NAME = 'VERA';
const ASSISTANT_FULL_NAME = 'Virtual Environmental Response Assistant';
const DEFAULT_SUPPORT = 'the E-Universe administrator (MIS)';
// Where a public visitor is sent for the office's figures (Admin Settings ›
// VERA Assistant › Office website overrides it).
const DEFAULT_OFFICE_WEBSITE = 'https://r3.emb.gov.ph';

/**
 * A public visitor asked for a number — how many documents, requests,
 * permits, people… VERA gives no counts to anyone who is not signed in
 * (she has none to give, and a figure without its context misleads): she
 * points them to the office's website instead. Staff get exact figures.
 */
const publicCountReply = (website, portal = false) =>
  "I don't give out counts or figures here. For the office's official numbers and reports, please visit the " +
  `**EMB Region III website: ${website}**.` +
  (portal ? '\n\nYour **own request** is always shown on this page, under **Your request**.' : '');

// Page key -> the label VERA uses when it says "go to …". The client sends a
// coarse key (front-end/src/api/veraService.js pageKeyFromPath), never a path
// with ids in it.
const PAGE_LABELS = Object.freeze({
  dashboard: 'Dashboard',
  province: 'Universe Central DB › Monitoring Plan (province)',
  'monitoring-plan': 'Universe Central DB › Monitoring Plan',
  datasets: 'Universe Central DB › year dataset',
  'year-select': 'Year container picker',
  report: 'Reports',
  'erms-dashboard': 'ERMS › Dashboard',
  'document-library': 'ERMS › Document Library',
  'record-detail': 'ERMS › record detail',
  'portal-desk': 'ERMS › Document Portal requests',
  archive: 'ERMS › Archive Boxes',
  'legal-dashboard': 'ERMS › Legal Services dashboard',
  'legal-documents': 'ERMS › Legal Services documents',
  'laboratory-dashboard': 'ERMS › Laboratory dashboard',
  'laboratory-documents': 'ERMS › Laboratory documents',
  'upload-tally': 'ERMS › Upload tally',
  storage: 'Storage',
  'settings-general': 'Settings › General',
  'settings-erms': 'Settings › ERMS',
  'settings-ucds': 'Settings › Universe Central DB',
  'admin-users': 'Admin Settings › User Accounts',
  'admin-sign-in-history': 'Admin Settings › Sign-in History',
  'admin-org-units': 'Admin Settings › Organizational Units',
  'admin-register': 'Admin Settings › Register',
  'admin-system': 'Admin Settings › System',
  'admin-erms-config': 'Admin Settings › ERMS Config',
  'admin-vera': 'Admin Settings › VERA Assistant',
  'admin-posting': 'Admin Settings › Post to Bulletin',
  'storage-config': 'Admin Settings › Storage Configuration',
});

// ── PUBLIC: the sign-in pages ────────────────────────────────────────────────
// The narrowest realm. The visitor is not signed in and not identified, so
// VERA has no account, no record and no data of any kind here. It explains
// how to get in, and nothing about the inside.

const PUBLIC_PAGE_LABELS = Object.freeze({
  signin: 'Sign in',
  login: 'Sign in',
  register: 'Request an account',
  'forgot-password': 'Forgot password',
  'reset-password': 'Reset password',
});

const SIGNIN_PAGES = Object.freeze(['signin', 'login', 'register', 'forgot-password', 'reset-password']);

const PUBLIC_GREETING_REPLY =
  `Hello! I'm ${ASSISTANT_NAME}. I can help you get into E-Universe — requesting an account, what happens while ` +
  `it waits for approval, signing in, and resetting a forgotten password.\n\n` +
  `I can't look up or confirm any account, and I'll never ask you for a password.`;

const PUBLIC_OUT_OF_SCOPE_REPLY =
  'On this page I can only help with getting into E-Universe — requesting an account, signing in and resetting a password. ' +
  'For anything else, sign in first or contact the administrator.';

const PUBLIC_CANNOT_VERIFY_REPLY =
  "I don't have anything that covers that, and I have no access to any account or record from this page. " +
  'Please contact the E-Universe administrator.';

const PUBLIC_NO_LOOKUP_REPLY =
  "I can't look that up. From this page I have no access to accounts, establishments, permits or documents, and that is deliberate — " +
  'it means nobody can use me to find out about a record or a member of staff.\n\n' +
  'Sign in to see what your account allows, or contact the administrator to have something checked.';

const PUBLIC_CREDENTIAL_REPLY =
  "Please don't share a password or a code here — I never need one and I can't act on it. " +
  'Nobody from EMB Region III will ask you for either. If that was a real password, change it as soon as you can sign in.';

const PUBLIC_ACCOUNT_PROBE_REPLY =
  "I can't tell you whether any particular account, username or email address exists, and I'm not given that information — deliberately. " +
  'Confirming which accounts are real would help someone guess their way in, so neither I nor the sign-in page will ever say.\n\n' +
  'What I can help with: how to request an account, what happens while a request is pending, and how to reset a forgotten password. ' +
  'If you need an account checked, contact the administrator — they can confirm who you are first.';

const PUBLIC_BLOCKED_REPLY =
  "That's inside E-Universe rather than on the sign-in page, so I can't help with it here. " +
  'Sign in first and ask me again — or contact the administrator.';

const PUBLIC_STARTER_QUESTIONS = Object.freeze([
  'How do I get an account?',
  'I forgot my password — how do I reset it?',
  'Can I sign in with my email address?',
  'Why does it say too many sign-in attempts?',
  'What happens after I request an account?',
]);

const PUBLIC_SCOPE_TERMS = Object.freeze([
  'sign in', 'signin', 'log in', 'login', 'logon', 'log on', 'account', 'register', 'registration',
  'request an account', 'request access', 'sign up', 'signup', 'username', 'user name', 'email',
  'password', 'forgot', 'reset', 'reset link', 'approval', 'approved', 'pending', 'locked',
  'too many attempts', 'attempts', 'browser', 'tab', 'session', 'e-universe', 'universe',
  'ucds', 'erms', 'access', 'new user', 'division', 'position', 'help', 'contact',
]);

/** Topics an unidentified visitor is kept away from entirely. */
const PUBLIC_BLOCKED_TERMS = Object.freeze([
  'establishment', 'establishments', 'register data', 'monitoring plan', 'permit', 'permits',
  'ecc', 'cnc', 'proponent', 'document library', 'record', 'records', 'scan', 'nas',
  'docket', 'notice of violation', 'test result', 'settings', 'permission', 'permissions',
  'database', 'user list', 'all users', 'other user', 'someone else', 'audit',
]);

const PUBLIC_KB = Object.freeze([
  {
    id: 'pub-what',
    category: 'About',
    question: 'What is E-Universe?',
    answer:
      'E-Universe is the EMB Region III information and records system. It brings together two things staff used separately:\n' +
      '- **Universe Central DB (UCDS)** — the Planning Unit\'s register of establishments, permits and monitoring.\n' +
      '- **ERMS** — the electronic records of the Records, Legal Services and Laboratory units, with their scanned documents.\n\n' +
      'You see the parts your account is set up for. Sign in to begin.',
    keywords: ['what is e-universe', 'e-universe', 'universe', 'what is this', 'ucds', 'erms', 'about', 'system'],
  },
  {
    id: 'pub-request-account',
    category: 'Accounts',
    question: 'How do I get an account?',
    answer:
      'From the sign-in page choose **Request an account**, then:\n' +
      '1. Enter your **name**, your **division / section**, your **position** and your **email address**.\n' +
      '2. Submit.\n\n' +
      'Your request waits for an **administrator to approve it**. Once it is approved, your account details are sent to the email address you gave. ' +
      'You do not choose a username or password on that form.',
    keywords: ['get an account', 'request an account', 'request access', 'register', 'registration', 'sign up', 'signup', 'new account', 'new user', 'create account', 'how do i join'],
  },
  {
    id: 'pub-pending',
    category: 'Accounts',
    question: 'What happens after I request an account?',
    answer:
      'The request is **pending** until an administrator reviews it in E-Universe. There is nothing more to do in the meantime, and submitting again does not speed it up.\n\n' +
      'When it is approved you receive an email with your account details. If you have waited longer than you expected, contact the administrator — ' +
      'they can see pending requests; I cannot.',
    keywords: ['pending', 'approval', 'approved', 'waiting', 'how long', 'after i request', 'still pending', 'not approved', 'no email', 'account details'],
  },
  {
    id: 'pub-sign-in',
    category: 'Signing in',
    question: 'How do I sign in?',
    answer:
      'On the sign-in page enter your **username or your email address** — either works, and capital letters do not matter — and your password, then press **Sign in**.\n\n' +
      'Depending on your account you then land on your dashboard, or on the **year picker** where you choose which year\'s data to work in (Planning accounts). ' +
      'Each browser tab keeps its own sign-in, so two tabs can be signed in as different accounts.',
    keywords: ['sign in', 'signin', 'log in', 'login', 'how do i sign in', 'email address', 'username', 'use my email', 'capital letters', 'year picker', 'tab'],
  },
  {
    id: 'pub-forgot',
    category: 'Signing in',
    question: 'I forgot my password — how do I reset it?',
    answer:
      'On the sign-in page choose **Forgot password**, then:\n' +
      '1. Enter the **email address registered on your account**.\n' +
      '2. Open the email and follow the **reset link** — it works once and expires after **one hour**.\n' +
      '3. Choose a new password, then sign in with it.\n\n' +
      'The page shows the same message whatever address you type, so it does not reveal which addresses have accounts. ' +
      'If no email arrives, check spam, then contact the administrator — the link only ever goes to the address already on the account.',
    keywords: ['forgot password', 'forgot', 'reset password', 'reset', 'reset link', 'new password', 'change password', 'cant sign in', 'password not working', 'link expired'],
  },
  {
    id: 'pub-too-many',
    category: 'Signing in',
    question: 'Why does it say "Too many sign-in attempts"?',
    answer:
      'After **20 failed attempts on one account within 15 minutes**, that account is paused for sign-in from your network for a while. ' +
      'This stops someone guessing a password. Wait about 15 minutes and try again, carefully — or use **Forgot password** if you are not sure of it.\n\n' +
      'Other people at the office are not affected by your attempts.',
    keywords: ['too many attempts', 'too many sign-in attempts', 'locked', 'locked out', 'blocked', 'wait 15 minutes', 'attempts', 'failed sign in'],
  },
  {
    id: 'pub-contact',
    category: 'Help',
    question: 'Who do I contact about my account?',
    answer:
      'Contact the **E-Universe administrator (MIS)**. They approve account requests, set which parts of the system an account can see, and can confirm who you are before checking an account.',
    keywords: ['contact', 'who do i contact', 'administrator', 'admin', 'mis', 'help desk', 'support', 'account problem'],
  },
]);

// ── PORTAL: the public Document Portal (/e-universe/document-portal) ─────────
// Still the public realm — the visitor is not signed in and not identified,
// and every public guard applies — but here the visitor came to ask for a
// scanned office document (a Records Unit permit, a Legal Services or a
// Laboratory document…), so documents and the room ARE the subject. VERA
// explains how the portal works; she cannot see any request, document or
// person in it, and gives a public visitor no counts.

const PORTAL_PAGE_LABELS = Object.freeze({ 'document-portal': 'Document Portal' });

// The first paragraph is her introduction on the page (VeraChat): short, and
// about every kind of document, not one unit's.
const PORTAL_GREETING_REPLY =
  `Hi! I'm ${ASSISTANT_NAME}, your Document Portal guide. 👋 I can help you find an EMB Region III document, request it, and read it here once it is approved.\n\n` +
  "I can't see anyone's request or any document, and I'll never ask for a password. What would you like to know?";

const PORTAL_OUT_OF_SCOPE_REPLY =
  'Here I can help with the Document Portal — finding a document, sending a request, the room and the waiting line, and reading an approved document. ' +
  'For anything else, please contact the EMB Region III office.';

const PORTAL_CANNOT_VERIFY_REPLY =
  "I don't have anything that covers that, and I can't see any request, document or person from here. " +
  'Please ask the office unit that keeps the document — they decide the requests.';

const PORTAL_NO_LOOKUP_REPLY =
  "I can't look up a request, a document or a person — I'm not given any of that, on purpose.\n\n" +
  '**Your own request** is shown on this page, under **Your request**, and it updates by itself the moment it is decided. ' +
  'If you need it checked, press **Messages** there to ask the unit that keeps the document.';

const PORTAL_BLOCKED_REPLY =
  "That's inside E-Universe rather than the Document Portal, so I can't help with it here. Please contact the EMB Region III office.";

const PORTAL_STARTER_QUESTIONS = Object.freeze([
  'How do I request a document?',
  'What is the room, and why is there a waiting line?',
  'How long until my request is approved?',
  'Why can I only see some pages?',
  'Can I download or print the document?',
]);

const PORTAL_SCOPE_TERMS = Object.freeze([
  'portal', 'document', 'documents', 'request', 'requests', 'ecc', 'reference', 'ref no', 'serial', 'project', 'project title',
  'permit', 'proponent', 'search', 'find', 'room', 'seat', 'seats', 'line', 'queue', 'waiting', 'wait', 'approve', 'approved',
  'approval', 'declined', 'decline', 'records unit', 'designation', 'purpose', 'duration', 'how long',
  'foi', 'freedom of information', 'privacy', 'data privacy', 'personal information', 'terms', 'consent', 'valid id', 'citizen',
  'student', 'employee', 'agency', 'school',
  'hours', 'pages', 'page', 'view', 'open', 'read', 'download', 'print', 'screenshot', 'watermark', 'expire', 'expired', 'time',
  'leave', 'cancel', 'notify', 'notification', 'name', 'privacy', 'help', 'contact', 'scan', 'pdf',
  'colour', 'color', 'kind', 'type', 'category', 'cnc', 'pto', 'hw', 'discharge', 'hazardous', 'certificate', 'copy', 'certified',
  'fee', 'free', 'cost', 'appeal', 'refused', 'denied', 'withdrawn', 'revoked', 'lapsed', 'ended', 'estimate', 'full', 'seated',
  'mistake', 'wrong', 'change', 'edit', 'error', 'load', 'hidden', 'dark', 'blank', 'tour', 'theme', 'light mode', 'phone', 'mobile',
  'browser', 'computer', 'come back', 'office hours', 'working days', 'vera', 'who are you', 'agree', 'tick', 'checkbox', 'private',
  '24 hours', 'extend', 'longer', 'chat', 'message', 'messages', 'reply', 'question', 'talk', 'conversation', 'weekend', 'weekends',
  'saturday', 'sunday', 'closed', 'open', 'monday', 'legal', 'laboratory', 'lab', 'docket', 'case', 'clearer', 'clear', 'blurry',
]);

/** Inside-the-system topics still kept from an unidentified visitor on the portal. */
const PORTAL_BLOCKED_TERMS = Object.freeze([
  'register data', 'monitoring plan', 'document library settings', 'settings', 'permission', 'permissions', 'database',
  'user list', 'all users', 'other user', 'someone else', 'audit', 'nas', 'share path', 'file path', 'server',
]);

const PORTAL_KB = Object.freeze([
  {
    id: 'portal-what',
    category: 'About',
    question: 'What is the Document Portal?',
    answer:
      'The **E-Universe Document Portal** is where anyone can ask EMB Region III for a scanned document — **Records Unit** permits and certificates, **Legal Services** cases and orders, and **Laboratory** reports — no E-Universe account needed. ' +
      'You send a request, the unit that keeps the document approves it for a set time, and you read the document **here, on this page**. ' +
      'The room is **closed on weekends**.',
    keywords: ['what is', 'portal', 'document portal', 'about', 'what is this', 'account needed', 'no account'],
  },
  {
    id: 'portal-how',
    category: 'Requesting',
    question: 'How do I request a document?',
    answer:
      '1. In **Find the document**, type its **reference or docket number** (an ECC or permit number, a Legal docket, a Laboratory reference) or part of its **title** (the company also works), then press **Select** on the right one.\n' +
      '2. Choose who you are requesting as (**EMB Region III employee**, **government employee of another agency**, **student** or **private citizen**), then fill in **Requester name**, **Designation**, the **Purpose of request** and the **Desired duration**. ' +
      'If you are not an EMB Region III employee, also give your **contact** and the **valid ID** you will present.\n' +
      '3. Read the terms and tick to accept them — **Data Privacy** for everyone, and **Freedom of Information** too if you are not an employee.\n' +
      '4. Press **Enter the room and send request**.\n\n' +
      'Your name then appears in the room, and the unit that keeps the document is told straight away.',
    keywords: ['how do i request', 'request a document', 'ask for', 'send request', 'steps', 'how to', 'get a document', 'find', 'search', 'ecc', 'project title', 'docket', 'reference number', 'title'],
  },
  {
    id: 'portal-find',
    category: 'Requesting',
    question: "I can't find the document I need.",
    answer:
      'Search with at least **two characters** of the **reference or docket number** or the **title** — part of either is enough, and capital letters do not matter. ' +
      'Only documents that already have a **scanned file** are listed. If it still does not show, the scan may not be filed yet: ask the office.',
    keywords: ['cant find', "can't find", 'not found', 'no document', 'not listed', 'search', 'no results', 'missing'],
  },
  {
    id: 'portal-designation',
    category: 'Requesting',
    question: 'What do I put in Designation?',
    answer:
      'First choose **who you are requesting as** — an **EMB Region III employee**, a **government employee of another agency**, a **student**, or a **private citizen**. Designation then asks for the right thing:\n' +
      '- **EMB Region III employee**: your section, unit or division, written in full — start typing and choose it from the list, e.g. *Planning and Information System Management Unit*.\n' +
      '- **Government employee (other agency)**: your agency and office.\n' +
      '- **Student**: your school or university, and your course.\n' +
      '- **Private citizen**: your occupation or affiliation.',
    keywords: ['designation', 'section', 'unit', 'division', 'office', 'requester type', 'who am i', 'employee', 'student', 'citizen', 'agency', 'school'],
  },
  {
    id: 'portal-foi',
    category: 'Requesting',
    question: 'I am not an EMB Region III employee — what do I need?',
    answer:
      'You ask as a member of the public, under the **Freedom of Information** order (**Executive Order No. 2, s. 2016**). The form then also asks for:\n' +
      '1. A **contact** — your email address or mobile number.\n' +
      '2. The **valid ID** you will present if the office asks (only the kind of ID is recorded, never its number).\n' +
      '3. Your agreement to the **Freedom of Information** and **Data Privacy** terms — read them on the form, then tick both boxes.\n\n' +
      'The office answers within **fifteen (15) working days**, which may be extended by up to twenty (20) for extensive or voluminous records. ' +
      'Access can be refused for information under an exception (for example, personal information protected by law); a refusal is in writing with its reason, and can be appealed.',
    keywords: ['foi', 'freedom of information', 'executive order', 'eo 2', 'not an employee', 'citizen', 'student', 'other agency', 'public', 'valid id', 'id', 'contact', 'working days', 'refused', 'exception', 'appeal'],
  },
  {
    id: 'portal-privacy',
    category: 'Privacy',
    question: 'What happens to my personal information?',
    answer:
      'It is handled under the **Data Privacy Act of 2012 (Republic Act No. 10173)**. The office keeps your name, designation, purpose — and, for the public, your contact and ID type — only to decide your request, contact you about it and keep the required record. ' +
      'Other people in the room never see your name or designation — only an unnamed seat and its clock. The unit that keeps the document and the system developer see who asked.\n\n' +
      'You may ask to see or correct your information, or object to its use, through the **EMB Region III Data Protection Officer** via the office, and you may complain to the **National Privacy Commission**. ' +
      'Every EMB Region III employee accepts the Data Privacy terms too; everyone else also accepts the FOI terms.',
    keywords: ['privacy', 'data privacy', 'personal information', 'ra 10173', 'republic act', 'my data', 'who sees', 'national privacy commission', 'npc', 'data protection officer', 'consent', 'terms'],
  },
  {
    id: 'portal-duration',
    category: 'Requesting',
    question: 'How long should I ask for?',
    answer:
      'Pick a time from the list, or choose **Custom** and enter hours or days — anything from 15 minutes to 30 days. Ask only for what the purpose needs: the office may approve a shorter time.\n\n' +
      'If you are **not an EMB Region III employee**, **three (3) days is the recommended maximum** — longer requests are more likely to be questioned or shortened. ' +
      'Remember that once you first open the document, your access ends 24 hours later anyway.',
    keywords: ['duration', 'how long', 'desired duration', 'custom', 'days', 'hours', '3 days', 'three days', 'longer', 'extend'],
  },
  {
    id: 'portal-room',
    category: 'The room',
    question: 'What is the room, and why is there a waiting line?',
    answer:
      'The **room** holds up to **50 people** at a time — everyone waiting for a decision or reading an approved document. ' +
      "Each seat shows only a clock — other visitors never see anyone's name, designation, document or purpose; you see your own seat marked **You**.\n\n" +
      'When the room is full, a new request joins the **waiting line**, with an estimate of how long until a seat frees. ' +
      'You are **seated automatically** when one does, and the office is told then.',
    keywords: ['room', 'waiting line', 'line', 'queue', 'full', 'seat', 'seats', '50', 'wait', 'position', 'estimate', 'my turn'],
  },
  {
    id: 'portal-approval',
    category: 'Approval',
    question: 'How long until my request is approved?',
    answer:
      'The **unit that keeps the document** decides each request, during office hours — there is no fixed time. **This page updates by itself** the moment they decide, ' +
      'and if you allowed notifications you also get one on your computer.\n\n' +
      'If nobody decides within **a day**, the request lapses and your seat goes to the next person; you may simply ask again.',
    keywords: ['how long', 'approved', 'approval', 'when', 'waiting for', 'decision', 'decide', 'pending', 'awaiting', 'lapsed', 'notify', 'notification'],
  },
  {
    id: 'portal-declined',
    category: 'Approval',
    question: 'My request was declined — what now?',
    answer:
      'The office may add a **note** saying why; it shows on this page. You may send a **new request**, with more detail in the purpose — or ask the office directly.',
    keywords: ['declined', 'decline', 'denied', 'rejected', 'withdrawn', 'ended my access'],
  },
  {
    id: 'portal-viewing',
    category: 'Reading',
    question: 'How do I read the document once it is approved?',
    answer:
      'Under **Your request** press **Open document**. It opens here, on this page, for the time approved — the clock shows how long is left, and the document **closes by itself** when it runs out.\n\n' +
      '**The first time you open it, your access is set to end 24 hours later** (or sooner, if the approved time ends first) — so open it when you are ready to read.\n\n' +
      'Open it from the same computer and browser you asked from: the request belongs to that browser.',
    keywords: ['open', 'read', 'view', 'approved', 'open document', 'how do i see', 'where is my document', 'another computer', 'browser'],
  },
  {
    id: 'portal-pages',
    category: 'Reading',
    question: 'Why can I only see some pages?',
    answer:
      'The office can approve **all pages** or only **some** of them — just what your purpose needs. The pages not approved are not sent to your browser at all. ' +
      'If you need more, send a new request saying which pages and why.',
    keywords: ['pages', 'some pages', 'only some', 'missing pages', 'more pages', 'whole document', 'all pages'],
  },
  {
    id: 'portal-no-download',
    category: 'Reading',
    question: 'Can I download or print the document?',
    answer:
      'Normally no — documents in the portal are **view only**: there is no download, print or copy, and the document is hidden when you switch to another window. ' +
      'If you truly need the file, ask the office: only the system developer can turn on a **Download** button for a request. ' +
      'The pages are shown **clean, without a watermark**, so they are easy to read — please do not photograph or screenshot them; every opening is recorded. ' +
      'If you need an official copy, ask the office.',
    keywords: ['download', 'print', 'save', 'copy', 'screenshot', 'photo', 'pdf', 'watermark', 'official copy', 'hidden', 'clear', 'clearer', 'blurry', 'name on the page'],
  },
  {
    id: 'portal-leave',
    category: 'The room',
    question: 'How do I leave or cancel my request?',
    answer:
      'Under **Your request** press **Leave the room** (or **Leave the line**). Your seat goes to the next person. If you had an approved document, it closes, and you would need to ask again.',
    keywords: ['leave', 'cancel', 'withdraw', 'stop', 'remove my request', 'leave the room', 'leave the line'],
  },
  {
    id: 'portal-one',
    category: 'Requesting',
    question: 'Can I ask for more than one document?',
    answer:
      'One request at a time from a browser. When it ends — or after you leave the room — you can ask for the next document.',
    keywords: ['more than one', 'two documents', 'another document', 'second request', 'multiple', 'already have a request'],
  },
  {
    id: 'portal-kinds',
    category: 'Finding a document',
    question: 'What are the colours and kinds of document in the search?',
    answer:
      'Matches are grouped by the law each document is issued under, in the same colours the office uses for those laws:\n' +
      '- **PD 1586 · ECC** (teal) — Environmental Compliance Certificates\n' +
      '- **PD 1586 · CNC** (amber) — Certificates of Non-Coverage\n' +
      '- **RA 8749 · PTO** (purple) — Permits to Operate (air)\n' +
      '- **RA 9275 · DP** (red) — Discharge Permits (water)\n' +
      '- **RA 6969 · HW** (green) — Hazardous Waste Generator Registrations\n' +
      '- **Other** (brown) — other Records Unit documents\n' +
      '- **Legal Services** (blue) — cases, orders, resolutions and other legal documents\n' +
      '- **Laboratory** (pink) — laboratory reports and results\n\n' +
      'Press a chip above the results to show only that kind.',
    keywords: ['colour', 'color', 'colours', 'colors', 'kind', 'kinds', 'type', 'types', 'category', 'categories', 'group', 'cnc', 'pto', 'discharge', 'hazardous', 'hw', 'pd 1586', 'ra 8749', 'ra 9275', 'ra 6969', 'chip', 'filter', 'legal', 'laboratory', 'lab'],
  },
  {
    id: 'portal-doc-terms',
    category: 'Finding a document',
    question: 'What are an ECC, a CNC, a PTO, a DP and an HW registration?',
    answer:
      '- **ECC** — *Environmental Compliance Certificate*, issued under the EIS System (PD 1586) for projects that need one.\n' +
      '- **CNC** — *Certificate of Non-Coverage*, also under PD 1586, for projects found not to need an ECC.\n' +
      '- **PTO** — *Permit to Operate* air pollution sources, under the Clean Air Act (RA 8749).\n' +
      '- **DP** — *Discharge Permit* for wastewater, under the Clean Water Act (RA 9275).\n' +
      '- **HW** — *Hazardous Waste Generator Registration*, under RA 6969.\n\n' +
      'Each shows in its own colour in the search results.',
    keywords: ['what is an ecc', 'what is a cnc', 'what is cnc', 'what is ecc', 'what is pto', 'what is a pto', 'what is dp', 'non-coverage', 'compliance certificate', 'permit to operate', 'discharge permit', 'hazardous waste generator', 'meaning', 'stands for', 'cnc', 'ecc'],
  },
  {
    id: 'portal-ecc-number',
    category: 'Finding a document',
    question: 'What is the reference number, and where do I find it?',
    answer:
      'It is the number printed on the document itself — an ECC or permit number (e.g. *ECC-OL-R03-2017-0370*), a Legal Services docket number, or a Laboratory reference number. ' +
      'You can type all of it or just part of it (the year and the last digits usually find it), or search by the **title** instead. ' +
      'Each document in the portal is named by its reference number and its title.',
    keywords: ['ecc reference', 'reference number', 'ref no', 'ecc number', 'where do i find', 'what is the ecc', 'permit number', 'certificate number'],
  },
  {
    id: 'portal-terms-step',
    category: 'Requesting',
    question: 'Why do I have to agree to terms before sending?',
    answer:
      'When you press **Enter the room and send request**, the terms open one step at a time — **Freedom of Information** then **Data Privacy** if you are not an EMB Region III employee, **Data Privacy** only if you are. ' +
      'Scroll each to the end, tick the box, and press **I agree**; the request is sent after the last step. ' +
      'This is required: the office records which terms you accepted, and when. Press **Cancel** to go back and change your details.',
    keywords: ['terms', 'agree', 'i agree', 'checkbox', 'tick', 'cannot tick', "can't tick", 'scroll', 'modal', 'consent', 'why agree', 'terms and conditions', 'greyed', 'disabled'],
  },
  {
    id: 'portal-24h',
    category: 'Reading',
    question: 'Why did my access change to 24 hours after I opened the document?',
    answer:
      'Once you **first open** a document, your access ends **24 hours later** — or sooner, if the approved time ends first. The page tells you the new end time. ' +
      'So open it when you are ready to read. If you need longer after that, ask the office.',
    keywords: ['24 hours', '24 hrs', 'twenty-four', 'first open', 'opened', 'changed', 'shorter', 'cut', 'reduced', 'ends sooner', 'why did my time'],
  },
  {
    id: 'portal-estimate',
    category: 'The room',
    question: 'How is the waiting time estimated?',
    answer:
      'From the seats in the room: each approved seat frees when its time ends, and a seat still waiting for a decision is counted as if approved now for the time it asked. ' +
      'Your place in line takes the next seat to free. It is an **estimate** — it changes when people leave, are declined or are approved for a different time — and the page updates it by itself.',
    keywords: ['estimate', 'estimated', 'how long wait', 'waiting time', 'when will i be seated', 'my turn', 'position', 'line', 'eta'],
  },
  {
    id: 'portal-ended',
    category: 'Approval',
    question: 'My access ended early, or my request disappeared — why?',
    answer:
      'A request can end in a few ways, and the page says which:\n' +
      '- **Expired** — the approved time ran out (or 24 hours passed since you first opened it).\n' +
      '- **Withdrawn** — the office ended your access early; any note they left is shown.\n' +
      '- **Declined** — the request was not approved.\n' +
      '- **Lapsed** — nobody decided within a day, so your seat went to the next person.\n' +
      '- **Left** — you left the room or the line.\n\n' +
      'In every case you may send a new request.',
    keywords: ['ended', 'ended early', 'withdrawn', 'revoked', 'disappeared', 'gone', 'lapsed', 'expired', 'closed', 'kicked out', 'removed', 'why did it end'],
  },
  {
    id: 'portal-come-back',
    category: 'The room',
    question: 'Do I have to keep the page open? Can I come back later?',
    answer:
      'You may close the page and come back **on the same computer and browser** — your request is still there. It belongs to that browser, so another computer will not see it. ' +
      'Press **Notify me on this computer** to get a notification the moment the office decides, even when the page is in the background.',
    keywords: ['keep the page open', 'come back', 'close the page', 'later', 'another computer', 'other browser', 'phone', 'notify', 'notification', 'alert', 'lost my request', 'refresh'],
  },
  {
    id: 'portal-hidden',
    category: 'Reading',
    question: 'Why does the document go dark or hide?',
    answer:
      'To protect it, the document is **hidden whenever this window is not in front** — for example when you switch to another program or press Print Screen. ' +
      'Click the page to continue reading. Copying, printing and right-click are also turned off.',
    keywords: ['dark', 'hidden', 'hides', 'blank', 'black', 'covered', 'switch window', 'print screen', 'screenshot', 'cannot see', 'disappears when'],
  },
  {
    id: 'portal-trouble',
    category: 'Help',
    question: 'The document will not open or the page shows an error.',
    answer:
      '1. **Reload** the page — your request is kept.\n' +
      '2. If it says scanned documents are **turned off** or the share **cannot be reached**, the office\'s storage is unavailable for the moment; try again later.\n' +
      '3. If it says the time is **over**, your access has ended — send a new request.\n\n' +
      'If it keeps happening, tell the office what the message says.',
    keywords: ['error', 'not open', "won't open", 'will not open', 'does not load', 'not loading', 'blank page', 'stuck', 'problem', 'broken', 'failed', 'turned off', 'unavailable'],
  },
  {
    id: 'portal-copy',
    category: 'Reading',
    question: 'How do I get a copy, or a certified copy?',
    answer:
      'The portal is for **reading** the document. For a **certified copy**, request it from the **office unit that keeps it** directly; reproduction may have a fee. ' +
      'Only when the office allows it for your request does a **Download** button appear here.',
    keywords: ['copy', 'certified', 'certified true copy', 'hard copy', 'photocopy', 'official copy', 'get the file', 'fee', 'fees'],
  },
  {
    id: 'portal-free',
    category: 'Requesting',
    question: 'Is it free? When will my request be answered?',
    answer:
      'Reading a document in the portal is **free**. The office decides requests during **office hours**; under the Freedom of Information order they answer within **15 working days**, ' +
      'extendable by up to 20 for extensive or voluminous records. Most requests are decided much sooner.',
    keywords: ['free', 'cost', 'pay', 'payment', 'fee', 'office hours', 'when', 'how fast', 'working days', 'weekend', 'holiday'],
  },
  {
    id: 'portal-appeal',
    category: 'Approval',
    question: 'Can I appeal a refusal?',
    answer:
      'Yes — a refusal under the Freedom of Information order is given in writing with its reason, and may be **appealed** as provided in the **DENR People\'s FOI Manual**. ' +
      'Ask the office how to file it. You may also simply send a new request with more detail in the purpose.',
    keywords: ['appeal', 'refused', 'refusal', 'denied', 'complain', 'complaint', 'unfair'],
  },
  {
    id: 'portal-change',
    category: 'Requesting',
    question: 'I made a mistake in my request — can I change it?',
    answer:
      'A sent request cannot be edited. **Leave the room** (under Your request), then send a new one with the right details. ' +
      'If you were already approved, leaving ends that access, so you will need a new approval.',
    keywords: ['mistake', 'wrong', 'typo', 'change my request', 'edit', 'correct', 'wrong name', 'wrong document', 'wrong duration', 'update my request'],
  },
  {
    id: 'portal-names',
    category: 'Privacy',
    question: 'Can other people see my name or what I asked for?',
    answer:
      'No. Other visitors see each seat only as **Private seat** with a clock — never a name, designation, document or purpose. You see your own seat marked **You**. ' +
      'Only the unit that keeps the document and the system developer see who asked for what.',
    keywords: ['see my name', 'other people', 'who can see', 'private seat', 'anonymous', 'privacy', 'visible', 'others see'],
  },
  {
    id: 'portal-full',
    category: 'The room',
    question: 'The room is full — what happens?',
    answer:
      'Send your request anyway: you join the **waiting line** with an estimate of when a seat frees, and you are **seated automatically** — the office is told then. ' +
      'You can leave the line at any time.',
    keywords: ['full', 'room is full', '50', 'no seat', 'no space', 'waiting line', 'queue'],
  },
  {
    id: 'portal-page-help',
    category: 'Help',
    question: 'How do I see the tour again, or switch to dark mode?',
    answer:
      'Press **Take the tour** at the top right to walk through the portal again. The **sun / moon** button beside it switches between light and dark mode. ' +
      'If you ticked **Don\'t show again**, the tour no longer opens by itself on this browser — the button still works.',
    keywords: ['tour', 'take the tour', 'guide', 'walkthrough', "don't show again", 'dark mode', 'light mode', 'theme', 'night mode'],
  },
  {
    id: 'portal-phone',
    category: 'Help',
    question: 'Can I use the portal on my phone?',
    answer:
      'Yes, the portal works on a phone browser. Keep using the **same phone and browser** for your request — it belongs to the browser it was sent from — and remember that documents are shown for reading only.',
    keywords: ['phone', 'mobile', 'cellphone', 'tablet', 'android', 'iphone'],
  },
  {
    id: 'portal-vera',
    category: 'Help',
    question: 'Who are you?',
    answer:
      `I'm ${ASSISTANT_NAME}, your guide to the E-Universe Document Portal. I explain how to find a document, send a request, wait in the room and read an approved document. ` +
      "I can't see anyone's request or any document, and I'll never ask for a password.",
    keywords: ['who are you', 'what are you', 'vera', 'your name', 'are you a bot', 'are you human', 'assistant'],
  },
  {
    id: 'portal-contact',
    category: 'Help',
    question: 'Who do I contact about a document?',
    answer:
      'The unit that keeps the document decides your request — the **Records Unit**, **Legal Services** or the **Laboratory**. ' +
      'Once you have sent a request you can **message them right here**: press **Messages** under Your request.',
    keywords: ['contact', 'who do i contact', 'records unit', 'help', 'support', 'ask someone'],
  },
  {
    id: 'portal-chat',
    category: 'Help',
    question: 'Can I message the office about my request?',
    answer:
      'Yes. Once you have sent a request, press **Messages** under **Your request** to talk with the staff who decide it — they can ask you a question, and you can answer or ask yours. ' +
      'A red badge shows new replies, and the page updates by itself.\n\n' +
      'The conversation is **temporary**: if nobody writes for **12 hours**, it is deleted. Do not send passwords, ID numbers or other sensitive details.',
    keywords: ['chat', 'message', 'messages', 'reply', 'talk', 'conversation', 'ask a question', 'question from', 'contact', 'deleted', '12 hours', 'idle', 'temporary'],
  },
  {
    id: 'portal-weekend',
    category: 'The room',
    question: 'Is the portal open on weekends?',
    answer:
      'The room is **closed on Saturdays and Sundays** (Philippine time): new requests cannot be sent and documents cannot be opened until **Monday**. ' +
      'A request already waiting keeps its place — weekend days do not count against the one day the office has to decide it. The page shows when the room opens again.',
    keywords: ['weekend', 'weekends', 'saturday', 'sunday', 'closed', 'room closed', 'when open', 'opens', 'monday', 'holiday'],
  },
  {
    id: 'portal-legal-lab',
    category: 'Finding a document',
    question: 'Can I ask for Legal Services or Laboratory documents?',
    answer:
      'Yes. The search covers **Records Unit** documents (by ECC or permit reference number and project title), **Legal Services** documents (by docket or reference number and title) and **Laboratory** documents (by reference number and title). ' +
      'Each kind has its own colour in the results, and the request goes to the unit that keeps the document.',
    keywords: ['legal', 'legal services', 'laboratory', 'lab', 'docket', 'case', 'order', 'resolution', 'lab result', 'analysis', 'other documents', 'all documents'],
  },
]);

// ── STAFF: shared by every signed-in account ────────────────────────────────

const GREETING_REPLY =
  `Hello! I'm ${ASSISTANT_NAME}, the E-Universe assistant. I can tell you where things are and how they work — ` +
  `the register and its provinces, the document library, filing a scan, document requests, settings and more.\n\nWhat are you trying to do?`;

const OUT_OF_SCOPE_REPLY =
  'I can only help with E-Universe — the Universe Central DB register, the ERMS document library and units, and the settings and screens around them. ' +
  "I can't help with that topic.";

const CANNOT_VERIFY_REPLY =
  "I don't have anything in my help library that covers that, and I can't see records, so I'd rather not guess. " +
  'Tell me which screen you are on and what you are trying to do and I will point you to the right place — or ask the administrator.';

const COMMON_KB = Object.freeze([
  {
    id: 'nav-overview',
    category: 'Navigation',
    question: 'What is in E-Universe and where is everything?',
    answer:
      'The menu on the left shows what your account may use:\n' +
      '- **Dashboard** — your starting screen.\n' +
      '- **Universe Central DB** (Planning) — the register by year: the Monitoring Plan per province and the year\'s other datasets.\n' +
      '- **ERMS** (Records, Legal Services, Laboratory) — the Document Library, filing, document requests and archive boxes.\n' +
      '- **Storage** — shared storage containers, where your account has been given one.\n' +
      '- **Settings** — your own appearance, and your unit\'s working rules.\n' +
      '- **Admin Settings** — accounts and configuration, for administrators.\n\n' +
      'A section missing from your menu means your account does not have it; ask the administrator if it should.',
    keywords: ['navigate', 'where is', 'menu', 'overview', 'what can i do', 'getting started', 'sections', 'sidebar', 'modules', 'missing menu'],
  },
  {
    id: 'appearance',
    category: 'Settings',
    question: 'How do I change the theme, colours or text size?',
    answer:
      'Go to **Settings › General**. It has three tabs:\n' +
      '1. **Theme & colour** — light or dark, and the accent colour.\n' +
      '2. **Navigation** — how the sidebar and header take the accent.\n' +
      '3. **Layout & density** — content background, corners, and **Density** (text size and control height).\n\n' +
      'Your choice is saved on your account, so it follows you to any computer. **Reset appearance** puts everything back.',
    keywords: ['theme', 'dark mode', 'light mode', 'colour', 'color', 'accent', 'appearance', 'text size', 'font size', 'density', 'general settings'],
  },
  {
    id: 'tabs-sessions',
    category: 'Signing in',
    question: 'Why am I signed out, or signed in as someone else in another tab?',
    answer:
      'Each browser tab keeps **its own sign-in**. Signing in in one tab does not change another, so two tabs can be different accounts — handy for checking what a role sees. ' +
      'A sign-in lasts about a day; after that you are asked to sign in again.\n\n' +
      'To sign out, open your **avatar** at the top right and choose **Sign out**. It signs out that tab.',
    keywords: ['signed out', 'sign out', 'log out', 'logout', 'another tab', 'other tab', 'session', 'expired', 'different account', 'tabs'],
  },
  {
    id: 'nas-banner',
    category: 'Storage',
    question: 'What does "NAS not connected" mean?',
    answer:
      'Scanned documents live on the office **NAS**, which the server reaches through the office server. When that link is down the banner under the header says so, ' +
      'and documents cannot be opened or filed until it is back. **Everything else keeps working** — searching, records, the register.\n\n' +
      'It is usually the office server being off (it runs on weekdays) or the network. It is not something you caused, and it affects everyone: tell IT if it lasts.',
    keywords: ['nas', 'nas not connected', 'not connected', 'cannot open document', 'document unavailable', 'share', 'banner', 'offline', 'files not available'],
  },
  {
    id: 'online-users',
    category: 'Navigation',
    question: 'How does the online users list work?',
    answer:
      'The list shows who is signed in now, most recent first, then people who have signed out. It updates **as soon as someone signs in or out** — you do not need to refresh.',
    keywords: ['online users', 'who is online', 'signed in users', 'online list', 'active users'],
  },
  {
    id: 'vera-self',
    category: 'Help',
    question: 'What can VERA do and what can it see?',
    answer:
      `${ASSISTANT_NAME} explains how E-Universe works and where things are. It answers from a built-in help library, and phrases the answer conversationally when an AI model is switched on.\n\n` +
      `It **cannot see any record, establishment, permit or document**, so it never quotes one — check the screen itself for those. ` +
      'Only your question, the recent conversation and the name of the screen you are on are sent; your questions are not stored.',
    keywords: ['vera', 'assistant', 'what can you do', 'what can vera do', 'chatbot', 'ai', 'help', 'privacy', 'what do you see'],
  },
]);

// ── UCDS: Planning, the register ─────────────────────────────────────────────

const UCDS_KB = Object.freeze([
  {
    id: 'ucds-year',
    category: 'Universe Central DB',
    question: 'What are the year containers and how do I switch year?',
    answer:
      'The register is kept per year — **2024 Data**, **2025 Data** and so on. You choose one on the **year picker** after signing in, and switch at any time with the **year switcher** in the header.\n\n' +
      'You only see the years assigned to your account. A year can be **locked** (listed but not enterable) or not yet open; ask the administrator if one you need is missing.',
    keywords: ['year', 'year container', 'switch year', 'change year', 'year picker', 'year switcher', '2024 data', '2025 data', 'year locked', 'no year'],
  },
  {
    id: 'ucds-monitoring-plan',
    category: 'Universe Central DB',
    question: 'Where is the register of establishments?',
    answer:
      'Open **Universe Central DB › [year] › Monitoring Plan** and choose a **province**. The province screen lists its establishments; open one to see and edit its details across the tabs ' +
      '(general information, permits, monitoring, legal and the rest).\n\n' +
      'You see only the provinces your account is given. **View** access lets you look; **edit** access is needed to change a record.',
    keywords: ['register', 'establishment', 'establishments', 'monitoring plan', 'province', 'provinces', 'firm', 'firms', 'bataan', 'pampanga', 'bulacan', 'aurora', 'tarlac', 'zambales', 'nueva ecija', 'find establishment'],
  },
  {
    id: 'ucds-edit',
    category: 'Universe Central DB',
    question: 'How do I add or edit an establishment?',
    answer:
      'In **Universe Central DB › Monitoring Plan › [province]**:\n' +
      '- **Edit** — open the establishment, change the fields on the relevant tab, and save. Every change is kept in the record\'s history.\n' +
      '- **Add** — use the add action on the province screen; the next ID for that province is assigned for you.\n\n' +
      'You need **edit access** to that province. Changes show for everyone straight away.',
    keywords: ['add establishment', 'new establishment', 'edit establishment', 'update', 'change details', 'edit record', 'save changes', 'history', 'next id'],
  },
  {
    id: 'ucds-data-issues',
    category: 'Data quality',
    question: 'What is the number on the bell?',
    answer:
      'The bell counts register records that need attention: establishments with **required details missing** (for example PSIC code, coordinates, PCO, permit numbers) ' +
      'and **ECC/CNC numbers that appear on more than one establishment**. Only provinces you can edit are counted.\n\n' +
      'Fix the record on its province screen; the count updates after the next check.',
    keywords: ['bell', 'notifications', 'notification', 'data issues', 'missing data', 'missing fields', 'incomplete', 'warnings', 'duplicate ecc', 'needs attention', '99+'],
  },
  {
    id: 'ucds-duplicates',
    category: 'Data quality',
    question: 'How do I deal with duplicate ECC/CNC numbers?',
    answer:
      'An ECC or CNC number should belong to one establishment. When the same number appears on several, they show as **warnings on the bell**, and administrators can reconcile them under ' +
      '**Admin Settings › Register › Duplicates**.\n\n' +
      'Check which establishment the permit really belongs to before changing anything — a duplicate is sometimes an amendment filed as a new record.',
    keywords: ['duplicate', 'duplicates', 'ecc', 'cnc', 'same permit', 'permit number twice', 'reconcile', 'merge'],
  },
  {
    id: 'ucds-permit-monitoring',
    category: 'Dashboard',
    question: 'How does Permit Monitoring on the dashboard work?',
    answer:
      'The **Permit Monitoring** list on the dashboard shows establishments whose permits are **expired or near expiry**. It works the expiry out from the dates on the record:\n' +
      '- **PTO** — two years from the date issued.\n' +
      '- **WWDP** — one year from the date issued.\n' +
      '- **PCO** — the validity date on the record.\n\n' +
      'A wrong expiry almost always means a wrong or missing date on the establishment — correct it there.',
    keywords: ['permit monitoring', 'expired', 'expiry', 'near expiry', 'pto', 'wwdp', 'pco', 'permit expiration', 'dashboard permits'],
  },
  {
    id: 'ucds-calendar',
    category: 'Dashboard',
    question: 'What is the Monitoring Calendar?',
    answer:
      'The **Monitoring Calendar** on the dashboard places establishments on the dates they were monitored, by month or by year, so you can see the inspection workload at a glance.',
    keywords: ['monitoring calendar', 'calendar', 'date monitored', 'inspection', 'schedule'],
  },
  {
    id: 'ucds-datasets',
    category: 'Universe Central DB',
    question: 'What are the other tables under a year?',
    answer:
      'Besides the Monitoring Plan, each year can hold other datasets — the spreadsheets kept for that year (surveys, healthcare, chemicals and similar). ' +
      'They appear under **Universe Central DB › [year]**. Folders and tables added by your team appear there too.',
    keywords: ['datasets', 'dataset', 'tables', 'spreadsheet', 'survey', 'healthcare', 'chemicals', 'year folder', 'custom table', 'folder'],
  },
  {
    id: 'ucds-erms-panel',
    category: 'Cross-domain',
    question: 'Can I see the ERMS documents of an establishment?',
    answer:
      'Yes, by request. On an establishment, the **records panel** lists the ERMS records filed against it. Only the Records Unit opens a scan inside E-Universe; ' +
      'anyone else presses **Request in the Document Portal** and reads it there, view-only, once the unit that keeps it approves.',
    keywords: ['erms documents', 'documents of establishment', 'records panel', 'request document', 'see scan', 'ecc document', 'permit document', 'approval'],
  },
]);

// ── ERMS: Records, Legal Services, Laboratory ───────────────────────────────

const ERMS_KB = Object.freeze([
  {
    id: 'erms-move-scan',
    units: ['records'],
    category: 'ERMS',
    question: 'A scan is filed against the wrong record. How do I move it?',
    answer:
      'The **Developer** or an **administrator** moves it. Open the record that holds the scan (Document Library → the record), go to its **Document** tab and press ' +
      '**Move scan to another record**. I list where it probably belongs: records whose permit number is in the file name, or whose proponent and project share its words, ' +
      'those without a scan of their own first. Pick one, or type the FSN, and press **Move**. The file stays where it is on the share; only the record it is filed against ' +
      'changes, and both records note the move in their history. A record that already has a scan cannot take another: move that one away first. ' +
      'Anyone else: ask the Developer or an administrator, with the two FSNs.',
    keywords: ['move scan', 'move file', 'wrong record', 'transfer document', 'reassign scan', 'filed wrong', 'move document', 'misfiled', 'transfer file'],
  },
  {
    id: 'erms-library',
    units: ['records'],
    category: 'ERMS',
    question: 'How do I find a record in the Document Library?',
    answer:
      'Open **ERMS › Document Library**. The search box matches the **FSN serial**, the **permit number**, the **proponent** and the **project title** — partial text works.\n\n' +
      'Narrow with the filters beside it: permit type, province, link to the register, uploaded by, and **Needs review**. Double-click a row, or use **View**, to open the record.\n\n' +
      'You only see your provinces. A record you cannot see reports "not found" rather than "not allowed" — if one is missing, it is an access question for the administrator; do not re-create it.',
    keywords: ['document library', 'find record', 'search record', 'search', 'fsn', 'serial', 'permit number', 'proponent', 'project title', 'filter', 'records list', 'not found'],
  },
  {
    id: 'erms-upload',
    units: ['records'],
    category: 'ERMS',
    question: 'How do I upload (file) a new record?',
    answer:
      'Choose **Upload record** in the menu (or in the Document Library). The window shows the **next FSN**, claimed when you save. Then, using **Next** and **Back** or the tabs:\n' +
      '1. **Proponent & permit** — proponent, project title, permit type and number, dates, project type. Proponent and project title suggest names already on file; pick one to keep the spelling consistent.\n' +
      '2. **Location** — province, city and barangay.\n' +
      '3. **Document** — drag the scan in. It is filed on the share under province, year and project, like the desktop system did; **Location on the share** lets you choose an existing folder.\n' +
      '4. **Upload record and scan** (or **Save record** to file the scan later).\n\n' +
      'The permit number is checked as you type and tells you which establishment it links to. A permit number already filed is flagged — find the existing record first.',
    keywords: ['upload', 'upload record', 'file record', 'new record', 'add record', 'scan', 'file a scan', 'next fsn', 'serial number', 'proponent', 'permit number', 'folder', 'location on the share'],
  },
  {
    id: 'erms-open-document',
    category: 'ERMS',
    question: 'How do I open a scanned document?',
    answer:
      'Open the record and choose **Open document**. It opens in a viewer on the page; large scans load as you scroll. Documents are **view-only** — there is no download.\n\n' +
      'If it will not open, the message says why: no scan was filed; the file is not where the record says (report it, do not delete the record); or the NAS cannot be reached (tell IT — it affects everyone).',
    keywords: ['open document', 'view document', 'scan', 'pdf', 'cannot open', 'not on the share', 'download', 'viewer', 'document will not open'],
  },
  {
    id: 'erms-requests',
    category: 'ERMS',
    question: 'How does someone outside the unit get a document?',
    answer:
      'Through the **E-Universe Document Portal** (/e-universe/document-portal). Staff outside the unit, other agencies, students and citizens ask there; the unit that keeps the document — Records, Legal Services or Laboratory — decides under **ERMS › Document Portal**, where it can also **message** the requester. ' +
      'There is no separate request inbox inside ERMS any more.',
    keywords: ['document requests', 'access request', 'request access', 'approve request', 'approval', 'decline', 'share document', 'pending requests', 'portal', 'document portal'],
  },
  {
    id: 'erms-tracking',
    units: ['records'],
    category: 'ERMS',
    question: 'How do I record that a file was borrowed or moved?',
    answer:
      'On the record, use **Tracking**: who took it, when, and when it is due back. Overdue loans show on the dashboard. ' +
      'The custody trail cannot be edited or deleted — a mistake is corrected by recording a correction, so both entries stay visible.',
    keywords: ['tracking', 'borrow', 'borrowed', 'lend', 'custody', 'moved', 'due back', 'overdue', 'loan', 'trail'],
  },
  {
    id: 'erms-archive',
    units: ['records'],
    category: 'ERMS',
    question: 'How do archive boxes work?',
    answer:
      'Open **ERMS › Archive Boxes**. File records into a box, **seal** it when full, and record a **disposal** when one is authorised. ' +
      'Sealing does not delete anything — a sealed box only refuses new records. A disposal records that the paper went and requires the approving authority; the database keeps the record.',
    keywords: ['archive', 'archive box', 'boxes', 'seal', 'sealed', 'disposal', 'dispose', 'retention'],
  },
  {
    id: 'erms-units-file',
    units: ['legal','laboratory'],
    category: 'Legal & Laboratory',
    question: 'How do I file a Legal or Laboratory document?',
    answer:
      'Choose **Upload document** in the menu (or in your unit\'s Document Library). At the top pick the **document type** and the **province**; the form below is in **tabs** — for a Notice of Violation: ' +
      '**Basic Info**, **Laws Cited & Handling** (each law cited in a box of its own, then the legal officer, case handler and status), **Dates**, then **Upload Document** (the scan, and the folder below it). Use **Next** and **Back**, or click a tab.\n\n' +
      'Picking a **docket number** already on file fills in the company and address from the latest document on that docket; in the Laboratory, a **COC number** fills in the firm and address. ' +
      'If something is missing when you press **Upload document**, the first tab with a problem opens and the others are marked with a red dot.\n\n' +
      'An open document has the same tabs as a Records record — **Details**, **Document**, **Same docket** (Legal) and **History**, which lists its filing, every edit with what it changed, and every view.',
    keywords: ['file a document', 'upload document', 'history', 'legal', 'laboratory', 'lab', 'notice of violation', 'nov', 'technical conference', 'order', 'resolution', 'payment', 'docket', 'coc', 'test result', 'chain of custody', 'tabs', 'red dot'],
  },
  {
    id: 'erms-autocomplete',
    category: 'ERMS',
    question: 'Why does the upload form suggest names as I type?',
    answer:
      'The upload forms suggest values **already on file** — proponents and project titles in Records; dockets, companies and addresses in Legal; COC numbers, firms and addresses in the Laboratory — most-used first. ' +
      'Picking one keeps spellings consistent so related documents are found together. You can still type a new value.',
    keywords: ['suggest', 'suggestions', 'autocomplete', 'auto complete', 'dropdown', 'already on file', 'spelling', 'fills in'],
  },
  {
    id: 'erms-settings',
    category: 'Settings',
    question: 'What can my unit change under Settings › ERMS?',
    answer:
      "**Settings › ERMS** holds your unit's working rules: **Data Quality** (which fields are required), **Duplicates** (warn or refuse a repeated permit number or file name), " +
      '**Data Privacy** (document classifications), **PDF Viewing**, **Tracing & Auditing**, **Log History** and **Menus**.',
    keywords: ['erms settings', 'unit settings', 'data quality', 'required fields', 'duplicates rule', 'data privacy', 'classification', 'pdf viewing', 'log history', 'menus'],
  },
  {
    id: 'erms-nas-hours',
    category: 'Storage',
    question: 'Why can\'t I file or open documents right now?',
    answer:
      'Filing and opening documents need the **NAS**. It is reached through the office server, which runs on **weekdays**, so documents can be unavailable outside office days or when that server is off. ' +
      'The banner under the header says which. Searching and editing record details still work.',
    keywords: ['cannot file', 'cannot upload', 'upload failed', 'nas unavailable', 'weekend', 'office hours', 'server off', 'document access'],
  },
  {
    id: 'erms-units-find',
    units: ['legal', 'laboratory'],
    category: 'Legal & Laboratory',
    question: 'How do I find a Legal case or a Laboratory result?',
    answer:
      "Open your unit's **Document Library**. The search box matches the **serial**, the **docket number** or **COC number**, the **company**, **firm** or **station**, and the file name — partial text works. " +
      'Narrow it with **Document type** and **Province**; **Reset** clears everything.\n\n' +
      'In Legal, a case\'s **attachments are listed inside it**: press the **+** at the start of a row to see them. Searching, or choosing a type, lists every match as its own row.',
    keywords: ['find case', 'find document', 'search', 'docket', 'docket number', 'coc', 'coc number', 'firm', 'station', 'company', 'test result', 'library', 'document library'],
  },
  {
    id: 'erms-legal-attachments',
    units: ['legal'],
    category: 'Legal & Laboratory',
    question: 'How do I add an attachment to a Notice of Violation?',
    answer:
      'Open the case (the Notice of Violation) and go to its **Attachments** tab, then **Add attachment**. The upload window opens with **Attachment** chosen and the case\'s docket, company and address already filled in; add the **kind of attachment** and the scan, and press **Upload document**.\n\n' +
      'The attachment is numbered after the case — **FSN-NOV00432 Att-00240** — and filed in the case\'s own **Attachments** folder on the share, as the desktop system did. ' +
      'An attachment uploaded from the menu with a docket number is attached to that docket\'s Notice of Violation the same way.',
    keywords: ['attachment', 'attachments', 'add attachment', 'attach', 'nov', 'notice of violation', 'case', 'docket', 'complaint', 'inspection report', 'att-'],
  },
  {
    id: 'erms-record-attachments',
    units: ['records'],
    category: 'ERMS',
    question: 'How do I add an attachment to a record?',
    answer:
      'Open the record, go to its **Document** tab and press **Add attachment**. The window works like **Upload record**: two tabs (**Attachment**, **Document**), **Next** and **Back**. ' +
      'The attachment takes the record\'s proponent, permit number and place, is numbered after it (**FSN-0000206 Att-00099**), and its scan goes beside the record\'s own unless you choose another folder.',
    keywords: ['attachment', 'attachments', 'add attachment', 'amendment', 'certified copy', 'letter', 'second document', 'att-'],
  },
  {
    id: 'erms-history',
    category: 'ERMS',
    question: 'Where do I see who opened, changed or shared a document?',
    answer:
      "On the document itself: **History** for a Legal or Laboratory document, **Tracking** for a Records record. It lists when it was filed, every edit (with the old and new value), scans filed or replaced, who opened it — " +
      'and how it was **shared through the Document Portal**: who asked and why, who approved or declined it, for how long and which pages, access changed or withdrawn, and each time the requester opened it.',
    keywords: ['history', 'tracking', 'who opened', 'who viewed', 'who changed', 'shared', 'sharing', 'share', 'shared with', 'audit', 'log', 'trail', 'portal'],
  },
  {
    id: 'erms-maintenance',
    category: 'ERMS',
    question: 'Why does my unit say it is under maintenance?',
    answer:
      'The Developer has taken the unit down for a while — to move or repair its share, or while it is not in use. Its menu section is greyed out and its screens show the reason and since when. ' +
      'Nothing is lost: when it is brought back, every document, setting and history is as it was. Until then its documents cannot be opened, filed or asked for in the Document Portal; ask the Developer when it will be back.',
    keywords: ['maintenance', 'under maintenance', 'unavailable', 'greyed out', 'grayed out', 'down', 'cannot open unit', 'unit is down'],
  },
  {
    id: 'erms-folders',
    category: 'ERMS',
    question: 'How do I make or remove a folder when filing a scan?',
    answer:
      'In the upload window, under **Location on the share**, open the folders like the desktop system\'s. Type a name in **New folder** and press **Make folder** to start one where you are. ' +
      'To remove a folder made by mistake, press the **bin** beside it (or **Remove this folder** while you are in it) and confirm. Only **empty** folders can be removed — one with any file in it is refused, so no scan can be lost this way.',
    keywords: ['folder', 'make folder', 'new folder', 'create folder', 'remove folder', 'delete folder', 'wrong folder', 'empty folder', 'location on the share'],
  },
]);

// ── ADMIN ────────────────────────────────────────────────────────────────────

const ADMIN_KB = Object.freeze([
  {
    id: 'admin-accounts',
    category: 'Administration',
    question: 'How do I approve an account request or change what someone can see?',
    answer:
      'Go to **Admin Settings › User Accounts**. Pending requests are listed there to approve or decline. To change an account, open it and set:\n' +
      '- **Account type** — Administrator, Planning Admin, Encoder, ERMS User and the rest. For an **ERMS User**, the **System** decides the unit: Records, Legal or Laboratory.\n' +
      '- **Province access** — none, view, or edit, per province.\n' +
      '- **Years** — which year containers a Planning account may enter.\n\n' +
      'Changes apply on the person\'s next request.',
    keywords: ['user accounts', 'approve account', 'account request', 'pending accounts', 'account type', 'role', 'province access', 'permissions', 'erms user', 'system', 'assign year', 'access'],
  },
  {
    id: 'admin-sign-in-history',
    category: 'Administration',
    question: 'Where can I see who signed in?',
    answer: '**Admin Settings › Sign-in History** lists sign-ins and sign-outs with the time and account.',
    keywords: ['sign-in history', 'login history', 'who signed in', 'sign ins', 'audit sign in'],
  },
  {
    id: 'admin-erms-config',
    category: 'Administration',
    question: 'How do I change ERMS document types, fields or the filing layout?',
    answer:
      'Go to **Admin Settings › ERMS Config**. Per unit you can change the **folder pattern** used on the share, the **document types** and their **fields**, upload limits, and the **lookup lists** that feed dropdowns. ' +
      'New fields appear on the upload form without a code change. Changing the folder pattern affects where new scans are filed, not existing ones.',
    keywords: ['erms config', 'document types', 'fields', 'form fields', 'folder pattern', 'filing layout', 'lookup list', 'dropdown values', 'upload limit', 'configure erms'],
  },
  {
    id: 'admin-register',
    category: 'Administration',
    question: 'What is under Admin Settings › Register and System?',
    answer:
      '**Register** covers the Monitoring Plan itself: its configuration, its activity trail, and duplicate reconciliation. ' +
      '**System** covers the platform: its database view and the audit trail of changes across both domains.',
    keywords: ['register settings', 'system settings', 'audit trail', 'activity trail', 'admin register', 'database settings'],
  },
  {
    id: 'admin-vera',
    category: 'Administration',
    question: 'How do I configure VERA?',
    answer:
      'Go to **Admin Settings › VERA Assistant**. **Configuration** turns VERA on or off, shows whether an AI model is connected (with **Test connection**), and sets the model, limits, ' +
      'the welcome message and whether VERA appears on the sign-in page. **Activity Log** lists usage — metadata only; questions and answers are never stored.\n\n' +
      'The API key is not set on that screen: it lives in the server environment.',
    keywords: ['configure vera', 'vera settings', 'turn on vera', 'turn off vera', 'vera model', 'vera log', 'assistant settings', 'test connection'],
  },
]);

// ── DEVELOPER ────────────────────────────────────────────────────────────────

const DEV_KB = Object.freeze([
  {
    id: 'dev-architecture',
    category: 'Developer',
    question: 'How is E-Universe built?',
    answer:
      'A modular monolith: one Express API (`server/`) and one React + Ant Design SPA (`front-end/`), one MongoDB database (`universe-db`). ' +
      'Two business domains — UCDS (`server/modules/ucds`) and ERMS (`server/modules/erms`) — each owning its collections; cross-domain access is read-only through the owner\'s service. ' +
      'Every route carries a server-side guard (`requireDomain`, `requireRole`); `npm run audit:routes` lists them and fails on an unprotected route.',
    keywords: ['architecture', 'how is it built', 'modular monolith', 'modules', 'domains', 'requiredomain', 'express', 'react', 'structure'],
  },
  {
    id: 'dev-caching',
    category: 'Developer',
    question: 'How does E-Universe stay fast with many users?',
    answer:
      'Expensive reads many people share — dashboards, the register check, permit monitoring, province data, year containers — go through `shared/services/shortCache.js`: ' +
      'computed once per scope for seconds to minutes, identical in-flight requests merged, and cleared by the writes that change them. ' +
      'Sign-ins and sign-outs are pushed over Socket.IO (`services/presence.js`); polling pauses in hidden tabs. `node scripts/load-test.js` replays recorded screens for N users against the test database.',
    keywords: ['performance', 'cache', 'caching', 'shortcache', 'load test', 'many users', '100 users', 'presence', 'socket', 'scaling'],
  },
  {
    id: 'dev-tests',
    category: 'Developer',
    question: 'How do I run the tests?',
    answer:
      'From `server/`: `npm test`. The suite runs against its **own** MongoDB (`TEST_MONGO_URI`, local by default) and refuses the production cluster; `npm run test:db:refresh` copies production\'s working collections into it. ' +
      'The production cluster is a shared free tier — never put copies or bulk data there.',
    keywords: ['tests', 'run tests', 'vitest', 'test database', 'test db', 'npm test', 'refresh test db'],
  },
  {
    id: 'dev-vera',
    category: 'Developer',
    question: 'How is VERA wired up?',
    answer:
      '`server/services/vera/provider.js` calls the model — Anthropic through the official `@anthropic-ai/sdk`, Gemini over its REST API. The key is read only from the server environment and never stored or returned. ' +
      '`knowledge.js` is the help library, by realm; `assistant.js` does the guards, retrieval, prompt and the no-model fallback. Settings live in `app-config` (`vera-settings`); usage is logged to `app-logs` as metadata only. ' +
      'A model call needs the environment switch (`AUTOMATION_AGENT_ENABLED` or `VERA_ENABLED`), the stored toggle and a key.',
    keywords: ['vera', 'how does vera work', 'wired', 'provider', 'knowledge base', 'anthropic', 'gemini', 'assistant code', 'vera configuration'],
  },
]);

// ── Vocabulary that makes a question read as in-scope on its own words ──────

// Domain-bearing words only: generic ones ("open", "page", "search", "year",
// "file") made questions with nothing to do with E-Universe read as in scope.
const COMMON_SCOPE_TERMS = Object.freeze([
  'e-universe', 'universe', 'dashboard', 'sidebar', 'theme', 'dark mode', 'appearance', 'sign out',
  'sign in', 'nas', 'storage container', 'online users', 'vera', 'notification', 'bell',
]);

const UCDS_SCOPE_TERMS = Object.freeze([
  'ucds', 'universe central db', 'register', 'establishment', 'establishments', 'monitoring plan',
  'province', 'provinces', 'year container', 'year switcher', 'permit', 'permits', 'ecc', 'cnc', 'pto',
  'wwdp', 'pco', 'haz id', 'psic', 'monitoring', 'monitoring calendar', 'inspection', 'duplicate ecc',
  'dataset', 'datasets', 'healthcare', 'chemicals', 'bulletin', 'expiry',
]);

const ERMS_SCOPE_TERMS = Object.freeze([
  'erms', 'record', 'records', 'document library', 'scan', 'scans', 'scanned document', 'filing', 'fsn',
  'proponent', 'project title', 'permit number', 'archive box', 'archive boxes', 'disposal', 'custody',
  'document request', 'document requests', 'legal services', 'laboratory', 'docket', 'notice of violation',
  'nov', 'coc', 'test result', 'upload record', 'file a document',
]);

const ADMIN_SCOPE_TERMS = Object.freeze([
  'admin', 'administrator', 'user accounts', 'account', 'accounts', 'approve', 'role', 'account type',
  'permission', 'permissions', 'access', 'sign-in history', 'erms config', 'configure', 'configuration',
  'audit', 'org units', 'organizational units', 'system', 'vera settings',
]);

const DEV_SCOPE_TERMS = Object.freeze([
  'architecture', 'module', 'modules', 'endpoint', 'api', 'route', 'controller', 'schema', 'collection',
  'index', 'query', 'test', 'tests', 'code', 'cache', 'socket', 'load test', 'vera', 'provider', 'mongodb',
]);

// ── Starter chips ────────────────────────────────────────────────────────────

const UCDS_STARTERS = Object.freeze([
  'Where is the register of establishments?',
  'How do I switch to another year?',
  'What is the number on the bell?',
  'How does Permit Monitoring work?',
]);

const ERMS_STARTERS = Object.freeze([
  'How do I upload a new record?',
  'How do I find a record?',
  'How do I file a Notice of Violation?',
  'How does someone outside the unit get a document?',
]);

// What each kind of account is offered first — its own unit's work, in its
// own words. A Developer or Administrator who sees every unit gets
// ERMS_STARTERS instead.
const UNIT_STARTERS = Object.freeze({
  records: Object.freeze([
    'How do I upload a new record?',
    'How do I find a record?',
    'How do I add an attachment to a record?',
    'Who has opened or shared this record?',
    'How does someone outside the unit get a document?',
  ]),
  legal: Object.freeze([
    'How do I file a Notice of Violation?',
    'How do I add an attachment to a Notice of Violation?',
    'How do I find a case by docket number?',
    'Who has opened or shared this document?',
    'How does someone outside the unit get a document?',
  ]),
  laboratory: Object.freeze([
    'How do I upload a laboratory test result?',
    'How do I find a result by COC number or firm?',
    'Who has opened or shared this document?',
    'How does someone outside the unit get a document?',
  ]),
});

// Planning: the register, and the documents behind an establishment.
const PLANNING_STARTERS = Object.freeze([
  ...UCDS_STARTERS,
  'Can I see the ERMS documents of an establishment?',
]);

const ADMIN_STARTERS = Object.freeze([
  'How do I approve an account request?',
  'How do I change ERMS document types?',
  'How do I configure VERA?',
]);

module.exports = {
  ASSISTANT_NAME,
  ASSISTANT_FULL_NAME,
  DEFAULT_SUPPORT,
  DEFAULT_OFFICE_WEBSITE,
  publicCountReply,
  PAGE_LABELS,
  PUBLIC_PAGE_LABELS,
  SIGNIN_PAGES,
  PUBLIC_GREETING_REPLY,
  PUBLIC_OUT_OF_SCOPE_REPLY,
  PUBLIC_CANNOT_VERIFY_REPLY,
  PUBLIC_NO_LOOKUP_REPLY,
  PUBLIC_CREDENTIAL_REPLY,
  PUBLIC_ACCOUNT_PROBE_REPLY,
  PUBLIC_BLOCKED_REPLY,
  PUBLIC_STARTER_QUESTIONS,
  PUBLIC_SCOPE_TERMS,
  PUBLIC_BLOCKED_TERMS,
  PUBLIC_KB,
  PORTAL_PAGE_LABELS,
  PORTAL_GREETING_REPLY,
  PORTAL_OUT_OF_SCOPE_REPLY,
  PORTAL_CANNOT_VERIFY_REPLY,
  PORTAL_NO_LOOKUP_REPLY,
  PORTAL_BLOCKED_REPLY,
  PORTAL_STARTER_QUESTIONS,
  PORTAL_SCOPE_TERMS,
  PORTAL_BLOCKED_TERMS,
  PORTAL_KB,
  GREETING_REPLY,
  OUT_OF_SCOPE_REPLY,
  CANNOT_VERIFY_REPLY,
  COMMON_KB,
  UCDS_KB,
  ERMS_KB,
  ADMIN_KB,
  DEV_KB,
  COMMON_SCOPE_TERMS,
  UCDS_SCOPE_TERMS,
  ERMS_SCOPE_TERMS,
  ADMIN_SCOPE_TERMS,
  DEV_SCOPE_TERMS,
  UCDS_STARTERS,
  ERMS_STARTERS,
  UNIT_STARTERS,
  PLANNING_STARTERS,
  ADMIN_STARTERS,
};
