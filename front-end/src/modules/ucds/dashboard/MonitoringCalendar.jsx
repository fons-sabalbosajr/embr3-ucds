import { useMemo, useState } from "react";
import { Button, Card, Empty, Input, Modal, Segmented, Space, Spin, Table, Tag, Tooltip, Typography } from "antd";
import { CalendarOutlined, LeftOutlined, RightOutlined, SearchOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { fetchDailyNotices } from "../../../api/calendarService";
import { UCDS_ACCENT } from "../ucdsColors";
import "./dashboardWidgets.css";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// The dashboard's monitoring calendar: a month as a heat grid in the Universe
// Central DB's green — the deeper a day, the more establishments monitored
// on it, its count written on it — with the year's months in a strip to
// jump to, the chosen day's establishments beside it, and "See more" for the
// whole day (or month) in a searchable table.
//
// Dates are read whether written 3/05/2025 or 3/5/2025 (the old calendar
// matched the first only, and missed the visits written the second way).
// It opens on the latest month that has visits.
// ---------------------------------------------------------------------------

const fmt = (n) => new Intl.NumberFormat().format(n ?? 0);
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "3/5/2025", "03/05/2025", "2025-03-05" → "2025-03-05", or null. */
function dayKey(v) {
  const s = String(v || "").trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// Written out whole: the production build keeps only class names it can read in the code.
const HEAT_CLASS = ["", "is-l1", "is-l2", "is-l3", "is-l4"];

/** The green of a day, by its count against the month's busiest: four steps. */
const heat = (count, max) => {
  if (!count) return null;
  const share = count / Math.max(1, max);
  return share > 0.75 ? 4 : share > 0.5 ? 3 : share > 0.25 ? 2 : 1;
};

const sectionsOf = (v) =>
  String(v || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

/** One visit's row in the lists and the table. */
const iisLinks = (r) =>
  [r.iis_no_2025, r.iis_no_2024]
    .flatMap((v) => String(v || "").split(/[\s,;]+/))
    .map((x) => x.trim())
    .filter((x) => x && x !== "N/A");

function VisitsTable({ rows }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => [r.sort_key, r.title, r.name, r.section_incharged, r.handler, r.insp_type].some((v) => String(v || "").toLowerCase().includes(t)));
  }, [rows, q]);
  return (
    <Space direction="vertical" size={10} style={{ width: "100%" }}>
      <Input allowClear prefix={<SearchOutlined />} placeholder="Search by establishment, serial, section, handler" value={q} onChange={(e) => setQ(e.target.value)} />
      <Table
        size="small"
        rowKey={(r) => `${r.sort_key}-${r._day}`}
        dataSource={shown}
        tableLayout="fixed"
        pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50], showTotal: (t) => `${fmt(t)} visits` }}
        columns={[
          { title: "Date", dataIndex: "_day", width: 110, render: (d) => dayjs(d).format("MMM D, YYYY"), sorter: (a, b) => a._day.localeCompare(b._day) },
          { title: "Serial", dataIndex: "sort_key", width: 100 },
          {
            title: "Establishment",
            key: "est",
            render: (_, r) => (
              <div className="mc-est">
                <b>{r.title || "—"}</b>
                {r.name && <Text type="secondary">{r.name}</Text>}
              </div>
            ),
          },
          { title: "Section", dataIndex: "section_incharged", width: 140, render: (v) => sectionsOf(v).map((s) => <Tag key={s} style={{ marginBottom: 2 }}>{s}</Tag>) },
          { title: "Handler", dataIndex: "handler", width: 140, render: (v) => v || <Text type="secondary">—</Text> },
          { title: "Inspection", dataIndex: "insp_type", width: 120, render: (v) => v || <Text type="secondary">—</Text> },
          {
            title: "IIS no.",
            key: "iis",
            width: 170,
            render: (_, r) =>
              iisLinks(r).length ? (
                <div className="mc-iis">
                  {iisLinks(r).map((n) => (
                    <a key={n} href={`https://iis.emb.gov.ph/embis/dms/documents/tracker/?trn_no=${encodeURIComponent(n)}`} target="_blank" rel="noopener noreferrer">
                      {n}
                    </a>
                  ))}
                </div>
              ) : (
                <Text type="secondary">—</Text>
              ),
          },
        ]}
      />
    </Space>
  );
}

