// ---------------------------------------------------------------------------
// What to tell people when scanned documents cannot be opened or filed.
//
// Most of the people reading these are not technical. They do not know what
// a NAS, a share or a bridge server is, and should not need to: they need to
// know what happened in their own words, the likely cause (a power
// interruption, the office internet, a slow connection), whether anything
// else is affected, and what to do. Every screen that explains a file
// problem takes its sentence from here, so the wording is the same
// everywhere. The Developer's own storage screens keep the technical terms.
// ---------------------------------------------------------------------------

/** [alert type, sentence] per error code from the API. */
export const FILE_PROBLEMS = {
  NO_DOCUMENT: ["info", "No scanned document has been filed for this yet."],
  FILE_MISSING: [
    "warning",
    "The scanned document listed here cannot be found in the file storage. It may have been moved or renamed — please tell the unit that filed it.",
  ],
  BAD_STORED_PATH: ["warning", "The location saved for this scanned document is not valid. Please tell the unit that filed it so they can correct it."],
  NAS_NOT_CONFIGURED: ["info", "Scanned documents are not set up on this system yet. Please tell the system administrator."],
  NAS_DISABLED: ["info", "Opening scanned documents is turned off at the moment."],
  NAS_INACTIVE: ["info", "Scanned documents cannot be opened right now."],
  NAS_UNREACHABLE: [
    "warning",
    "The office file storage could not be reached — this can happen during a power interruption, when the office internet is down, or on a very slow connection. Please try again in a few minutes. Everything else in E-Universe keeps working.",
  ],
  NAS_DENIED: ["error", "The system is not allowed to open this file. Please tell the system administrator."],
  CONTAINER_FORBIDDEN: ["warning", "Your account has not been given access to these files yet. Please ask the system administrator."],
  NETWORK: [
    "warning",
    "E-Universe could not be reached. Please check your internet connection and try again.",
  ],
};

/**
 * The sentence for a failed file request: the server's own message when it
 * wrote one for this reason (it knows whether it is the schedule, a power
 * interruption or a switch), else ours for the code.
 */
export function explainFileProblem(code, serverMessage) {
  const [type, sentence] = FILE_PROBLEMS[code] || ["warning", "The scanned document could not be opened right now. Please try again in a few minutes."];
  // For "not available right now" the server's sentence is the specific one.
  const message = code === "NAS_INACTIVE" && serverMessage ? serverMessage : sentence;
  return { type, message };
}

/** The availability states the banner speaks about, in a heading and a sentence. */
export const OUTAGE_TITLES = {
  "nas-offline": "Scanned documents are unavailable.",
  "bridge-offline": "Scanned documents are unavailable.",
  slow: "Slow connection.",
};
