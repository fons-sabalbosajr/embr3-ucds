import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// The height left between an element's top and the bottom of the window.
//
// For a table that should end at the bottom of the screen — its rows
// scrolling under a fixed header — however much sits above it: filters that
// wrap onto a second line, a notice that comes and goes. Measured rather
// than written as calc(100vh - …), which goes wrong the first time anything
// above the table changes height.
//
//   const [ref, height] = useFitHeight(120);   // 120px kept for what follows
//   <div ref={ref}><Table scroll={{ y: height }} /></div>
//
// `reserve` is what must stay visible below the measured element's top
// besides the scrolling part: the table's own header, the pagination, the
// footer. Never returns less than `min`, so a short window still shows rows.
//
// The third value is the element's width — what the table really has, the
// sidebar open or shut — for a table that fits its columns to it.
// ---------------------------------------------------------------------------

export default function useFitHeight(reserve = 0, min = 240) {
  const ref = useRef(null);
  const [height, setHeight] = useState(min);
  const [width, setWidth] = useState(0);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    setHeight(Math.max(min, Math.floor(window.innerHeight - top - reserve)));
    setWidth(el.clientWidth);
  }, [reserve, min]);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    // What sits above the element can change height without the window
    // resizing (filters wrapping, an alert closing): watch the page too.
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (observer && ref.current?.parentElement) observer.observe(ref.current.parentElement);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [measure]);

  return [ref, height, width];
}
