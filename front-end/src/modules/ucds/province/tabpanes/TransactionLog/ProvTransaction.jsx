import { useMemo, useState } from "react";
import { Alert, Button, Empty, Pagination, Segmented, Skeleton, Space, Tag, Tooltip, Typography } from "antd";
import { ArrowRightOutlined, DeleteOutlined, HistoryOutlined, ReloadOutlined, RollbackOutlined, UserOutlined } from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import dayjs from "dayjs";
import { API_BASE_URL } from "../../../../../config/api";
import { message, modal } from "../../../../../shared/feedback";
import "./provtransaction.css";

const { Text } = Typography;
const HISTORY_PAGE_SIZE = 6;

// ---------------------------------------------------------------------------
// The record's History: every change, newest first — who changed what, from
// what to what — and, for an account that may manage the data, putting one
// field back as it was, or deleting an entry.
//
// It is read by the record's serial (and, for the entries written before the
// serial was kept, its exact ECC/CNC): by ECC/CNC alone a record without one
// showed nothing, and records sharing one showed each other's changes.
// ---------------------------------------------------------------------------

const ACTION = {
  Create: { color: "green", label: "Created" },
  "Initial Data": { color: "cyan", label: "First recorded" },
  Modified: { color: "blue", label: "Changed" },
  Reverted: { color: "purple", label: "Put back" },
  Delete: { color: "red", label: "Deleted" },
  View: { color: "default", label: "Viewed" },
};

// Whole class names, never `ph-dot--${color}`: PurgeCSS keeps a rule only if
// the class appears literally in the source, and the assembled form lost
// every dot colour in production.
const DOT_CLASS = {
  green: "ph-dot ph-dot--green",
  cyan: "ph-dot ph-dot--cyan",
  blue: "ph-dot ph-dot--blue",
  purple: "ph-dot ph-dot--purple",
  red: "ph-dot ph-dot--red",
};

// The register's fields, as people call them.
const LABEL = {
  name: "Proponent", title: "Project title", industry_class: "Industry classification", industry_type: "Industry type", industry_subtype: "Industry sub-type",
  psic_code: "PSIC code", province: "Province", city: "Municipality / city", brgy: "Barangay", barangay: "Barangay", street: "Street", address: "Complete address",
  lat: "Latitude", long: "Longitude", mbu_area: "Manila Bay area", protected_area: "Protected area", waterbody: "Receiving waterbody", cong_district: "District",
  section_incharged: "Section in charge", handler: "Inspector / handler", monitoring_sched: "Schedule of monitoring", insp_type: "Type of inspection",
  title_status: "Project status", report_type: "Type of report", reported_to_co: "Reported to CO", date_monitored: "Date monitored", date_routed: "Date routed",
  date_signed: "Date signed", days_dmds: "Days monitored → routed", days_drds: "Days routed → signed", iis_no_2024: "IIS no. 2024", iis_no_2025: "IIS no. 2025",
  iis_no_2026: "IIS no. 2026", iis_no_2027: "IIS no. 2027", latest_status: "Latest status / recommendations", standby_genset: "No. of standby gensets", iis_no_nov: "IIS no. of NOV", iis_survey: "IIS survey report", remarks: "Remarks", recommendations: "Remarks / recommendations",
  pismu_tracking: "Received by (PISMU)", pismu_count_month: "Count month", with_nov: "With a previous NOV", emp_total: "Number of employees", wwtf_type: "Type of WWTF",
  bod: "BOD", ecc_cnc: "ECC/CNC", permit_process: "ECC process", date_approved: "ECC approved", date_amended: "ECC amended", pd1586: "PD 1586 NOV recommendation",
  pto_code: "PTO", pto_issued: "PTO issued", pto_expiration: "PTO expires", ra8749: "RA 8749 NOV recommendation", wwdp_code: "WWDP", wwdp_issued: "WWDP issued",
  wwdp_expiration: "WWDP expires", ra9275: "RA 9275 NOV recommendation", haz_id: "HWG ID", haz_issued: "HWG ID issued", ra6969: "RA 6969 NOV recommendation",
  pco_no: "PCO no.", pco_name: "PCO name", pco_validity: "PCO valid until",
};
const labelOf = (f) => LABEL[f] || String(f || "").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

