import { useLayoutEffect, useRef } from "react";

// ---------------------------------------------------------------------------
// A record tab's content, fitted to the window instead of scrolling.
//
// The record window is nearly the height of the screen, and the tab area
// between the tab bar and the buttons does not scroll. When a tab's content
// is taller than that area, it is scaled down (CSS zoom) just enough to fit,
// and widened by the same factor so it still spans the window — wider, the
// text reflows into fewer lines, so it needs less shrinking. Never below
// `min`: past that the text would be too small to read, and the area scrolls
// as a last resort rather than hiding anything.
//
// Measured again whenever the content or the window changes size, which also
// covers a tab becoming visible (a hidden tab measures zero).
// ---------------------------------------------------------------------------

export default function FitToHeight({ children, min = 0.72 }) {
  const innerRef = useRef(null);

  useLayoutEffect(() => {
    const inner = innerRef.current;
    const holder = inner?.closest(".ant-tabs-content-holder");
    if (!inner || !holder) return undefined;
    let frame = 0;

    const fit = () => {
      frame = 0;
      const avail = holder.clientHeight;
      if (!avail || !inner.offsetParent) return; // hidden tab: measured when shown
      inner.style.zoom = "";
      inner.style.width = "";
      holder.style.overflowY = "hidden";
      let scale = 1;
      for (let i = 0; i < 5; i += 1) {
        const height = inner.getBoundingClientRect().height;
        if (height <= avail + 1) break;
        const next = Math.max(min, scale * (avail / height) * 0.99);
        if (next >= scale - 0.005) break;
        scale = next;
        inner.style.zoom = String(scale);
        inner.style.width = `${100 / scale}%`;
        if (scale <= min) break;
      }
      // Still too tall at the smallest readable size: let it scroll.
      if (inner.getBoundingClientRect().height > avail + 1) holder.style.overflowY = "auto";
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(fit);
    };

    // The zoom we set changes the content's size too; only a change from
    // outside (new content, the window, the tab shown) should re-fit.
    let last = "";
    const observer = new ResizeObserver(() => {
      const key = `${holder.clientWidth}x${holder.clientHeight}:${inner.scrollHeight}:${inner.offsetParent ? 1 : 0}`;
      if (key !== last) {
        last = key;
        schedule();
      }
    });
    observer.observe(holder);
    observer.observe(inner);
    fit();
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [min]);

  return (
    <div ref={innerRef} className="ucds-fit">
      {children}
    </div>
  );
}
