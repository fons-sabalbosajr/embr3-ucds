import { Button, Checkbox, Space, Tour } from "antd";
import { useState } from "react";
import { closeTourForNow, neverShowTour } from "./tourState";

// ---------------------------------------------------------------------------
// The Document Portal's tour, for someone here for the first time: find the
// document, say who you are, send the request, the room, VERA, the theme.
// Steps whose part of the page is not showing (the form is replaced by
// "Your request" once someone has asked) are left out.
// ---------------------------------------------------------------------------

export default function PortalTour({ open, onClose, refs, hasForm }) {
  const [never, setNever] = useState(false);

  const close = () => {
    if (never) neverShowTour();
    else closeTourForNow();
    onClose();
  };

  const steps = [
    {
      title: "Welcome to the Document Portal",
      description:
        "Here you can ask EMB Region III for a scanned document — permits, certificates, legal and laboratory documents and other office records — and read it on this page once it is approved. No account is needed. This short tour shows you how.",
      target: null,
    },
    hasForm && {
      title: "1. Find the document",
      description: "Search by a reference or docket number, a title or a company, then press Select on the right one. Each kind of document has its own colour.",
      target: () => refs.search.current,
    },
    hasForm && {
      title: "2. Tell us who you are",
      description:
        "Choose whether you are an EMB Region III employee, a government employee of another agency, a student or a private citizen. The form then asks for the right details.",
      target: () => refs.type.current,
    },
    hasForm && {
      title: "3. Send your request",
      description:
        "When the form is filled in, press this button. You will be asked to read and agree to the Data Privacy terms — and, if you are not an employee, the Freedom of Information terms — before it is sent.",
      target: () => refs.send.current,
    },
    {
      title: "The room",
      description:
        "Up to 50 people can wait or read at a time; your own seat is marked “You”. When the room is full, you wait in line and are seated automatically.",
      target: () => refs.room.current,
    },
    {
      title: "Meet VERA",
      description: "Have a question? Ask VERA, your Document Portal guide — she explains every step.",
      target: () => document.querySelector(".vera-launcher"),
    },
    {
      title: "Light or dark",
      description: "Switch between light and dark mode whenever you like.",
      target: () => refs.theme.current,
    },
  ].filter(Boolean);

  return (
    <Tour
      open={open}
      onClose={close}
      onFinish={close}
      steps={steps}
      type="primary"
      zIndex={1100}
      indicatorsRender={(current, total) => (
        <span style={{ opacity: 0.85 }}>
          {current + 1} / {total}
        </span>
      )}
      actionsRender={(originNode) => (
        <Space size={10} wrap style={{ justifyContent: "flex-end" }}>
          <Checkbox checked={never} onChange={(e) => setNever(e.target.checked)} className="portal-tour-never">
            Don&apos;t show again
          </Checkbox>
          <Button size="small" onClick={close} className="portal-tour-skip">
            Skip
          </Button>
          {originNode}
        </Space>
      )}
    />
  );
}