// Never shown as a change: bookkeeping the save itself writes.
const QUIET = new Set(["updated_at", "updated_by", "updatedAt", "updatedBy", "_id", "formatted_sort_key"]);

const asText = (v) => (v === undefined || v === null || v === "" ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));

/** The entry's time: an ISO date or the "10/15/2026, 3:04:05 PM" the log writes. */
const whenOf = (t) => {
  const d = dayjs(new Date(t.transactionDate || t.dateActed || 0));
  return d.isValid() && d.year() > 2000 ? d : null;
};

/** The changes an entry lists: field, before, after — the empty and the unchanged left out. */
const changesOf = (t) =>
  (Array.isArray(t.changes) ? t.changes : [])
    .filter((c) => c && c.field && !QUIET.has(c.field) && asText(c.old_value) !== asText(c.new_value))
    .map((c) => ({ field: c.field, before: asText(c.old_value), after: asText(c.new_value) }));

const fetchHistory = async ({ sortKey, ecc }) => {
  const { data } = await axios.get(`${API_BASE_URL}/api/ucds-log`, { params: { sort_key: sortKey || undefined, ecc_cnc: ecc || undefined } });
  const list = Array.isArray(data) ? data : [];
  // One entry per transaction, newest first.
  const unique = [...new Map(list.map((t) => [t.transactionID || t._id, t])).values()];
  return unique.sort((a, b) => (whenOf(b)?.valueOf() || 0) - (whenOf(a)?.valueOf() || 0));
};

const fetchPeople = async (usernames) => {
  const rows = await Promise.all(
    usernames.map((username) =>
      axios
        .get(`${API_BASE_URL}/api/users`, { params: { username } })
        .then((res) => [username, Array.isArray(res.data) ? res.data[0] : null])
        .catch(() => [username, null])
    )
  );
  return Object.fromEntries(rows);
};

