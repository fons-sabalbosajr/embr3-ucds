// ---------------------------------------------------------------------------
// Copy text to the clipboard — also where the browser's Clipboard API is not
// offered. Browsers give navigator.clipboard only to a secure page (https, or
// localhost); E-Universe opened by an address on the network over http has
// none, and every "Copy" button failed there. Then the older way is used: the
// text in a hidden box, selected, copied. The box is put inside an open
// dialog when there is one, as a dialog keeps the focus to itself.
//
// Resolves true when the text was copied, false when the browser refused
// both ways (the caller then shows the text to copy by hand).
// ---------------------------------------------------------------------------

export async function copyText(text) {
  const value = String(text ?? "");
  if (typeof window !== "undefined" && window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Denied (no permission, or the page lost focus): try the older way.
    }
  }
  return legacyCopy(value);
}

function legacyCopy(value) {
  if (typeof document === "undefined") return false;
  return copyByEvent(value) || copyBySelection(value);
}

// The text handed to the copy event itself: needs no focus nor selection, so a
// dialog's focus trap or a closing dropdown menu cannot spoil it.
function copyByEvent(value) {
  let set = false;
  const onCopy = (e) => {
    try {
      e.clipboardData.setData("text/plain", value);
      e.preventDefault();
      set = true;
    } catch {
      set = false;
    }
  };
  document.addEventListener("copy", onCopy, true);
  try {
    return document.execCommand("copy") && set;
  } catch {
    return false;
  } finally {
    document.removeEventListener("copy", onCopy, true);
  }
}

function copyBySelection(value) {
  const host = document.activeElement?.closest?.(".ant-modal-content, [role='dialog']") || document.body;
  const box = document.createElement("textarea");
  box.value = value;
  box.setAttribute("readonly", "");
  box.setAttribute("aria-hidden", "true");
  Object.assign(box.style, { position: "fixed", top: "0", left: "0", width: "1px", height: "1px", padding: "0", border: "0", opacity: "0", pointerEvents: "none" });
  host.appendChild(box);
  const before = document.activeElement;
  try {
    box.focus({ preventScroll: true });
    box.select();
    box.setSelectionRange(0, value.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    box.remove();
    before?.focus?.({ preventScroll: true });
  }
}
