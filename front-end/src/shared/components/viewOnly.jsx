import { useEffect } from "react";
import { message } from "../feedback";

// ---------------------------------------------------------------------------
// View only, for every place a scanned document is shown.
//
// While a viewer is open:
//   - right-click does nothing on it (no "Save image as", no "Print"),
//   - nothing in it can be dragged out to the desktop,
//   - Ctrl/Cmd+S and Ctrl/Cmd+P do nothing, with a short note why,
//   - printing the page prints a blank sheet (index.css: body.eu-view-only).
//
// A courtesy to the office's rule, not a lock: a screen can always be
// photographed, which is what the viewer's watermark is for.
// ---------------------------------------------------------------------------

let open = 0;
let noted = 0;

const block = (e) => {
  const key = String(e.key || "").toLowerCase();
  if ((e.ctrlKey || e.metaKey) && (key === "s" || key === "p")) {
    e.preventDefault();
    e.stopPropagation();
    // Once a few seconds is enough; holding the keys should not stack notes.
    if (Date.now() - noted > 4000) {
      noted = Date.now();
      message.info("Saving and printing are turned off for scanned documents. They can only be viewed here.");
    }
  }
};

/** Mount in a viewer; spread the returned props on its outer element. */
export function useViewOnly() {
  useEffect(() => {
    open += 1;
    if (open === 1) {
      window.addEventListener("keydown", block, true);
      document.body.classList.add("eu-view-only");
    }
    return () => {
      open -= 1;
      if (open === 0) {
        window.removeEventListener("keydown", block, true);
        document.body.classList.remove("eu-view-only");
      }
    };
  }, []);
  return {
    onContextMenu: (e) => e.preventDefault(),
    onDragStart: (e) => e.preventDefault(),
    className: "eu-view-only-surface",
  };
}

/** An image scan, view only: no right-click, no dragging, fitted to the box. */
export function ViewOnlyImage({ src, alt, height = "78vh" }) {
  const props = useViewOnly();
  return (
    <div {...props} style={{ height, overflow: "auto", background: "#e5e7eb", borderRadius: 6, display: "flex", justifyContent: "center", padding: 16 }}>
      <img src={src} alt={alt} draggable={false} style={{ maxWidth: "100%", height: "auto", alignSelf: "flex-start", boxShadow: "0 1px 4px rgba(0,0,0,.25)" }} />
    </div>
  );
}
