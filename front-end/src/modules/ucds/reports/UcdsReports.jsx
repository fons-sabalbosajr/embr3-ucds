import { useEffect, useMemo, useState } from "react";
import { Button, Card, Empty, Select, Space, Table, Tabs, Tag, Typography } from "antd";
import { DownloadOutlined, FileExcelOutlined, FileTextOutlined, ReloadOutlined } from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import PageHeader from "../../../shared/components/PageHeader";
import { message } from "../../../shared/feedback";
import { downloadMonitoringPlan, fetchAccomplishment, fetchExpiringPermits, fetchNotInErms } from "../ucdsService";

// ---------------------------------------------------------------------------
// Universe Central DB › Reports: the register's ready-made reports for the
// active year — the Monitoring Plan as Excel, the accomplishment per
// province, the permits to renew, and the ERMS validation list (permits the
// Document Library does not hold). Every list is scoped by the server to the
// provinces the account may see.
// ---------------------------------------------------------------------------

const { Text } = Typography;
const fmt = (n) => new Intl.NumberFormat().format(n ?? 0);
const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : "—");

const PROVINCES = ["Aurora", "Bataan", "Bulacan", "Nueva_Ecija", "Pampanga", "Tarlac", "Zambales"];
const provinceOptions = [{ value: "", label: "All provinces" }, ...PROVINCES.map((p) => ({ value: p, label: p.replace(/_/g, " ") }))];

/** Rows as a CSV download (Excel opens it); a BOM keeps accented names intact. */
function downloadCsv(name, columns, rows) {
  const cell = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = [columns.map((c) => cell(c.title)).join(","), ...rows.map((r) => columns.map((c) => cell(r[c.dataIndex])).join(","))].join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

const stamp = () => new Date().toISOString().slice(0, 10);

function MonitoringPlanTab() {
  const [province, setProvince] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const rows = await downloadMonitoringPlan(province || null);
      message.success(`Monitoring Plan exported: ${fmt(rows)} establishments.`);
    } catch {
      message.error("The export failed. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card size="small">
      <Space direction="vertical" size={12}>
        <Text type="secondary">The register as an Excel workbook, one row per establishment, with a filter on every column.</Text>
        <Space wrap>
          <Select value={province} onChange={setProvince} options={provinceOptions} style={{ minWidth: 200 }} />
          <Button type="primary" icon={<FileExcelOutlined />} loading={busy} onClick={run}>
            Export to Excel
          </Button>
        </Space>
      </Space>
    </Card>
  );
}

function AccomplishmentTab() {
  const q = useQuery({ queryKey: ["ucds", "accomplishment"], queryFn: fetchAccomplishment, staleTime: 5 * 60 * 1000 });
  const rows = useMemo(() => q.data || [], [q.data]);
  const total = useMemo(
    () => rows.reduce((t, r) => ({ establishments: t.establishments + r.establishments, scheduled: t.scheduled + r.scheduled, monitored: t.monitored + r.monitored, withPermit: t.withPermit + r.withPermit, inErms: t.inErms + r.inErms, notInErms: t.notInErms + r.notInErms }), { establishments: 0, scheduled: 0, monitored: 0, withPermit: 0, inErms: 0, notInErms: 0 }),
    [rows]
  );
  const columns = [
    { title: "Province", dataIndex: "province" },
    { title: "Establishments", dataIndex: "establishments", align: "right", render: fmt },
    { title: "Scheduled", dataIndex: "scheduled", align: "right", render: fmt },
    { title: "Monitored", dataIndex: "monitored", align: "right", render: (v, r) => `${fmt(v)} (${pct(v, r.establishments)})` },
    { title: "With permit", dataIndex: "withPermit", align: "right", render: fmt },
    { title: "In ERMS", dataIndex: "inErms", align: "right", render: (v, r) => `${fmt(v)} (${pct(v, r.withPermit)})` },
    { title: "Not in ERMS", dataIndex: "notInErms", align: "right", render: fmt },
  ];
  return (
    <Card
      size="small"
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => q.refetch()} loading={q.isFetching}>Refresh</Button>
          <Button icon={<DownloadOutlined />} disabled={!rows.length} onClick={() => downloadCsv(`Accomplishment-${stamp()}.csv`, columns, [...rows, { province: "Total", ...total }])}>CSV</Button>
        </Space>
      }
    >
      <Table
        size="small"
        rowKey="province"
        loading={q.isLoading}
        columns={columns}
        dataSource={rows}
        pagination={false}
        scroll={{ x: true }}
        summary={() =>
          rows.length ? (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0}><Text strong>Total</Text></Table.Summary.Cell>
              {columns.slice(1).map((c, i) => (
                <Table.Summary.Cell key={c.dataIndex} index={i + 1} align="right">
                  <Text strong>{c.render(total[c.dataIndex], total)}</Text>
                </Table.Summary.Cell>
              ))}
            </Table.Summary.Row>
          ) : null
        }
      />
    </Card>
  );
}

