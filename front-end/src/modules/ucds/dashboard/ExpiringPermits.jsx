import { useEffect, useState } from "react";
import { Button, Card, Checkbox, Empty, Input, Modal, Space, Spin, Table, Tag, Tooltip, Typography } from "antd";
import { ClockCircleOutlined, SearchOutlined, WarningOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { fetchExpiringPermits } from "../ucdsService";
import "./dashboardWidgets.css";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// "Permits expiring soonest": what expires next first, then what has expired
// (the server orders them). The counts of expired and expiring permits on
// top; each establishment with its permits and the days left, coloured by
// how urgent; "See more" for the whole list — searched, filtered by kind of
// permit, a page at a time.
// ---------------------------------------------------------------------------

const fmt = (n) => new Intl.NumberFormat().format(n ?? 0);
const TYPES = ["PTO", "WWDP", "PCO"];

/** Days to a permit's expiry (negative once expired), and how urgent that is. */
const daysTo = (expiry) => dayjs(expiry).startOf("day").diff(dayjs().startOf("day"), "day");
// Class names written out whole, for the production build's CSS clean-up.
const URGENCY = { expired: "is-expired", soon: "is-soon", month: "is-month" };
const urgency = (days) => URGENCY[days < 0 ? "expired" : days <= 14 ? "soon" : "month"];
const daysLabel = (days) => (days < 0 ? `${fmt(-days)} d ago` : days === 0 ? "today" : `in ${fmt(days)} d`);

/** The establishment's nearest expiry: what the row is ranked and coloured by. */
const nearestOf = (r) => {
  const ds = r.permits.map((p) => daysTo(p.expiry));
  const upcoming = ds.filter((d) => d >= 0);
  return upcoming.length ? Math.min(...upcoming) : Math.max(...ds);
};

const PermitTags = ({ permits }) => (
  <Space size={[4, 4]} wrap>
    {permits.map((p) => {
      const d = daysTo(p.expiry);
      return (
        <Tooltip key={`${p.type}-${p.code}`} title={`${p.type}${p.code ? ` ${p.code}` : ""} — ${d < 0 ? "expired" : "expires"} ${dayjs(p.expiry).format("MMM D, YYYY")}`}>
          <Tag className={`xp-tag ${urgency(d)}`} style={{ marginInlineEnd: 0 }}>
            <b>{p.type}</b> {dayjs(p.expiry).format("MMM D, YYYY")}
          </Tag>
        </Tooltip>
      );
    })}
  </Space>
);

function AllExpiring({ open, onClose }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [types, setTypes] = useState([]);
  useEffect(() => setPage(1), [q, types]);
  // A pause in typing, then the search.
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);
  const { data, isFetching } = useQuery({
    queryKey: ["ucds", "expiring-all", page, pageSize, q, types],
    queryFn: () => fetchExpiringPermits(pageSize, { page, searchText: q, types }),
    enabled: open,
    placeholderData: (prev) => prev,
    staleTime: 60 * 1000,
  });
  return (
    <Modal open={open} onCancel={onClose} footer={null} width="min(1100px, 96vw)" title="Permits expired or expiring within a month" destroyOnHidden>
      <Space direction="vertical" size={10} style={{ width: "100%" }}>
        <div className="xp-controls">
          <Input allowClear prefix={<SearchOutlined />} placeholder="Search by establishment, serial, ECC" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 360 }} />
          <Space size={6}>
            <Text type="secondary">Permit:</Text>
            <Checkbox.Group options={TYPES} value={types} onChange={setTypes} />
          </Space>
        </div>
        <Table
          size="small"
          rowKey="sort_key"
          loading={isFetching}
          dataSource={data?.data || []}
          tableLayout="fixed"
          pagination={{
            current: page,
            pageSize,
            total: data?.total || 0,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50, 100],
            onChange: (p, size) => {
              setPage(size !== pageSize ? 1 : p);
              setPageSize(size);
            },
            showTotal: (t) => `${fmt(t)} establishments`,
          }}
          columns={[
            {
              title: "When",
              key: "when",
              width: 120,
              render: (_, r) => {
                const d = nearestOf(r);
                return <span className={`xp-days ${urgency(d)}`}>{daysLabel(d)}</span>;
              },
            },
            { title: "Serial", dataIndex: "sort_key", width: 110 },
            { title: "Establishment", dataIndex: "title", render: (v) => <b>{v}</b> },
            { title: "Permits", key: "permits", width: "42%", render: (_, r) => <PermitTags permits={r.permits} /> },
          ]}
        />
      </Space>
    </Modal>
  );
}

export default function ExpiringPermits() {
  const [all, setAll] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["ucds", "expiring"], queryFn: () => fetchExpiringPermits(6), staleTime: 2 * 60 * 1000 });
  const rows = data?.data || [];
  return (
    <Card
      size="small"
      className="xp"
      style={{ height: "100%" }}
      title={
        <Space>
          <ClockCircleOutlined />
          Permits expiring soonest
        </Space>
      }
      extra={
        <Button size="small" type="link" onClick={() => setAll(true)} disabled={!data?.total}>
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
          <div className="xp-summary">
            <div className="xp-stat is-expired">
              <WarningOutlined />
              <div>
                <b>{fmt(data?.summary?.expired)}</b>
                <span>permits expired</span>
              </div>
            </div>
            <div className="xp-stat is-month">
              <ClockCircleOutlined />
              <div>
                <b>{fmt(data?.summary?.expiringSoon)}</b>
                <span>expire within a month</span>
              </div>
            </div>
          </div>
          {rows.length ? (
            <ul className="xp-list">
              {rows.map((r) => {
                const d = nearestOf(r);
                return (
                  <li key={r.sort_key} className={urgency(d)}>
                    <span className={`xp-days ${urgency(d)}`}>{daysLabel(d)}</span>
                    <div className="xp-item">
                      <div className="xp-item-title">
                        <span className="xp-serial">{r.sort_key}</span> {r.title}
                      </div>
                      <PermitTags permits={r.permits} />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing expiring" />
          )}
          {data?.total > rows.length && (
            <Button block size="small" onClick={() => setAll(true)} style={{ marginTop: 8 }}>
              See all {fmt(data.total)} establishments
            </Button>
          )}
        </>
      )}
      <AllExpiring open={all} onClose={() => setAll(false)} />
    </Card>
  );
}
