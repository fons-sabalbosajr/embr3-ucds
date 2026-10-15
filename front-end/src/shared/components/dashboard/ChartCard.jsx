import { useState } from "react";
import { Button, Card, Modal, Skeleton, Space, Table, Typography } from "antd";
import { ExpandOutlined } from "@ant-design/icons";
import { MonthStack } from "./charts";

const { Text } = Typography;
const fmt = (n) => new Intl.NumberFormat().format(n ?? 0);

// ---------------------------------------------------------------------------
// A dashboard chart in a card, with "See more": the same chart larger, with
// everything the card leaves out (the kinds folded into "Other", the years
// before the last twelve, the project types past the top ten), and a table
// of the figures underneath — sortable, with each row's share of the whole.
//
//   render(full)  draws the chart; `full` is true in the dialog
//   rows          [{ label, count }] for the table (or `columns` + `rows`
//                 for a table of another shape)
// ---------------------------------------------------------------------------

const ChartCard = ({ title, extra, loading, render, rows = [], columns, labelTitle = "Label", countTitle = "Documents", total }) => {
  const [open, setOpen] = useState(false);
  const whole = total ?? rows.reduce((s, r) => s + (r.count || 0), 0);
  const tableColumns = columns || [
    { title: labelTitle, dataIndex: "label", key: "label", render: (v) => v || <Text type="secondary">Unknown</Text> },
    { title: countTitle, dataIndex: "count", key: "count", width: 130, align: "right", sorter: (a, b) => a.count - b.count, defaultSortOrder: "descend", render: fmt },
    { title: "Share", key: "share", width: 100, align: "right", render: (_, r) => (whole ? `${((r.count / whole) * 100).toFixed(1)}%` : "—") },
  ];
  return (
    <>
      <Card
        title={title}
        size="small"
        style={{ height: "100%" }}
        extra={
          <Space size={8}>
            {extra}
            <Button type="link" size="small" icon={<ExpandOutlined />} onClick={() => setOpen(true)} disabled={loading} style={{ paddingInline: 0 }}>
              See more
            </Button>
          </Space>
        }
      >
        {loading ? <Skeleton active /> : render(false)}
      </Card>
      <Modal open={open} onCancel={() => setOpen(false)} footer={null} width="min(1100px, 96vw)" style={{ top: 24 }} title={title} destroyOnHidden>
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          {/* Drawn only when open and loaded: the children are built even
              while the dialog is shut, and the dashboard's data is not there
              yet while it loads ("cannot read byProjectType of undefined"). */}
          {open && !loading && render(true)}
          <Table
            size="small"
            bordered
            rowKey={(r, i) => r.key ?? r.label ?? i}
            columns={tableColumns}
            dataSource={rows}
            pagination={rows.length > 15 ? { pageSize: 15, showSizeChanger: false } : false}
            scroll={{ x: "max-content" }}
            summary={
              columns
                ? undefined
                : () => (
                    <Table.Summary.Row>
                      <Table.Summary.Cell index={0}><Text strong>Total</Text></Table.Summary.Cell>
                      <Table.Summary.Cell index={1} align="right"><Text strong>{fmt(whole)}</Text></Table.Summary.Cell>
                      <Table.Summary.Cell index={2} align="right">100%</Table.Summary.Cell>
                    </Table.Summary.Row>
                  )
            }
          />
        </Space>
      </Modal>
    </>
  );
};

/** Uploads per month, stacked by kind — its table a month per row and a column per kind. */
export const MonthStackCard = ({ title, extra, loading, months = [], kinds = [], dark, name }) => {
  const present = kinds.filter((k) => months.some((m) => (m.kinds?.[k.code] || 0) > 0));
  const listed = new Set(present.map((k) => k.code));
  const label = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const rows = months.map((m) => {
    const other = Object.entries(m.kinds || {}).filter(([c]) => !listed.has(c)).reduce((s, [, n]) => s + n, 0);
    return { key: m.month, month: label(m.month), total: m.total || 0, other, ...Object.fromEntries(present.map((k) => [k.code, m.kinds?.[k.code] || 0])) };
  });
  const hasOther = rows.some((r) => r.other);
  const columns = [
    { title: "Month", dataIndex: "month", key: "month", fixed: "left" },
    ...present.map((k) => ({ title: k.label, dataIndex: k.code, key: k.code, align: "right", render: fmt })),
    ...(hasOther ? [{ title: "Other", dataIndex: "other", key: "other", align: "right", render: fmt }] : []),
    { title: "Total", dataIndex: "total", key: "total", align: "right", render: (v) => <Text strong>{fmt(v)}</Text> },
  ];
  return (
    <ChartCard
      title={title}
      extra={extra}
      loading={loading}
      columns={columns}
      rows={rows}
      render={(full) => <MonthStack months={months} kinds={kinds} dark={dark} name={name} height={full ? 380 : undefined} />}
    />
  );
};

export default ChartCard;