function RenewalsTab() {
  const q = useQuery({ queryKey: ["ucds", "expiring", "report"], queryFn: () => fetchExpiringPermits(5000), staleTime: 2 * 60 * 1000 });
  // Worked out once per response, not on every render of the table.
  const rows = useMemo(
    () => (q.data?.data || []).map((r) => ({ ...r, permitList: (r.permits || []).map((p) => `${p.type} ${p.isExpired ? "expired" : "expires"} ${String(p.expiry).slice(0, 10)}`).join("; ") })),
    [q.data]
  );
  const columns = [
    { title: "Serial", dataIndex: "sort_key", width: 120 },
    { title: "Establishment", dataIndex: "title" },
    {
      title: "Permits",
      dataIndex: "permitList",
      render: (_, r) => (
        <Space size={4} wrap>
          {(r.permits || []).map((p) => (
            <Tag key={p.type} color={p.isExpired ? "red" : "gold"} style={{ marginInlineEnd: 0 }}>
              {p.type} {p.isExpired ? "expired" : "expires"} {String(p.expiry).slice(0, 10)}
            </Tag>
          ))}
        </Space>
      ),
    },
  ];
  return (
    <Card
      size="small"
      title={<Text type="secondary" style={{ fontSize: 12 }}>{fmt(q.data?.total)} establishments with a permit expired or expiring soon</Text>}
      extra={<Button icon={<DownloadOutlined />} disabled={!rows.length} onClick={() => downloadCsv(`Permits-to-renew-${stamp()}.csv`, [columns[0], columns[1], { title: "Permits", dataIndex: "permitList" }], rows)}>CSV</Button>}
    >
      <Table size="small" rowKey="sort_key" loading={q.isLoading} columns={columns} dataSource={rows} pagination={{ pageSize: 20, showSizeChanger: false }} scroll={{ x: true }} />
    </Card>
  );
}

function ErmsValidationTab() {
  const [province, setProvince] = useState("");
  // The whole list once; choosing a province filters it here, with no request.
  const q = useQuery({ queryKey: ["ucds", "not-in-erms"], queryFn: () => fetchNotInErms(null), staleTime: 5 * 60 * 1000 });
  const rows = useMemo(() => {
    const all = q.data || [];
    const wanted = province.replace(/_/g, " ").toLowerCase();
    return wanted ? all.filter((r) => String(r.province || "").toLowerCase() === wanted) : all;
  }, [q.data, province]);
  const columns = [
    { title: "Serial", dataIndex: "sort_key", width: 120 },
    { title: "Establishment", dataIndex: "title" },
    { title: "ECC / CNC", dataIndex: "ecc_cnc" },
    { title: "Date approved", dataIndex: "date_approved", render: (v) => String(v || "").slice(0, 10) },
    { title: "City", dataIndex: "city" },
    { title: "Province", dataIndex: "province" },
  ];
  return (
    <Card
      size="small"
      title={<Text type="secondary" style={{ fontSize: 12 }}>Permits in the register that the ERMS Document Library does not hold — {fmt(rows.length)} to validate</Text>}
      extra={
        <Space wrap>
          <Select value={province} onChange={setProvince} options={provinceOptions} style={{ minWidth: 180 }} />
          <Button icon={<DownloadOutlined />} disabled={!rows.length} onClick={() => downloadCsv(`ERMS-validation-${province || "all"}-${stamp()}.csv`, columns, rows)}>CSV</Button>
        </Space>
      }
    >
      <Table
        size="small"
        rowKey={(r) => `${r.sort_key}:${r.ecc_cnc}`}
        loading={q.isLoading}
        columns={columns}
        dataSource={rows}
        pagination={{ pageSize: 20, showSizeChanger: false }}
        scroll={{ x: true }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Every permit is in ERMS" /> }}
      />
    </Card>
  );
}

const UcdsReports = () => {
  // The Accomplishment and ERMS validation tabs read the same server-side
  // work (the register checked against ERMS). Started in the background while
  // the first tab is read, so those tabs open without the wait.
  const queryClient = useQueryClient();
  useEffect(() => {
    queryClient.prefetchQuery({ queryKey: ["ucds", "accomplishment"], queryFn: fetchAccomplishment, staleTime: 5 * 60 * 1000 });
  }, [queryClient]);
  return (
  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <PageHeader icon={<FileTextOutlined />} title="Reports" description="The Monitoring Plan as Excel, the accomplishment per province, permits to renew and the ERMS validation list." />
    <Tabs
      items={[
        { key: "monitoring-plan", label: "Monitoring Plan", children: <MonitoringPlanTab /> },
        { key: "accomplishment", label: "Accomplishment", children: <AccomplishmentTab /> },
        { key: "renewals", label: "Permits to renew", children: <RenewalsTab /> },
        { key: "erms", label: "ERMS validation", children: <ErmsValidationTab /> },
      ]}
    />
  </div>
  );
};

export default UcdsReports;
