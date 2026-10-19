import { Alert, Card, Collapse, Empty, Space, Table, Tag, Tooltip, Typography } from "antd";
import { SafetyOutlined, WarningOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { OpenFileButton } from "./ProvinceMatrix";
import { KIND_LABEL, n, unitLabel } from "./palette";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// The Progress Tracker's Validation tab (Developer only): colouring that does
// not mean what it says.
//
//   Highlighted without validating — a row coloured as updated since the
//     baseline while a permit newly issued to that firm (its project or
//     proponent on the newly issued list) is still nowhere in the RAW data.
//   Highlighted but not encoded — a permit coloured on its newly issued list
//     (the masterlist holder's "written in") since the baseline, while its
//     number is not in the RAW data.
//   Highlighted in bulk — one save that coloured a block of rows quickly,
//     with nothing on most of them changed.
//
// The server works both out on every save it reads and tells the Developers
// (services/progressTracker checkValidation, bulkHighlight); this lists them.
// ---------------------------------------------------------------------------

const fileTitle = (name) => String(name || "").replace(/\.xls[xm]?$/i, "");

const rowColumns = [
  {
    title: "Row",
    key: "at",
    width: 130,
    render: (_, r) => (
      <Space direction="vertical" size={0}>
        <Text code>{`${r.sheet}!${r.row}`}</Text>
        <Text type="secondary" style={{ fontSize: 11.5 }}>{r.serial}</Text>
      </Space>
    ),
  },
  {
    title: "Firm",
    key: "firm",
    render: (_, r) => (
      <Space direction="vertical" size={0}>
        <Text strong>{r.title || "—"}</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>{r.name || ""}</Text>
      </Space>
    ),
  },
  {
    title: "Highlight",
    key: "fill",
    width: 150,
    render: (_, r) => (
      <Space size={6} wrap>
        <Tooltip title={`#${r.fill}`}>
          <span className="pt-swatch is-small" style={{ background: `#${r.fill}` }} />
        </Tooltip>
        {r.unchanged && (
          <Tooltip title="Nothing on this row changed since the baseline: it was coloured, not worked on.">
            <Tag color="red" style={{ marginInlineEnd: 0 }}>Unchanged</Tag>
          </Tooltip>
        )}
        {r.byScript && (
          <Tooltip title="Coloured light blue by the tracker's script, for another permit of this firm already encoded.">
            <Tag style={{ marginInlineEnd: 0 }}>Script</Tag>
          </Tooltip>
        )}
      </Space>
    ),
  },
  {
    title: "Newly issued, not in the RAW data",
    key: "missing",
    render: (_, r) => (
      <Space direction="vertical" size={2}>
        {r.missing.map((m) => (
          <Space key={m.permit} size={6} wrap>
            <Tag color="volcano" style={{ marginInlineEnd: 0 }}>{KIND_LABEL[m.kind] || m.kind}</Tag>
            <Text code>{m.permit}</Text>
          </Space>
        ))}
      </Space>
    ),
  },
];

// A permit list's flagged row: the permit, its firm, where it sits on the list.
const permitColumns = [
  { title: "Row", key: "at", width: 130, render: (_, r) => (r.sheet ? <Text code>{`${r.sheet}!${r.row}`}</Text> : "—") },
  {
    title: "Permit",
    key: "permit",
    render: (_, r) => (
      <Space size={6} wrap>
        <Tag color="volcano" style={{ marginInlineEnd: 0 }}>{KIND_LABEL[r.missing[0]?.kind] || r.missing[0]?.kind}</Tag>
        <Text code>{r.missing[0]?.permit}</Text>
      </Space>
    ),
  },
  { title: "Issued to", key: "firm", render: (_, r) => r.title || <Text type="secondary">—</Text> },
  { title: "Province", key: "unit", width: 120, render: (_, r) => (r.unit ? unitLabel(r.unit) : "—") },
  {
    title: "Highlight",
    key: "fill",
    width: 90,
    render: (_, r) => (
      <Tooltip title={`#${r.fill}`}>
        <span className="pt-swatch is-small" style={{ background: `#${r.fill}` }} />
      </Tooltip>
    ),
  },
];

/** The flagged files of one kind, a panel each. */
function FileList({ files, columns, what }) {
  return (
    <Collapse
      size="small"
      defaultActiveKey={files.length === 1 ? [files[0].id] : []}
      items={files.map((f) => ({
        key: f.id,
        label: (
          <Space size={8} wrap>
            <Text strong>{fileTitle(f.name)}</Text>
            <Tag color="red" style={{ marginInlineEnd: 0 }}>{n(f.flagged)} {what}{f.flagged === 1 ? "" : "s"}</Tag>
            {f.unchanged > 0 && <Tag style={{ marginInlineEnd: 0 }}>{n(f.unchanged)} unchanged</Tag>}
            <Text type="secondary" style={{ fontSize: 12 }}>
              {f.units.map(unitLabel).join(", ")}
              {f.modifiedBy ? ` · last saved by ${f.modifiedBy}` : ""}
              {f.at ? ` · checked ${dayjs(f.at).fromNow()}` : ""}
            </Text>
          </Space>
        ),
        extra: <OpenFileButton files={[f.open].filter(Boolean)} />,
        children: (
          <>
            <Table size="small" rowKey={(r) => `${r.sheet}!${r.row}|${r.missing[0]?.permit}`} pagination={{ pageSize: 20, hideOnSinglePage: true }} columns={columns} dataSource={f.rows} scroll={{ x: 760 }} />
            {f.flagged > f.rows.length && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                The first {n(f.rows.length)} of {n(f.flagged)} are listed.
              </Text>
            )}
          </>
        ),
      }))}
    />
  );
}

