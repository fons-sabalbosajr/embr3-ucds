import { useState } from "react";
import { Alert, Empty, Input, Modal, Radio, Skeleton, Space, Tag, Typography } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { message } from "../../../shared/feedback";
import { describeApiError, fetchMoveSuggestions, moveRecordFile } from "../api/ermsService";
import { VeraFlame } from "../../vera/VeraMark";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// Move a record's scan to the record it belongs to — the Developer's or an
// administrator's. VERA suggests where: records whose permit number is in the
// file's name, or whose proponent and project share its words, those without
// a scan first. Or any FSN, typed. The file stays where it is on the share;
// only which record points at it changes.
// ---------------------------------------------------------------------------

const MoveFileModal = ({ open, record, onClose }) => {
  const queryClient = useQueryClient();
  const [choice, setChoice] = useState(null);
  const [typed, setTyped] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["erms", "move-suggestions", record?.serialNo],
    queryFn: () => fetchMoveSuggestions(record.serialNo),
    enabled: open && Boolean(record?.serialNo),
    staleTime: 0,
  });
  const target = (typed.trim() || choice || "").toUpperCase();

  const move = useMutation({
    mutationFn: () => moveRecordFile({ serialNo: record.serialNo, toSerialNo: target }),
    onSuccess: (res) => {
      message.success(`Moved “${res.fileName || "the scan"}” from ${res.from} to ${res.to}.`);
      queryClient.invalidateQueries({ queryKey: ["erms"] });
      setChoice(null);
      setTyped("");
      onClose(res);
    },
    onError: (e) => message.error(describeApiError(e, "The scan could not be moved.")),
  });

  return (
    <Modal
      open={open}
      title="Move the scan to another record"
      okText={target ? `Move to ${target}` : "Move"}
      okButtonProps={{ disabled: !target || target === record?.serialNo }}
      confirmLoading={move.isPending}
      onOk={() => move.mutate()}
      onCancel={() => onClose(null)}
      width="min(760px, 96vw)"
      destroyOnHidden
    >
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Text>
          <Text type="secondary">Scan:</Text> <Text strong>{record?.document?.fileName || "—"}</Text>{" "}
          <Text type="secondary">on</Text> <Text style={{ fontFamily: "monospace" }}>{record?.serialNo}</Text>
        </Text>
        <Alert
          type="info"
          showIcon
          message="The file stays where it is on the share; only the record it is filed against changes. Both records keep a note of the move in their history."
        />
        <Space size={6}>
          <VeraFlame size={16} />
          <Text strong>Where VERA thinks it belongs</Text>
        </Space>
        {error ? (
          <Alert type="error" showIcon message={describeApiError(error, "VERA could not suggest a record.")} />
        ) : isLoading ? (
          <Skeleton active paragraph={{ rows: 3 }} />
        ) : !data?.suggestions?.length ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No record matches the file's name. Type the FSN below." />
        ) : (
          <Radio.Group value={typed ? null : choice} onChange={(e) => { setChoice(e.target.value); setTyped(""); }} style={{ width: "100%" }}>
            <Space direction="vertical" style={{ width: "100%" }}>
              {data.suggestions.map((s) => (
                <Radio key={s.serialNo} value={s.serialNo} disabled={s.hasDocument} style={{ alignItems: "flex-start" }}>
                  <Space direction="vertical" size={0}>
                    <Space size={6} wrap>
                      <Text style={{ fontFamily: "monospace" }}>{s.serialNo}</Text>
                      {s.permitNumber && <Tag>{s.permitNumber}</Tag>}
                      <Tag color={s.score >= 70 ? "green" : s.score >= 45 ? "gold" : "default"}>{s.score}% match</Tag>
                      {s.hasDocument && <Tag color="red">has its own scan</Tag>}
                    </Space>
                    <Text>{[s.proponentName, s.projectTitle].filter(Boolean).join(" — ")}</Text>
                    {s.why && <Text type="secondary" style={{ fontSize: 12 }}>{s.why}</Text>}
                  </Space>
                </Radio>
              ))}
            </Space>
          </Radio.Group>
        )}
        <div>
          <Text type="secondary">Or the record&rsquo;s FSN:</Text>
          <Input placeholder="FSN-0001234" value={typed} onChange={(e) => setTyped(e.target.value)} allowClear style={{ fontFamily: "monospace", marginTop: 4 }} />
        </div>
      </Space>
    </Modal>
  );
};

export default MoveFileModal;