const ProvTransaction = ({ editedRecord, currentUser, handleReload, reloadEditedRecord }) => {
  const queryClient = useQueryClient();
  const [show, setShow] = useState("changes");
  // A page of entries at a time: the record window fits its content rather
  // than scrolling (FitToHeight), and a long History would not fit.
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(null);
  const canManageData = currentUser?.capabilities?.canManageData === true;
  const sortKey = editedRecord?.sort_key || "";
  const ecc = String(editedRecord?.ecc_cnc || "").trim();

  // Keyed by the record, not by the record's every keystroke: it used to
  // re-read the History (and restart its timer) each time a field was typed in.
  const historyKey = ["ucds", "history", sortKey, ecc];
  const { data: entries = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: historyKey,
    queryFn: () => fetchHistory({ sortKey, ecc }),
    enabled: Boolean(sortKey || ecc),
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });
  const usernames = useMemo(() => [...new Set(entries.map((t) => t.userActed).filter(Boolean))].sort(), [entries]);
  const { data: people = {} } = useQuery({
    queryKey: ["ucds", "history-people", usernames.join("|")],
    queryFn: () => fetchPeople(usernames),
    enabled: usernames.length > 0,
    staleTime: 10 * 60 * 1000,
  });

  const counts = useMemo(
    () => ({
      all: entries.length,
      changes: entries.filter((t) => t.actionType !== "View").length,
      views: entries.filter((t) => t.actionType === "View").length,
    }),
    [entries]
  );
  const shown = entries.filter((t) => show === "all" || (show === "views" ? t.actionType === "View" : t.actionType !== "View"));
  const pages = Math.max(1, Math.ceil(shown.length / HISTORY_PAGE_SIZE));
  const current = Math.min(page, pages);
  const pageOfEntries = shown.slice((current - 1) * HISTORY_PAGE_SIZE, current * HISTORY_PAGE_SIZE);
  const lastChange = entries.find((t) => t.actionType !== "View");
  const nameOf = (u) => people[u]?.name || u || "Unknown";

  const afterChange = async () => {
    await queryClient.invalidateQueries({ queryKey: historyKey });
    if (typeof reloadEditedRecord === "function") await reloadEditedRecord();
    if (typeof handleReload === "function") handleReload();
  };

  const revert = (t, c) =>
    modal.confirm({
      title: `Put "${labelOf(c.field)}" back?`,
      icon: <RollbackOutlined />,
      width: 520,
      content: (
        <div className="ph-confirm">
          <div>
            <Text type="secondary">Now</Text>
            <div className="ph-value">{c.after || <i>empty</i>}</div>
          </div>
          <div>
            <Text type="secondary">Back to</Text>
            <div className="ph-value ph-value--old">{c.before || <i>empty</i>}</div>
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Changed {whenOf(t)?.format("MMM D, YYYY h:mm A") || ""} by {nameOf(t.userActed)}. Putting it back is itself recorded here.
          </Text>
        </div>
      ),
      okText: "Put it back",
      onOk: async () => {
        setBusy(`${t.transactionID}:${c.field}`);
        try {
          await axios.put(`${API_BASE_URL}/api/revert-by-ecc`, { sort_key: sortKey, ecc_cnc: ecc || undefined, field: c.field, oldValue: c.before });
          message.success(`${labelOf(c.field)} put back.`);
          await afterChange();
        } catch (e) {
          message.error(e?.response?.data?.error || e?.response?.data?.message || "It could not be put back.");
        } finally {
          setBusy(null);
        }
      },
    });

  const remove = (t) =>
    modal.confirm({
      title: "Delete this History entry?",
      icon: <DeleteOutlined />,
      content: "The record keeps its values; only this line of its History goes. It cannot be undone.",
      okText: "Delete",
      okButtonProps: { danger: true },
      onOk: async () => {
        setBusy(t.transactionID);
        try {
          await axios.delete(`${API_BASE_URL}/api/transaction/${encodeURIComponent(t.transactionID)}`);
          message.success("History entry deleted.");
          await queryClient.invalidateQueries({ queryKey: historyKey });
        } catch (e) {
          message.error(e?.response?.data?.message || e?.response?.data?.error || "The entry could not be deleted.");
        } finally {
          setBusy(null);
        }
      },
    });

  // "Initial Data": the lines it recorded, as they were.
  const initialLines = (t) =>
    [t.oldValue, t.newValue]
      .flatMap((v) => String(v || "").split("\n"))
      .map((s) => s.trim())
      .filter((s) => s && s !== "-" && s !== "undefined" && s !== "0");

  const entryCard = (t) => {
    const a = ACTION[t.actionType] || { color: "default", label: t.actionType || "Entry" };
    const when = whenOf(t);
    const changes = changesOf(t);
    const person = people[t.userActed];
    const canRevert = canManageData && ["Modified", "Reverted"].includes(t.actionType);
    return (
      <li key={t.transactionID || t._id} className="ph-entry">
        <span className={DOT_CLASS[a.color] || "ph-dot"} />
        <div className="ph-card">
          <header className="ph-head">
            <Space size={8} wrap>
              <Tag color={a.color} style={{ marginInlineEnd: 0 }}>
                {a.label}
              </Tag>
              <Text strong>{when ? when.format("MMM D, YYYY") : "—"}</Text>
              <Text type="secondary">{when ? when.format("h:mm A") : ""}</Text>
              {canManageData && t.transactionID && (
                <Text type="secondary" className="ph-id">
                  {t.transactionID}
                </Text>
              )}
            </Space>
            <Space size={6}>
              <Tooltip title={person?.division || t.userActed || ""}>
                <span className="ph-user">
                  <UserOutlined /> {nameOf(t.userActed)}
                </span>
              </Tooltip>
              {canManageData && t.actionType !== "Initial Data" && t.transactionID && (
                <Tooltip title="Delete this entry">
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} loading={busy === t.transactionID} onClick={() => remove(t)} aria-label="Delete this entry" />
                </Tooltip>
              )}
            </Space>
          </header>

          {changes.length > 0 ? (
            <table className="ph-changes">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Before</th>
                  <th aria-label="to" />
                  <th>After</th>
                  {canRevert && <th aria-label="actions" />}
                </tr>
              </thead>
              <tbody>
                {changes.map((c) => (
                  <tr key={c.field}>
                    <td className="ph-field">{labelOf(c.field)}</td>
                    <td className="ph-before">{c.before || <i>empty</i>}</td>
                    <td className="ph-arrow">
                      <ArrowRightOutlined />
                    </td>
                    <td className="ph-after">{c.after || <i>empty</i>}</td>
                    {canRevert && (
                      <td className="ph-act">
                        <Tooltip title={`Put ${labelOf(c.field)} back to the value before`}>
                          <Button size="small" icon={<RollbackOutlined />} loading={busy === `${t.transactionID}:${c.field}`} onClick={() => revert(t, c)}>
                            Revert
                          </Button>
                        </Tooltip>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : t.actionType === "Initial Data" || t.actionType === "Create" ? (
            <div className="ph-lines">{initialLines(t).length ? initialLines(t).map((s, i) => <div key={i}>{s}</div>) : "—"}</div>
          ) : t.actionType === "View" ? null : (
            <Text type="secondary" style={{ fontSize: 12 }}>
              No field values were recorded for this entry.
            </Text>
          )}
        </div>
      </li>
    );
  };

  if (!sortKey && !ecc) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="This record has no serial yet, so it has no History." />;

  return (
    <div className="ph">
      <div className="ph-bar">
        <Space size={10} wrap>
          <HistoryOutlined />
          <Text strong>History</Text>
          {lastChange && (
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              last changed {whenOf(lastChange)?.format("MMM D, YYYY h:mm A") || ""} by {nameOf(lastChange.userActed)}
            </Text>
          )}
        </Space>
        <Space size={8} wrap>
          <Segmented
            size="small"
            value={show}
            onChange={(v) => {
              setShow(v);
              setPage(1);
            }}
            options={[
              { value: "changes", label: `Changes (${counts.changes})` },
              { value: "views", label: `Views (${counts.views})` },
              { value: "all", label: `All (${counts.all})` },
            ]}
          />
          <Tooltip title="Read the History again">
            <Button size="small" icon={<ReloadOutlined />} loading={isFetching && !isLoading} onClick={() => refetch()} aria-label="Refresh" />
          </Tooltip>
        </Space>
      </div>

      {isLoading ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : isError ? (
        <Alert
          type="error"
          showIcon
          message="The History could not be loaded."
          description="Check the connection, then try again."
          action={
            <Button size="small" onClick={() => refetch()}>
              Try again
            </Button>
          }
        />
      ) : shown.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={entries.length ? "Nothing of this kind in the History." : "No changes have been recorded for this record yet."} />
      ) : (
        <>
          <ol className="ph-list">{pageOfEntries.map(entryCard)}</ol>
          {pages > 1 && (
            <Pagination
              size="small"
              align="center"
              current={current}
              pageSize={HISTORY_PAGE_SIZE}
              total={shown.length}
              onChange={setPage}
              showSizeChanger={false}
              showTotal={(t, [a, b]) => `${a}–${b} of ${t}`}
              style={{ marginTop: 10 }}
            />
          )}
        </>
      )}
    </div>
  );
};

export default ProvTransaction;