export default function ValidationWarnings({ validation, events = [] }) {
  const v = validation || { flagged: 0, unchanged: 0, unencoded: 0, files: [] };
  const bulk = events.filter((e) => e.kind === "warning" && e.check === "bulk");
  const rawFiles = v.files.filter((f) => f.kind !== "permits");
  const permitFiles = v.files.filter((f) => f.kind === "permits");

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      {v.unencoded > 0 && (
        <Alert
          type="error"
          showIcon
          icon={<WarningOutlined />}
          message={`${n(v.unencoded)} permit${v.unencoded === 1 ? " is" : "s are"} highlighted on the newly issued lists but not in the RAW data`}
          description="Each was coloured on its list since the baseline, which counts as written into the RAW data, yet its number is on no RAW file. Ask the masterlist holder to encode these, or to take the colour off."
        />
      )}
      {v.flagged ? (
        <Alert
          type="error"
          showIcon
          icon={<WarningOutlined />}
          message={`${n(v.flagged)} row${v.flagged === 1 ? "" : "s"} highlighted as updated without the newly issued permit`}
          description={`Each was coloured since the baseline, yet a permit newly issued to that firm is not written anywhere in the RAW data${v.unchanged ? `; on ${n(v.unchanged)} of them nothing on the row changed at all` : ""}. Ask the person who saved the file to validate these rows against the newly issued lists.`}
        />
      ) : (
        !v.unencoded && <Alert type="success" showIcon icon={<SafetyOutlined />} message="No highlighted row is missing a newly issued permit." description="Every RAW row coloured since the baseline carries its firm's newly issued permits or has none on the lists, and every permit highlighted on a newly issued list is in the RAW data." />
      )}

      {rawFiles.length > 0 && (
        <Card size="small" className="pt-card" title="Highlighted without validating" extra={<Text type="secondary" className="pt-card-hint">by RAW file</Text>}>
          <FileList files={rawFiles} columns={rowColumns} what="row" />
        </Card>
      )}

      {permitFiles.length > 0 && (
        <Card size="small" className="pt-card" title="Highlighted on the newly issued lists, not encoded" extra={<Text type="secondary" className="pt-card-hint">by newly issued list</Text>}>
          <FileList files={permitFiles} columns={permitColumns} what="permit" />
        </Card>
      )}

      <Card size="small" className="pt-card" title="Highlighted in bulk" extra={<Text type="secondary" className="pt-card-hint">recent saves</Text>}>
        {bulk.length ? (
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={bulk}
            columns={[
              { title: "When", key: "at", width: 150, render: (_, e) => dayjs(e.at).format("MMM D, h:mm A") },
              { title: "File", key: "file", render: (_, e) => <Text strong>{fileTitle(e.name)}</Text> },
              { title: "Saved by", dataIndex: "modifiedBy", render: (v2) => v2 || "—" },
              {
                title: "Coloured",
                key: "rows",
                render: (_, e) => (
                  <Text>
                    <b>{n(e.rows)}</b> rows in about {n(e.minutes)} min · <Text type="danger">{n(e.unchanged)} unchanged</Text>
                  </Text>
                ),
              },
            ]}
            scroll={{ x: 640 }}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No save coloured a block of rows without changing them." />
        )}
      </Card>
    </Space>
  );
}
