import { useMemo, useState } from "react";
import { Button, Card, Modal, Segmented, Space, Table, Tag, Tooltip, Typography } from "antd";
import { CopyOutlined } from "@ant-design/icons";
import { KIND_LABEL, n, unitLabel } from "./palette";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// The four healthcare lists — Healthcare Industries, Chemical permits, TSD /
// TRC, Importers — by kind of permit, the duplicates taken out (the server's
// healthcarePermits). One establishment is often on several of them, so its
// ECC/CNC, PTO, WWDP and HW ID are listed more than once: each counts once.
//
// Per list: the distinct permit numbers (and how many rows list them, when
// some repeat). Then the lists added together, and each permit once across
// the four — the figure to use. The Developer can see which numbers repeat,
// and where, to clear them from the workbooks; the public link, the counts.
// ---------------------------------------------------------------------------

/** One count: the distinct numbers, and the rows listing them when some repeat. */
const Count = ({ c, strong }) =>
  !c ? (
    <Text type="secondary">—</Text>
  ) : c.listed === c.distinct ? (
    <span style={strong ? { fontWeight: 600 } : undefined}>{n(c.distinct)}</span>
  ) : (
    <Tooltip title={`${n(c.listed)} listed; ${n(c.listed - c.distinct)} a repeat of a number already counted`}>
      <span style={strong ? { fontWeight: 600 } : undefined}>
        {n(c.distinct)} <Text type="secondary" style={{ fontSize: 11.5 }}>of {n(c.listed)}</Text>
      </span>
    </Tooltip>
  );

function Duplicates({ open, onClose, rows, kinds }) {
  const [kind, setKind] = useState("all");
  const shown = useMemo(() => (kind === "all" ? rows : rows.filter((r) => r.kind === kind)), [rows, kind]);
  return (
    <Modal open={open} onCancel={onClose} footer={null} width="min(1000px, 96vw)" title="Permit numbers listed more than once on the healthcare lists" destroyOnHidden>
      <Space direction="vertical" size={10} style={{ width: "100%" }}>
        <Text type="secondary" style={{ fontSize: 12.5 }}>
          Each is counted once above. A number on two lists is usually one establishment kept on both (a TSD that is also a TRC); one on two rows of the same list is a
          duplicate row to remove from the workbook, or a number typed on the wrong firm.
        </Text>
        <Segmented
          value={kind}
          onChange={setKind}
          options={[{ value: "all", label: `All (${n(rows.length)})` }, ...kinds.map((k) => ({ value: k, label: `${KIND_LABEL[k] || k} (${n(rows.filter((r) => r.kind === k).length)})` }))]}
        />
        <Table
          size="small"
          rowKey={(r) => `${r.kind}|${r.permit}`}
          dataSource={shown}
          pagination={{ pageSize: 15, showSizeChanger: false, hideOnSinglePage: true }}
          scroll={{ x: 640 }}
          columns={[
            { title: "Kind", dataIndex: "kind", width: 90, render: (k) => <Tag style={{ marginInlineEnd: 0 }}>{KIND_LABEL[k] || k}</Tag> },
            { title: "Permit number", dataIndex: "permit", width: 240, render: (v) => <Text code copyable={{ icon: <CopyOutlined />, text: v }}>{v}</Text> },
            {
              title: "Where",
              key: "at",
              render: (_, r) => (
                <Space size={[4, 4]} wrap>
                  {r.at.map((w) => (
                    <Tag key={w.serial} style={{ marginInlineEnd: 0 }}>
                      {unitLabel(w.unit)} · <span style={{ fontFamily: "monospace" }}>{w.serial}</span>
                    </Tag>
                  ))}
                </Space>
              ),
            },
            {
              title: "Repeated",
              key: "across",
              width: 120,
              filters: [
                { text: "Across lists", value: true },
                { text: "Within one list", value: false },
              ],
              onFilter: (v, r) => r.across === v,
              render: (_, r) => (r.across ? <Tag color="blue">across lists</Tag> : <Tag color="orange">within a list</Tag>),
            },
          ]}
        />
      </Space>
    </Modal>
  );
}

export default function HealthcarePermits({ data, admin = false }) {
  const [open, setOpen] = useState(false);
  if (!data?.units?.length) return null;
  const kinds = data.kinds || [];
  const sum = (k, f) => data.units.reduce((a, u) => a + (u.kinds[k]?.[f] || 0), 0);
  const rows = [
    ...data.units.map((u) => ({ key: u.unit, label: unitLabel(u.unit), kinds: u.kinds })),
    // The lists' own counts added together: a number on two lists counts twice here…
    { key: "added", label: "The four lists added together", kinds: Object.fromEntries(kinds.map((k) => [k, { listed: sum(k, "listed"), distinct: sum(k, "distinct") }])), sub: true },
    // …and once here: the figure to use.
    { key: "total", label: "Each permit once (duplicates removed)", kinds: data.total, total: true },
  ];
  const removed = kinds.reduce((a, k) => a + ((data.total?.[k]?.listed || 0) - (data.total?.[k]?.distinct || 0)), 0);
  return (
    <Card
      size="small"
      className="pt-card"
      title="Healthcare lists by kind of permit, duplicates removed"
      extra={
        <Space size={8}>
          <Text type="secondary" className="pt-card-hint">
            {n(removed)} repeated number{removed === 1 ? "" : "s"} left out
          </Text>
          {admin && data.duplicates?.length > 0 && (
            <Button size="small" onClick={() => setOpen(true)}>
              See the duplicates
            </Button>
          )}
        </Space>
      }
    >
      <Table
        size="small"
        pagination={false}
        rowKey="key"
        dataSource={rows}
        rowClassName={(r) => (r.total ? "pt-row-total" : r.sub ? "pt-row-group" : "")}
        scroll={{ x: 560 }}
        columns={[
          { title: "List", dataIndex: "label", key: "label", render: (v, r) => (r.total || r.sub ? <b>{v}</b> : v) },
          ...kinds.map((k) => ({ title: KIND_LABEL[k] || k, key: k, align: "right", render: (_, r) => <Count c={r.kinds?.[k]} strong={r.total} /> })),
        ]}
      />
      {admin && <Duplicates open={open} onClose={() => setOpen(false)} rows={data.duplicates || []} kinds={kinds} />}
    </Card>
  );
}
