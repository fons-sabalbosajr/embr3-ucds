import { useCallback, useEffect, useState } from "react";
import { Card, Space } from "antd";
import { RightOutlined } from "@ant-design/icons";

// ---------------------------------------------------------------------------
// The Highlighting tab's cards fold: a click on the title collapses or
// expands the card, a short summary showing beside the title while folded.
// Each card's state is remembered per browser (a convenience only); "Expand
// all" / "Collapse all" reach every card of a group at once.
// ---------------------------------------------------------------------------

const KEY = (id) => `pt.fold.${id}`;
const EVENT = "pt-fold";

const readFold = (id, fallback) => {
  try {
    const v = localStorage.getItem(KEY(id));
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
};
const saveFold = (id, open) => {
  try {
    localStorage.setItem(KEY(id), open ? "1" : "0");
  } catch {
    // Storage blocked: the choice lasts until the page is left.
  }
};

/** A card's open state, remembered; `group` lets setFoldAll reach it. */
export function useFold(id, defaultOpen = true, group = null) {
  const [open, setOpenState] = useState(() => readFold(id, defaultOpen));
  const setOpen = useCallback(
    (v) => {
      setOpenState(v);
      saveFold(id, v);
    },
    [id]
  );
  useEffect(() => {
    if (!group) return undefined;
    const on = (e) => e.detail?.group === group && setOpen(e.detail.open);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, [group, setOpen]);
  return [open, setOpen];
}

/** Open or fold every card of a group. */
export const setFoldAll = (group, open) => window.dispatchEvent(new CustomEvent(EVENT, { detail: { group, open } }));

/** The title as a button: the chevron turns as the card opens. */
export const FoldTitle = ({ open, onToggle, children }) => (
  <button type="button" className="pt-fold-head" aria-expanded={open} onClick={() => onToggle(!open)}>
    <RightOutlined className={`pt-fold-chevron${open ? " is-open" : ""}`} aria-hidden="true" />
    {children}
  </button>
);

/** A card that folds. `summary` shows beside the title while it is folded. */
export function FoldCard({ id, group = null, title, extra, summary = null, defaultOpen = true, className = "", children, ...rest }) {
  const [open, setOpen] = useFold(id, defaultOpen, group);
  return (
    <Card
      size="small"
      className={`pt-card pt-fold ${open ? "" : "is-folded"} ${className}`}
      title={
        <Space size={8} wrap>
          <FoldTitle open={open} onToggle={setOpen}>
            {title}
          </FoldTitle>
          {!open && summary}
        </Space>
      }
      extra={extra}
      styles={open ? undefined : { body: { display: "none" } }}
      {...rest}
    >
      {children}
    </Card>
  );
}
