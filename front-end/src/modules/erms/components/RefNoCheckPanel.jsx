import { Alert, Button, Popconfirm, Space, Tag, Tooltip, Typography } from "antd";
import { CheckOutlined, FileSearchOutlined, UndoOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { message } from "../../../shared/feedback";
import { describeApiError, fetchRefCheck, runRefCheck, settleRefCheck } from "../api/ermsService";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// Does the encoded Ref. No. match the scan? VERA reads the number printed on
// the document — without being told the encoded one — and the two are
// compared (server services/vera/refNoCheck). Where they differ, whoever may
// edit the record puts the scan's number on it, or keeps the encoded one.
// Nothing changes on the record until they do; an applied number can be undone.
// ---------------------------------------------------------------------------

const CONFIDENCE = { high: "green", medium: "gold", low: "default" };
const mono = { fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" };
const when = (c) => [c.checkedAt ? new Date(c.checkedAt).toLocaleString() : null, c.checkedBy].filter(Boolean).join(" by ");

const RefNoCheckPanel = ({ serialNo, canWrite, onOpenRecord }) => {
  const queryClient = useQueryClient();
  const key = ["erms", "ref-check", serialNo];
  const { data: check, isLoading } = useQuery({ queryKey: key, queryFn: () => fetchRefCheck(serialNo), retry: false });

  const run = useMutation({
    mutationFn: () => runRefCheck({ serialNo, force: Boolean(check) }),
    onSuccess: (c) => {
      queryClient.setQueryData(key, c);
      if (c.status === "match") message.success("The Ref. No. matches the scan.");
      else if (c.status === "differs" || c.status === "missing") message.warning("The scan carries a different Ref. No.");
    },
    onError: (e) => message.error(describeApiError(e, "VERA could not read the scan.")),
  });
  const settle = useMutation({
    mutationFn: (action) => settleRefCheck({ serialNo, action }),
    onSuccess: (r, action) => {
      queryClient.setQueryData(key, r.check);
      // The record's number, its register link and the lists change with it.
      queryClient.invalidateQueries({ queryKey: ["erms"] });
      message.success(action === "apply" ? "The Ref. No. now matches the scan." : action === "undo" ? "The earlier Ref. No. is back." : "The encoded Ref. No. stands.");
    },
    onError: (e) => message.error(describeApiError(e, "That could not be done.")),
  });

  if (isLoading) return null;
  if (!check && !canWrite) return null;

  const checkButton = canWrite && (
    <Button size="small" icon={<FileSearchOutlined />} loading={run.isPending} onClick={() => run.mutate()}>
      {check ? "Check again" : "Check with VERA"}
    </Button>
  );

  if (!check) {
    return (
      <Alert
        type="info"
        showIcon
        icon={<FileSearchOutlined />}
        message="Does the Ref. No. match the scan?"
        description="VERA reads the number printed on the document and compares it with the one encoded here. One AI call; nothing on the record changes unless you apply it."
        action={checkButton}
      />
    );
  }

  const reading = (
    <Space size={4} wrap>
      <Text type="secondary">The scan reads</Text>
      <Text strong style={mono}>{check.onScan}</Text>
      {check.label && <Text type="secondary" style={{ fontSize: 12 }}>(&ldquo;{check.label}&rdquo;)</Text>}
      {check.confidence && <Tag color={CONFIDENCE[check.confidence]}>{check.confidence}</Tag>}
    </Space>
  );
  const footer = <Text type="secondary" style={{ fontSize: 12 }}>Checked {when(check)}</Text>;

  if (check.status === "match") {
    return (
      <Alert
        type="success"
        showIcon
        message="The Ref. No. matches the scan"
        description={
          <Space direction="vertical" size={2}>
            {reading}
            {check.writtenDifferently && <Text type="secondary" style={{ fontSize: 12 }}>Written with different spacing or punctuation on the scan — the same number.</Text>}
            {footer}
          </Space>
        }
        action={checkButton}
      />
    );
  }

  if (check.status === "applied") {
    return (
      <Alert
        type="success"
        showIcon
        message="Ref. No. corrected from the scan"
        description={
          <Space direction="vertical" size={2}>
            <Text>
              <Text delete style={mono}>{check.previous || "(none)"}</Text> → <Text strong style={mono}>{check.proposed}</Text>
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Applied {check.appliedAt ? new Date(check.appliedAt).toLocaleString() : ""}{check.appliedBy ? ` by ${check.appliedBy}` : ""}
            </Text>
          </Space>
        }
        action={
          canWrite && (
            <Popconfirm title={`Put ${check.previous || "the empty Ref. No."} back?`} okText="Undo" onConfirm={() => settle.mutate("undo")}>
              <Button size="small" icon={<UndoOutlined />} loading={settle.isPending}>Undo</Button>
            </Popconfirm>
          )
        }
      />
    );
  }

  if (check.status === "differs" || check.status === "missing" || check.status === "kept") {
    const kept = check.status === "kept";
    return (
      <Alert
        type={kept ? "info" : "warning"}
        showIcon
        message={kept ? "The encoded Ref. No. was kept" : check.status === "missing" ? "No Ref. No. encoded — the scan has one" : "The Ref. No. does not match the scan"}
        description={
          <Space direction="vertical" size={4}>
            <Space size={4} wrap>
              <Text type="secondary">Encoded</Text>
              <Text style={mono}>{check.encoded || "(none)"}</Text>
            </Space>
            {reading}
            {check.encodedMentioned && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                The scan also names {check.encoded} — it may be an amendment citing its original ECC. Look at the scan before replacing it.
              </Text>
            )}
            {check.clash && (
              <Text type="danger" style={{ fontSize: 12 }}>
                {check.proposed} is already on{" "}
                <a href={`/e-universe/erms/records/${encodeURIComponent(check.clash.serialNo)}`} onClick={(e) => { if (onOpenRecord) { e.preventDefault(); onOpenRecord(check.clash.serialNo); } }}>
                  {check.clash.serialNo}
                </a>
                {check.clash.proponentName ? ` (${check.clash.proponentName})` : ""}. This scan is probably filed against the wrong record — move it there rather than change the number.
              </Text>
            )}
            {kept && check.dismissedBy && <Text type="secondary" style={{ fontSize: 12 }}>Kept by {check.dismissedBy}</Text>}
            {footer}
          </Space>
        }
        action={
          canWrite && (
            <Space direction="vertical" size={4} align="end">
              <Popconfirm
                title={`Change the Ref. No. to ${check.proposed}?`}
                description="The register link is worked out again from the new number. It can be undone."
                okText="Use the scan's number"
                onConfirm={() => settle.mutate("apply")}
                disabled={Boolean(check.clash)}
              >
                <Tooltip title={check.clash ? `Already on ${check.clash.serialNo}` : null}>
                  <Button size="small" type="primary" icon={<CheckOutlined />} disabled={Boolean(check.clash)} loading={settle.isPending && settle.variables === "apply"}>
                    Use {check.proposed}
                  </Button>
                </Tooltip>
              </Popconfirm>
              {!kept && (
                <Button size="small" loading={settle.isPending && settle.variables === "keep"} onClick={() => settle.mutate("keep")}>
                  Keep the encoded one
                </Button>
              )}
              {checkButton}
            </Space>
          )
        }
      />
    );
  }

  // unreadable / failed
  return (
    <Alert
      type="info"
      showIcon
      message={check.status === "unreadable" ? "VERA could not read a Ref. No. on the scan" : "The scan could not be checked"}
      description={
        <Space direction="vertical" size={2}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {check.failure || "No number on the first pages could be read with certainty — a faint or handwritten scan, or the number is further in."}
          </Text>
          {footer}
        </Space>
      }
      action={checkButton}
    />
  );
};

export default RefNoCheckPanel;
