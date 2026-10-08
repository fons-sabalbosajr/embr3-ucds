// ---------------------------------------------------------------------------
// setInterval for polling, that stops while nobody is looking.
//
// A screen left open in a background tab kept asking the server for fresh
// data every few seconds, all day. With a hundred people, each with a few
// tabs open, that idle polling was most of the load on the database — and
// the database is a shared free tier with a limit on operations per second.
//
// Ticks are skipped while the tab is hidden; when it is shown again the
// function runs once straight away, so what the person sees is current.
//
//   useEffect(() => visibleInterval(load, 30000), [load]);
//
// Returns the cleanup function, so it can be returned from an effect as is.
// ---------------------------------------------------------------------------

export default function visibleInterval(fn, ms) {
  const hidden = () => typeof document !== "undefined" && document.hidden;
  const tick = () => {
    if (!hidden()) fn();
  };
  const onVisible = () => {
    if (!hidden()) fn();
  };
  const id = setInterval(tick, ms);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    clearInterval(id);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
