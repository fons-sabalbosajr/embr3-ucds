import { useEffect, useRef, useState } from "react";
import { Alert, Button, Card, Dropdown, Empty, Input, Modal, Space, Steps, Table, Tag, Tooltip, Typography } from "antd";
import { BgColorsOutlined, CopyOutlined, DownloadOutlined, DownOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { message } from "../../../shared/feedback";
import { copyText } from "../../../shared/copyText";
import { getColourTargets } from "./progressService";
import { buildOfficeScript, ENCODED_FILL } from "./officeScript";
import { OpenFileButton } from "./ProvinceMatrix";
import { KIND_LABEL, n, unitLabel } from "./palette";

const { Text, Paragraph } = Typography;

// ---------------------------------------------------------------------------
// The Newly issued tab's "Colour them in the RAW files" (Developer only): per
// RAW workbook, the cells holding a newly issued permit the tracker found
// already encoded, and an Office Script that colours them light blue — run in
// Excel for the web by a Planning Unit member. The tracker itself never
// writes to the files (see officeScript.js).
// ---------------------------------------------------------------------------

const fileLabel = (name) =>
  String(name || "")
    .replace(/\.xls[xm]?$/i, "")
    .replace(/^(\d{4}_)?(Z_)?UNIVERSE_/i, "")
    .replace(/_RAW$/i, "")
    .replace(/_/g, " ");

/** The script, shown to copy by hand when the browser will not copy it: selected, Ctrl+C. */
function ScriptWindow({ script, onClose, onDownload }) {
  const box = useRef(null);
  const copyNow = async () => {
    if (await copyText(script?.text || "")) {
      message.success("Script copied. In Excel for the web: Automate › New Script › paste › Run.");
      onClose();
    } else {
      const el = box.current?.resizableTextArea?.textArea;
      el?.focus();
      el?.select();
      message.info("Press Ctrl+C (⌘C on a Mac) to copy the selected script, or use Download.");
    }
  };
  useEffect(() => {
    const t = setTimeout(() => {
      const el = box.current?.resizableTextArea?.textArea;
      el?.focus();
      el?.select();
    }, 80);
    return () => clearTimeout(t);
  }, [script]);
  return (
    <Modal open={Boolean(script)} onCancel={onClose} title={script?.title} width="min(900px, 94vw)"       footer={
        <Space>
          <Button onClick={onClose}>Close</Button>
          <Button icon={<DownloadOutlined />} onClick={onDownload}>
            Download
          </Button>
          <Button type="primary" icon={<CopyOutlined />} onClick={copyNow}>
            Copy
          </Button>
        </Space>
      }
      destroyOnHidden
    >
      <Alert type="info" showIcon style={{ marginBottom: 10 }} message="The browser would not copy it from the list. Press Copy below, or Ctrl+C (⌘C on a Mac) on the selected script, or use Download." />
      <Input.TextArea ref={box} value={script?.text || ""} readOnly autoSize={{ minRows: 12, maxRows: 22 }} style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: 12 }} />
    </Modal>
  );
}

