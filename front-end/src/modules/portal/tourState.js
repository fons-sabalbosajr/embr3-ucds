// Whether the Document Portal's first-visit tour shows (PortalTour).
//
// It shows on a visit until the person says "Don't show again" — remembered
// in this browser for good (localStorage: there is no account to keep it
// on). Closing it otherwise only puts it away for this tab's session, so a
// newcomer who closed it by accident meets it again next time.

const NEVER = "eu.portal.tour.never";
const THIS_SESSION = "eu.portal.tour.closed";

const safe = (fn, fallback) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

export const shouldShowTour = () =>
  safe(() => localStorage.getItem(NEVER) !== "1", true) && safe(() => sessionStorage.getItem(THIS_SESSION) !== "1", true);

export const closeTourForNow = () => safe(() => sessionStorage.setItem(THIS_SESSION, "1"));

export const neverShowTour = () => {
  safe(() => localStorage.setItem(NEVER, "1"));
  closeTourForNow();
};
