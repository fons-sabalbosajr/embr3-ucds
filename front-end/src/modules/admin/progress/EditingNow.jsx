import { useEffect, useState } from "react";
import { Tooltip, Typography } from "antd";
import { EditOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { KIND_LABEL, unitLabel } from "./palette";

dayjs.extend(relativeTime);
const { Text } = Typography;

// ---------------------------------------------------------------------------
// "Being edited now": the workbooks Excel has saved in the last few minutes
// (it saves every few seconds while someone edits — see editingNow on the
// server), each with a pencil that writes and a pulsing ring, so whoever
// watches the tracker sees the files being worked on. On the Developer's
// screen: the file, who saved it, when, the version. On the public link: only
// the province or the kind of list — never a file or a name.
// ---------------------------------------------------------------------------

/** What a file is, in words people know: its province(s), or its kind of permit list. */
const whatOf = (e) => {
  if (e.units?.length) return e.units.map(unitLabel).join(", ");
  if (e.permitKinds?.length) return `Newly issued ${e.permitKinds.map((k) => KIND_LABEL[k] || k).join(", ")} list`;
  return e.kind === "permits" ? "A newly issued permit list" : "A RAW data file";
};
const fileOf = (name) => String(name || "").replace(/\.xls[xm]?$/i, "").replace(/_/g, " ");

export default function EditingNow({ editing = [], admin = false }) {
  // The "seconds ago" moves on its own between refreshes.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!editing.length) return undefined;
    const t = setInterval(() => tick((x) => x + 1), 10 * 1000);
    return () => clearInterval(t);
  }, [editing.length]);
  if (!editing.length) return null;
  return (
    <div className="pt-editing" role="status" aria-live="polite">
      <div className="pt-editing-mark" aria-hidden="true">
        <span className="pt-editing-ring" />
        <EditOutlined className="pt-editing-pen" />
      </div>
      <div className="pt-editing-body">
        <Text strong className="pt-editing-title">
          Being edited now
          <span className="pt-editing-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </Text>
        <div className="pt-editing-list">
          {editing.map((e, i) => (
            <Tooltip key={e.id || `${whatOf(e)}-${i}`} title={admin ? `${e.name}${e.version ? ` · version ${e.version}` : ""} · saved ${dayjs(e.at).format("h:mm:ss A")}` : `Saved ${dayjs(e.at).format("h:mm A")}`}>
              <span className="pt-editing-item">
                <span className="pt-editing-live" />
                <b>{whatOf(e)}</b>
                {admin && <Text type="secondary" className="pt-editing-file">{fileOf(e.name)}</Text>}
                <Text type="secondary">
                  {admin && e.by ? `${e.by} · ` : ""}
                  {dayjs(e.at).fromNow()}
                </Text>
              </span>
            </Tooltip>
          ))}
        </div>
      </div>
    </div>
  );
}