export default function ColourEncoded() {
  const { data, isLoading, refetch, isFetching } = useQuery({ queryKey: ["admin", "progress-tracker", "colour-targets"], queryFn: getColourTargets, staleTime: 60 * 1000 });
  const [busy, setBusy] = useState(null);
  const [shown, setShown] = useState(null); // { title, text } when it must be copied by hand
  const files = data?.files || [];

  const scriptOf = (f, kinds) => buildOfficeScript(f, { kinds });
  const copy = async (f, kinds) => {
    const text = scriptOf(f, kinds);
    setBusy(f.id);
    try {
      if (await copyText(text)) {
        message.success("Script copied. In Excel for the web: Automate › New Script › paste › Run.");
      } else {
        // Copied by hand, then: the script shown, selected.
        setShown({ title: `Script — ${fileLabel(f.name)}${kinds ? ` (${kinds.map((k) => KIND_LABEL[k] || k).join(", ")})` : ""}`, text, file: f, kinds });
      }
    } finally {
      setBusy(null);
    }
  };
  const download = (f, kinds) => {
    const blob = new Blob([scriptOf(f, kinds)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Colour-encoded-permits-${fileLabel(f.name).replace(/\s+/g, "-")}${kinds ? `-${kinds.join("-")}` : ""}.ts`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const columns = [
    {
      title: "RAW file",
      key: "file",
      render: (_, f) => (
        <Space direction="vertical" size={0}>
          <Text strong>{fileLabel(f.name)}</Text>
          <Text type="secondary" style={{ fontSize: 11.5 }}>
            {f.units.map(unitLabel).join(", ")}
            {f.version ? ` · read at v${f.version}` : ""}
          </Text>
        </Space>
      ),
    },
    {
      title: "Permits to colour",
      key: "cells",
      width: "34%",
      render: (_, f) => {
        const by = {};
        for (const t of f.targets) by[t.listKind] = (by[t.listKind] || 0) + 1;
        return (
          <Space size={[4, 4]} wrap>
            <b>{n(f.targets.length)}</b>
            {Object.entries(by).map(([k, c]) => (
              <Tag key={k} style={{ marginInlineEnd: 0 }}>
                {KIND_LABEL[k] || k} {n(c)}
              </Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: "Now",
      key: "now",
      width: "20%",
      render: (_, f) => {
        const already = f.targets.filter((t) => `#${String(t.fill || "").toUpperCase()}` === ENCODED_FILL).length;
        const other = f.targets.filter((t) => t.fill && `#${String(t.fill).toUpperCase()}` !== ENCODED_FILL).length;
        return (
          <Space direction="vertical" size={0} style={{ fontSize: 12 }}>
            <span>
              <Text type="secondary">To colour:</Text> {n(f.targets.length - already - other)}
            </span>
            <Tooltip title="Already light blue">
              <span>
                <Text type="secondary">Already done:</Text> {n(already)}
              </span>
            </Tooltip>
            <Tooltip title="Their permit cell has another colour: the script leaves those rows as they are (its OVERWRITE switch changes that)">
              <span>
                <Text type="secondary">Keep their colour:</Text> {n(other)}
              </span>
            </Tooltip>
          </Space>
        );
      },
    },
    {
      title: "Script",
      key: "script",
      width: 250,
      render: (_, f) => {
        const kinds = [...new Set(f.targets.map((t) => t.listKind))];
        const items = [
          { key: "all-dl", icon: <DownloadOutlined />, label: "Download the script (.ts)", onClick: () => download(f) },
          ...(kinds.length > 1
            ? [
                { type: "divider" },
                ...kinds.map((k) => ({ key: `k-${k}`, icon: <CopyOutlined />, label: `Copy for ${KIND_LABEL[k] || k} only`, onClick: () => copy(f, [k]) })),
              ]
            : []),
        ];
        return (
          <Space size={6}>
            <Dropdown.Button size="small" type="primary" loading={busy === f.id} menu={{ items }} icon={<DownOutlined />} onClick={() => copy(f)}>
              <CopyOutlined /> Copy script
            </Dropdown.Button>
            <OpenFileButton files={[{ name: f.name, webUrl: f.webUrl }]} label="Open" />
          </Space>
        );
      },
    },
  ];

  return (
    <Card
      size="small"
      className="pt-card"
      title={
        <Space>
          <BgColorsOutlined />
          Colour the encoded permits in the RAW files
          <span className="ce-swatch" style={{ background: ENCODED_FILL }} title={`Light blue ${ENCODED_FILL}`} />
        </Space>
      }
      extra={
        <Button size="small" onClick={() => refetch()} loading={isFetching}>
          Refresh
        </Button>
      }
    >
      <Paragraph type="secondary" style={{ fontSize: 12.5, marginBottom: 10 }}>
        The newly issued permits the tracker found already encoded. The tracker does not change the RAW files itself: a script for each file colours the whole row of each of
        those firms light blue — so the accomplished and updated ones read at a glance — when a Planning Unit member runs it in Excel for the web — under their own account, safe while others edit, undone from the file&rsquo;s Version History if need be.
        A row whose permit cell already has another colour keeps it.
      </Paragraph>
      <Steps
        size="small"
        className="ce-steps"
        items={[
          { title: "Copy the script", description: "for a file, below" },
          { title: "Open the file", description: "in Excel for the web" },
          { title: "Automate › New Script", description: "paste over the sample" },
          { title: "Run", description: "the firms' rows turn light blue" },
        ]}
      />
      {files.some((f) => f.targets.length > 1500) && (
        <Alert type="info" showIcon style={{ margin: "10px 0" }} message="A large file: if Excel says the script ran out of time, copy it one kind of permit at a time (the arrow beside Copy script)." />
      )}
      <ScriptWindow script={shown} onClose={() => setShown(null)} onDownload={() => shown && download(shown.file, shown.kinds)} />
      {isLoading ? (
        <Card loading bordered={false} />
      ) : files.length ? (
        <Table size="small" rowKey="id" pagination={false} columns={columns} dataSource={files} style={{ marginTop: 10 }} scroll={{ x: 820 }} />
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={data?.ready === false ? "The files are being read — the cells to colour appear after the next look at the files." : "No newly issued permit is encoded in the RAW files yet."}
        />
      )}
    </Card>
  );
}
