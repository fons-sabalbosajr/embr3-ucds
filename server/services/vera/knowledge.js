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
  'access-requests': 'ERMS › Document Requests',
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
      'Yes, by request. On an establishment, the **records panel** lists the ERMS records filed against it. Opening a document needs the **Records Unit\'s approval**: ' +
      'request it there, and you are told when it is approved. Approved documents open **view-only**.',
    keywords: ['erms documents', 'documents of establishment', 'records panel', 'request document', 'see scan', 'ecc document', 'permit document', 'approval'],
  },
]);

// ── ERMS: Records, Legal Services, Laboratory ───────────────────────────────

const ERMS_KB = Object.freeze([
  {
    id: 'erms-library',
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
    category: 'ERMS',
    question: 'How do I upload (file) a new record?',
    answer:
      'Choose **Upload record** in the menu (or **New record** in the Document Library). The window shows the **next FSN**, claimed when you save. Then:\n' +
      '1. **Proponent & permit** — proponent, project title, permit type and number, dates, project type. Proponent and project title suggest names already on file; pick one to keep the spelling consistent.\n' +
      '2. **Location** — province, city and barangay.\n' +
      '3. **Document** — drag the scan in. It is filed on the share under province, year and project, like the desktop system did; **Location on the share** lets you choose an existing folder.\n' +
      '4. Save.\n\n' +
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
    question: 'What are Document Requests?',
    answer:
      'Staff outside the Records Unit can see a record but need the **Records Unit\'s approval** to open its document. They request it from the record; the Records Unit sees it under **ERMS › Document Requests** and approves or declines it. ' +
      'Approved documents open view-only for the person who asked.',
    keywords: ['document requests', 'access request', 'request access', 'approve request', 'approval', 'decline', 'share document', 'pending requests'],
  },
  {
    id: 'erms-tracking',
    category: 'ERMS',
    question: 'How do I record that a file was borrowed or moved?',
    answer:
      'On the record, use **Tracking**: who took it, when, and when it is due back. Overdue loans show on the dashboard. ' +
      'The custody trail cannot be edited or deleted — a mistake is corrected by recording a correction, so both entries stay visible.',
    keywords: ['tracking', 'borrow', 'borrowed', 'lend', 'custody', 'moved', 'due back', 'overdue', 'loan', 'trail'],
  },
  {
    id: 'erms-archive',
    category: 'ERMS',
    question: 'How do archive boxes work?',
    answer:
      'Open **ERMS › Archive Boxes**. File records into a box, **seal** it when full, and record a **disposal** when one is authorised. ' +
      'Sealing does not delete anything — a sealed box only refuses new records. A disposal records that the paper went and requires the approving authority; the database keeps the record.',
    keywords: ['archive', 'archive box', 'boxes', 'seal', 'sealed', 'disposal', 'dispose', 'retention'],
  },
  {
    id: 'erms-units-file',
    category: 'Legal & Laboratory',
    question: 'How do I file a Legal or Laboratory document?',
    answer:
      'Choose **File a document** in your unit\'s menu. At the top pick the **document type** and the **province**; the form below is in numbered **tabs** — for a Notice of Violation: ' +
      'The case, Laws cited, Dates, Handling, then **Scan & location**. Use **Next** and **Back**, or click a tab.\n\n' +
      'Picking a **docket number** already on file fills in the company and address from the latest document on that docket; in the Laboratory, a **COC number** fills in the firm and address. ' +
      'If something is missing when you press **File document**, the first tab with a problem opens and the others are marked with a red dot.',
    keywords: ['file a document', 'legal', 'laboratory', 'lab', 'notice of violation', 'nov', 'technical conference', 'order', 'resolution', 'payment', 'docket', 'coc', 'test result', 'chain of custody', 'tabs', 'red dot'],
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
  'What are Document Requests?',
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
  ADMIN_STARTERS,
};
