import { Col, Row } from "antd";
import "./recordform.css";

// ---------------------------------------------------------------------------
// The record view's form pieces, shared by its tabs (General Information,
// Concerned Unit / Focal Person, Clearances and Permits): a section box with
// its title, a labelled field, and a value that reads as text when the
// record is only being viewed. One look across the tabs; sizes that read;
// laid out to fit the window without scrolling.
// ---------------------------------------------------------------------------

/** Blank, "N/A" and the like: shown as "Not encoded". */
const isBlank = (v) => v === undefined || v === null || String(v).trim() === "" || /^(n\/?a|none|-)$/i.test(String(v).trim());

/** A section: a titled box of fields on a 24-column grid. */
export const Section = ({ title, icon, extra, children, className = "", tone }) => (
  <section className={`rf-section${tone ? ` ${tone}` : ""}${className ? ` ${className}` : ""}`}>
    <header className="rf-section-head">
      <span>
        {icon}
        {title}
      </span>
      {extra}
    </header>
    <Row gutter={[20, 16]}>{children}</Row>
  </section>
);

/**
 * A labelled field taking `md` of 24 columns (24 below md). `box`: a div
 * rather than a label, for content that is its own label (a checkbox — a
 * label around one toggles it twice).
 */
export const Field = ({ label, hint, children, md = 24, xl, box }) => {
  const Wrap = box ? "div" : "label";
  return (
    <Col xs={24} md={md} xl={xl || md}>
      <Wrap className="rf-field">
        <span className="rf-label">
          {label}
          {hint && <span className="rf-hint">{hint}</span>}
        </span>
        {children}
      </Wrap>
    </Col>
  );
};

/** A value as text (view mode, or a worked-out field). */
export const Value = ({ children, auto, mono, strong }) => (
  <div className={`rf-value${auto ? " rf-auto" : ""}${mono ? " rf-mono" : ""}${strong ? " rf-strong" : ""}`}>
    {isBlank(children) ? <span className="rf-empty">Not encoded</span> : children}
  </div>
);

/** Two or more columns of sections side by side (one column on a narrow screen). */
export const Columns = ({ children, cols = 2 }) => <div className={`rf-columns${cols === 3 ? " rf-cols-3" : ""}`}>{children}</div>;
export const Stack = ({ children }) => <div className="rf-stack">{children}</div>;