export default function MonitoringCalendar() {
  const { data: notices = [], isLoading } = useQuery({ queryKey: ["ucds", "daily-notices"], queryFn: fetchDailyNotices, staleTime: 5 * 60 * 1000, gcTime: 30 * 60 * 1000 });

  // Visits by day, and the days there are.
  const byDay = useMemo(() => {
    const out = {};
    for (const n of notices) {
      const k = dayKey(n.date_monitored);
      if (k) (out[k] ||= []).push({ ...n, _day: k });
    }
    return out;
  }, [notices]);
  const latest = useMemo(() => Object.keys(byDay).sort().pop() || null, [byDay]);

  const [month, setMonth] = useState(null); // "YYYY-MM"; null: the latest with visits
  const [picked, setPicked] = useState(null); // "YYYY-MM-DD"
  const [more, setMore] = useState(null); // { title, rows }
  const shown = dayjs(`${month || (latest ? latest.slice(0, 7) : dayjs().format("YYYY-MM"))}-01`);
  const monthKey = shown.format("YYYY-MM");

  const monthDays = useMemo(() => Object.entries(byDay).filter(([k]) => k.startsWith(monthKey)), [byDay, monthKey]);
  const monthVisits = monthDays.reduce((a, [, v]) => a + v.length, 0);
  const max = monthDays.reduce((m, [, v]) => Math.max(m, v.length), 0);
  const busiest = monthDays.reduce((b, [k, v]) => (v.length > (b?.[1] || 0) ? [k, v.length] : b), null);
  const yearCounts = useMemo(() => {
    const y = shown.format("YYYY");
    const counts = Array(12).fill(0);
    for (const [k, v] of Object.entries(byDay)) if (k.startsWith(y)) counts[Number(k.slice(5, 7)) - 1] += v.length;
    return counts;
  }, [byDay, shown]);
  const yearMax = Math.max(1, ...yearCounts);

  // The day beside the grid: the one picked, else the month's busiest.
  const day = picked && picked.startsWith(monthKey) ? picked : busiest?.[0] || null;
  const dayRows = day ? byDay[day] || [] : [];

  const cells = [];
  const first = shown.startOf("month");
  for (let i = 0; i < first.day(); i++) cells.push(null);
  for (let d = 1; d <= shown.daysInMonth(); d++) cells.push(first.date(d).format("YYYY-MM-DD"));
  while (cells.length % 7) cells.push(null);
  const today = dayjs().format("YYYY-MM-DD");

  const go = (m) => {
    setMonth(m.format("YYYY-MM"));
    setPicked(null);
  };

  return (
    <Card
      size="small"
      className="mc"
      style={{ height: "100%", "--mc-accent": UCDS_ACCENT }}
      title={
        <Space>
          <CalendarOutlined />
          Monitoring calendar
        </Space>
      }
      extra={
        <Button size="small" type="link" onClick={() => setMore({ title: `Monitored in ${shown.format("MMMM YYYY")}`, rows: monthDays.flatMap(([, v]) => v).sort((a, b) => a._day.localeCompare(b._day)) })} disabled={!monthVisits}>
          See more
        </Button>
      }
    >
      {isLoading ? (
        <div className="mc-center">
          <Spin />
        </div>
      ) : (
        <>
          <div className="mc-head">
            <Space size={4}>
              <Button size="small" icon={<LeftOutlined />} onClick={() => go(shown.subtract(1, "month"))} aria-label="Previous month" />
              <span className="mc-month">{shown.format("MMMM YYYY")}</span>
              <Button size="small" icon={<RightOutlined />} onClick={() => go(shown.add(1, "month"))} aria-label="Next month" />
            </Space>
            <Space size={6} wrap>
              <Segmented
                size="small"
                value={shown.format("YYYY")}
                onChange={(y) => go(dayjs(`${y}-${shown.format("MM")}-01`))}
                options={[...new Set([...Object.keys(byDay).map((k) => k.slice(0, 4)), dayjs().format("YYYY")])].sort()}
              />
              <Button size="small" onClick={() => go(dayjs())}>
                This month
              </Button>
              {latest && (
                <Button size="small" onClick={() => go(dayjs(latest))}>
                  Latest visits
                </Button>
              )}
            </Space>
          </div>

          {/* The year's months: how busy each was; click one to open it. */}
          <div className="mc-year" role="group" aria-label={`Visits per month in ${shown.format("YYYY")}`}>
            {yearCounts.map((c, i) => (
              <Tooltip key={i} title={`${dayjs().month(i).format("MMMM")}: ${fmt(c)} visits`}>
                <button type="button" className={`mc-year-month${i === shown.month() ? " is-on" : ""}`} onClick={() => go(shown.month(i))}>
                  <span className="mc-year-bar">
                    <i style={{ height: `${c ? Math.max(12, (c / yearMax) * 100) : 0}%` }} />
                  </span>
                  <span>{dayjs().month(i).format("MMM")}</span>
                </button>
              </Tooltip>
            ))}
          </div>

          <div className="mc-body">
            <div className="mc-grid-wrap">
              <div className="mc-summary">
                <span>
                  <b>{fmt(monthVisits)}</b> visits
                </span>
                <span>
                  <b>{fmt(monthDays.length)}</b> days with visits
                </span>
                {busiest && (
                  <span>
                    busiest <b>{dayjs(busiest[0]).format("MMM D")}</b> ({fmt(busiest[1])})
                  </span>
                )}
              </div>
              <div className="mc-grid" role="grid" aria-label={shown.format("MMMM YYYY")}>
                {WEEKDAYS.map((w) => (
                  <div key={w} className="mc-weekday" role="columnheader">
                    {w}
                  </div>
                ))}
                {cells.map((k, i) => {
                  if (!k) return <div key={`x${i}`} className="mc-cell is-blank" />;
                  const count = byDay[k]?.length || 0;
                  const level = heat(count, max);
                  return (
                    <button
                      key={k}
                      type="button"
                      role="gridcell"
                      className={`mc-cell${level ? ` ${HEAT_CLASS[level]}` : ""}${k === day ? " is-picked" : ""}${k === today ? " is-today" : ""}`}
                      onClick={() => count && setPicked(k)}
                      aria-label={`${dayjs(k).format("MMMM D")}: ${count} visits`}
                      disabled={!count}
                    >
                      <span className="mc-date">{Number(k.slice(8))}</span>
                      {count > 0 && <span className="mc-count">{fmt(count)}</span>}
                    </button>
                  );
                })}
              </div>
              <div className="mc-scale" aria-hidden="true">
                <span>Fewer</span>
                {[1, 2, 3, 4].map((l) => (
                  <i key={l} className={HEAT_CLASS[l]} />
                ))}
                <span>More</span>
              </div>
            </div>

            <div className="mc-day">
              {day ? (
                <>
                  <div className="mc-day-head">
                    <div>
                      <div className="mc-day-date">{dayjs(day).format("dddd, MMM D")}</div>
                      <Text type="secondary">{fmt(dayRows.length)} establishments monitored</Text>
                    </div>
                    <Button size="small" onClick={() => setMore({ title: `Monitored on ${dayjs(day).format("MMMM D, YYYY")}`, rows: dayRows })}>
                      See more
                    </Button>
                  </div>
                  <ul className="mc-day-list">
                    {dayRows.slice(0, 6).map((r) => (
                      <li key={r.sort_key}>
                        <span className="mc-day-serial">{r.sort_key}</span>
                        <span className="mc-day-title">{r.title || r.name || "—"}</span>
                        {sectionsOf(r.section_incharged)[0] && <Tag style={{ marginInlineEnd: 0 }}>{sectionsOf(r.section_incharged)[0]}</Tag>}
                      </li>
                    ))}
                  </ul>
                  {dayRows.length > 6 && (
                    <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setMore({ title: `Monitored on ${dayjs(day).format("MMMM D, YYYY")}`, rows: dayRows })}>
                      and {fmt(dayRows.length - 6)} more
                    </Button>
                  )}
                </>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`No visits in ${shown.format("MMMM YYYY")}`}>
                  {latest && (
                    <Button size="small" onClick={() => go(dayjs(latest))}>
                      Go to the latest visits
                    </Button>
                  )}
                </Empty>
              )}
            </div>
          </div>
        </>
      )}
      <Modal open={Boolean(more)} title={more?.title} onCancel={() => setMore(null)} footer={null} width="min(1200px, 96vw)" destroyOnHidden>
        {more && <VisitsTable rows={more.rows} />}
      </Modal>
    </Card>
  );
}
