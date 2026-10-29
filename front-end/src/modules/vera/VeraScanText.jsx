import { useState } from "react";
import { Alert, Button, Card, InputNumber, Select, Space, Typography } from "antd";
import { FileSearchOutlined } from "@ant-design/icons";
import { useMutation } from "@tanstack/react-query";
import { message } from "../../shared/feedback";
import { readNextScans } from "./veraService";

const { Paragraph, Text } = Typography;

// ---------------------------------------------------------------------------
// Admin Settings › VERA Assistant › Scan text — VERA reads the text of the
// next few scans (one AI call each), so the Document Library's search finds
// documents by what their scans say. A few at a time on purpose: every read
// costs a call, and the text is stored on a database with little room.
// ---------------------------------------------------------------------------

const VeraScanText = () => {
  const [unit, setUnit] = useState("records");
  const [limit, setLimit] = useState(10);
  const [last, setLast] = useState(null);
  const run = useMutation({
    mutationFn: () => readNextScans({ unit, limit }),
    onSuccess: (r) => {
      setLast(r);
      const summary = `VERA read ${r.read} scan(s)${r.failed ? `; ${r.failed} to try again tomorrow` : ""}${r.unreadable ? `; ${r.unreadable} not a readable PDF` : ""}. ${r.left.toLocaleString()} left.`;
      if (r.stopped) message.warning(`${summary} She stopped early: ${r.stopped}`);
      else message.success(summary);
    },
    onError: (e) => message.error(e?.response?.data?.message || "The scans could not be read."),
  });
  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Paragraph type="secondary" style={{ margin: 0 }}>
        Most scans are pictures of paper: their words cannot be searched. VERA reads the first pages of each and keeps the first 1,500 characters on the document, and the Document Library&rsquo;s search then finds it by what it says. One AI call per document, so a few at a time; a single document can also be read from its own page.
      </Paragraph>
      <Card size="small" title={<Space><FileSearchOutlined />Read the next scans</Space>}>
        <Space wrap>
          <Select value={unit} onChange={setUnit} style={{ width: 170 }} options={[{ value: "records", label: "Records" }, { value: "legal", label: "Legal Services" }, { value: "laboratory", label: "Laboratory" }]} />
          <InputNumber min={1} max={50} value={limit} onChange={(v) => setLimit(v || 10)} suffix="documents" style={{ width: 170 }} />
          <Button type="primary" loading={run.isPending} onClick={() => run.mutate()}>Read with VERA</Button>
        </Space>
        {last && (
          <Alert
            style={{ marginTop: 12 }}
            type={last.stopped ? "warning" : "info"}
            showIcon
            message={
              <Text>
                Read {last.read}
                {last.failed ? `, ${last.failed} the model could not read (tried again after a day)` : ""}
                {last.unreadable ? `, ${last.unreadable} not a readable PDF` : ""} — {last.left.toLocaleString()} documents with a scan still to read.
              </Text>
            }
            description={last.stopped ? `VERA stopped early: ${last.stopped}` : undefined}
          />
        )}
      </Card>
    </Space>
  );
};

export default VeraScanText;
