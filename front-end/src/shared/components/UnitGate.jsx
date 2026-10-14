import { Result, Tag } from "antd";
import { ToolOutlined } from "@ant-design/icons";
import { Outlet, useParams } from "react-router-dom";
import { UNIT_NAMES, useErmsAvailability } from "../ermsAvailability";

// The maintenance notice of an ERMS unit taken down by the Developer, and
// the gate that shows it in place of the unit's screens (shared/ermsAvailability).

/** The notice a down unit shows in place of its screens. */
export const UnitDownNotice = ({ unit, state }) => (
  <Result
    icon={<ToolOutlined />}
    title={`The ${UNIT_NAMES[unit] || unit} is under maintenance`}
    subTitle={
      <>
        {state?.reason ? <div>{state.reason}</div> : <div>Its documents are temporarily unavailable.</div>}
        <div style={{ marginTop: 4 }}>Everything is kept; it will be back as it was. Please try again later.</div>
        {state?.since && <div style={{ marginTop: 4, fontSize: 12 }}>Since {new Date(state.since).toLocaleString()}</div>}
      </>
    }
  />
);

/**
 * A unit's screens, or the maintenance notice while it is down. `unit` is
 * given, or read from the route (/erms/:unit/…). The Developer (`bypass`)
 * sees the screens with a reminder that the unit is down. Without children
 * it is a layout route: the routes inside it are the unit's screens.
 */
export const UnitGate = ({ unit: given, bypass = false, children }) => {
  const params = useParams();
  const unit = given || params.unit;
  const { units } = useErmsAvailability();
  const state = units[unit];
  const screens = children ?? <Outlet />;
  if (!state?.down) return screens;
  if (!bypass) return <UnitDownNotice unit={unit} state={state} />;
  return (
    <>
      <div style={{ marginBottom: 8 }}>
        <Tag icon={<ToolOutlined />} color="warning">
          {UNIT_NAMES[unit] || unit} is down for maintenance — only you can see this
        </Tag>
      </div>
      {screens}
    </>
  );
};
