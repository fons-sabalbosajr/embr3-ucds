import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Which kind of screen the application is on, for the layout decisions CSS
// alone cannot make — the navigation drawer, the theme's sizes, which table
// columns to keep:
//
//   phone   narrower than 768px   (the navigation slides in over the page)
//   tablet  768px – 1199px        (the navigation starts as icons)
//   desktop 1200px and wider
//
// Follows the window as it is resized or turned.
// ---------------------------------------------------------------------------

export const PHONE_MAX = 767;
export const TABLET_MAX = 1199;

const read = () => {
  const w = typeof window === "undefined" ? 1280 : window.innerWidth;
  return { width: w, phone: w <= PHONE_MAX, tablet: w > PHONE_MAX && w <= TABLET_MAX, desktop: w > TABLET_MAX };
};

export default function useScreen() {
  const [screen, setScreen] = useState(read);
  useEffect(() => {
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = read();
        // Only a change of kind re-renders; a pixel of width does not.
        setScreen((prev) => (prev.phone === next.phone && prev.tablet === next.tablet ? prev : next));
      });
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);
  return screen;
}
