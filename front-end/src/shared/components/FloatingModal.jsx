import { useEffect, useRef, useState } from "react";
import { Button, Modal, Tooltip } from "antd";
import { BorderOutlined, CloseOutlined, MinusOutlined } from "@ant-design/icons";
import "./floatingmodal.css";

// ---------------------------------------------------------------------------
// A dialog that behaves like a window: moved by its title bar, shrunk to a
// small bar in the corner (minimise) and back, and resized from its lower
// right corner. The record's details and its scan open in these, so the two
// can sit side by side — the scan read against the details typed from it.
//
// `floating`: no dark mask behind it, and the page (or another window)
// stays usable while it is open. `extra` sits at the right of the title bar,
// after the minimise button and just before the close X.
// ---------------------------------------------------------------------------

const FloatingModal = ({
  open,
  onCancel,
  title,
  extra,
  children,
  footer = null,
  width = 900,
  height,
  // Without a height the window fits its content, up to this.
  maxHeight = "96vh",
  floating = false,
  resizable = true,
  minWidth = 360,
  minHeight = 220,
  bodyStyle,
  destroyOnHidden = true,
  top = 24,
  className,
}) => {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [minimized, setMinimized] = useState(false);
  const drag = useRef(null);

  // Each opening starts where a dialog starts, full size.
  useEffect(() => {
    if (open) {
      setPos({ x: 0, y: 0 });
      setMinimized(false);
    }
  }, [open]);

  const onPointerDown = (e) => {
    if (e.button !== 0 || minimized || e.target.closest("button, a, input, .ant-tag-close-icon")) return;
    drag.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    // The title bar never leaves the screen: there must be something to grab.
    const x = d.ox + e.clientX - d.sx;
    const y = Math.max(-top, Math.min(window.innerHeight - top - 48, d.oy + e.clientY - d.sy));
    setPos({ x, y });
  };
  const endDrag = () => {
    drag.current = null;
  };

  const toggleMinimized = () => {
    setPos({ x: 0, y: 0 });
    setMinimized((m) => !m);
  };

  const header = (
    <div
      className={`eu-float-title${minimized ? "" : " eu-float-title--movable"}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={(e) => !e.target.closest("button, a") && toggleMinimized()}
    >
      <div className="eu-float-title__main">{title}</div>
      {/* What the caller puts at the right (the ECC Ref No), then the window's
          own buttons — minimise or restore, and close — one row, one size,
          centred on the bar, as on a desktop window. */}
      {extra && !minimized && <div className="eu-float-title__extra">{extra}</div>}
      <div className="eu-float-title__buttons">
        <Tooltip title={minimized ? "Restore" : "Minimise"}>
          <Button
            type="text"
            size="small"
            icon={minimized ? <BorderOutlined /> : <MinusOutlined />}
            onClick={toggleMinimized}
            aria-label={minimized ? "Restore" : "Minimise"}
          />
        </Tooltip>
        <Tooltip title="Close">
          <Button type="text" size="small" className="eu-float-title__close" icon={<CloseOutlined />} onClick={onCancel} aria-label="Close" />
        </Tooltip>
      </div>
    </div>
  );

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      className={className}
      // The close button is the title bar's own, beside minimise.
      closable={false}
      title={header}
      footer={minimized ? null : footer}
      // Minimised: a bar in the lower right corner, out of the way.
      width={minimized ? 340 : resizable ? "fit-content" : typeof width === "number" ? `min(${width}px, 96vw)` : width}
      style={minimized ? { position: "fixed", top: "auto", bottom: 12, right: 12, margin: 0, paddingBottom: 0 } : { top }}
      mask={!floating && !minimized}
      maskClosable={false}
      wrapClassName={floating || minimized ? "eu-float-wrap" : undefined}
      destroyOnHidden={destroyOnHidden}
      modalRender={(node) => <div style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}>{node}</div>}
      styles={{
        content: minimized
          ? { padding: "8px 12px" }
          : resizable
            ? {
                width: typeof width === "number" ? `min(${width}px, 96vw)` : width,
                height,
                minWidth,
                minHeight,
                maxWidth: "98vw",
                maxHeight,
                resize: "both",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }
            : height
              ? // A fixed size: the window does not resize, its body scrolls inside it.
                { height, maxHeight, overflow: "hidden", display: "flex", flexDirection: "column" }
              : undefined,
        header: minimized ? { marginBottom: 0 } : undefined,
        body: minimized ? { display: "none" } : { ...(resizable || height ? { flex: 1, minHeight: 0, overflow: "auto" } : {}), ...bodyStyle },
      }}
    >
      {children}
    </Modal>
  );
};

export default FloatingModal;
