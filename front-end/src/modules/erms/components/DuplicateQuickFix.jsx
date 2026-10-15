import { Alert, Button, Collapse, Empty, Popconfirm, Space, Table, Tag, Typography } from "antd";
import { CheckOutlined, EyeInvisibleOutlined, RollbackOutlined, ToolOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { message } from "../../../shared/feedback";
import { VeraFlame } from "../../vera/VeraMark";
import { describeApiError, dismissDuplicate, fetchDuplicateReview, fixDuplicates, restoreDuplicate } from "../api/ermsService";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// Under the Duplicates table: VERA reads each group and says whether it is
// one document filed twice (she can fix it — keep the most complete entry,
// move a scan to it, set the rest aside), legitimate (an amendment,
// attachments, a name reused — "Not a duplicate" hides it), or something for
// a person to look at. Set-aside entries can be restored from here.
// ---------------------------------------------------------------------------

const VERDICT = {
  duplicate: { color: "red", label: "Filed twice" },
  legitimate: { color: "green", label: "Legitimate" },
  review: { color: "gold", label: "For you to check" },
};

const duplicateReviewKey = (unit) => ["erms", "duplicate-review", unit];

const DuplicateQuickFix = ({ unit }) => {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: duplicateReviewKey(unit), queryFn: () => fetchDuplicateReview(unit), staleTime: 60 * 1000 });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: duplicateReviewKey(unit) });
    queryClient.invalidateQueries({ queryKey: ["erms"] });
  };
  const fail = (fallback) => (e) => message.error(describeApiError(e, fallback));
  const fix = useMutation({
    mutationFn: (vars) => fixDuplicates({ unit, ...vars }),
    onSuccess: (r) => {
      refresh();
      message.success(`VERA fixed ${r.groups} group(s): ${r.setAside} extra entr${r.setAside === 1 ? "y" : "ies"} set aside.`);
    },
    onError: fail("The duplicates could not be fixed."),
  });
  const dismiss = useMutation({ mutationFn: (key) => dismissDuplicate({ unit, key }), onSuccess: refresh, onError: fail("That could not be done.") });
  const restore = useMutation({
    mutationFn: (serialNo) => restoreDuplicate({ unit, serialNo }),
    onSuccess: (_, serialNo) => {
      refresh();
      message.success(`${serialNo} is back.`);
    },
    onError: fail("It could not be restored."),
  });

  if (error) return <Alert type="error" showIcon message={describeApiError(error, "VERA could not read the duplicates.")} />;
  const groups = data?.groups || [];
  const fixable = groups.filter((g) => g.verdict === "duplicate");
  const canFix = Boolean(data?.canFix);

  const columns = [
    { title: unit === "records" ? "Permit number" : "File name", dataIndex: "value", key: "value", width: 240, render: (v) => <Text style={{ fontFamily: unit === "records" ? "monospace" : undefined, overflowWrap: "anywhere" }}>{v}</Text> },
    { title: "VERA reads it as", dataIndex: "verdict", key: "verdict", width: 150, render: (v) => <Tag color={VERDICT[v]?.color}>{VERDICT[v]?.label || v}</Tag> },
    {
      title: "Why",
      key: "why",
      render: (_, g) => (
        <Space direction="vertical" size={2}>
          <Text style={{ fontSize: 12 }}>{g.reason}</Text>
          {g.verdict === "duplicate" && (
            <Space size={4} wrap>
              <Tag color="green" style={{ fontFamily: "monospace" }}>keep {g.keep}</Tag>
              {g.setAside.map((s) => <Tag key={s} style={{ fontFamily: "monospace" }}>set aside {s}</Tag>)}
            </Space>
          )}
        </Space>
      ),
    },
    {
      title: "",
      key: "act",
      width: 190,
      render: (_, g) =>
        canFix && (
          <Space size={4} wrap>
            {g.verdict === "duplicate" && (
              <Popconfirm title={`Keep ${g.keep} and set ${g.setAside.length} aside?`} description="Set-aside entries can be restored below." okText="Fix" onConfirm={() => fix.mutate({ keys: [g.key] })}>
                <Button size="small" type="primary" icon={<ToolOutlined />} loading={fix.isPending && fix.variables?.keys?.includes(g.key)}>Fix</Button>
              </Popconfirm>
            )}
            {g.verdict !== "duplicate" && (
              <Button size="small" icon={<EyeInvisibleOutlined />} loading={dismiss.isPending && dismiss.variables === g.key} onClick={() => dismiss.mutate(g.key)}>Not a duplicate</Button>
            )}
          </Space>
        ),
    },
  ];

  return (
    <div style={{ marginTop: 16, borderTop: "1px dashed rgba(128,128,128,.35)", paddingTop: 12 }}>
      <Space style={{ width: "100%", justifyContent: "space-between", marginBottom: 8 }} wrap>
        <Space size={8}>
          <VeraFlame size={22} state={fix.isPending ? "working" : "burning"} glow={false} label="" />
          <Text strong>Quick fix with VERA</Text>
          {!isLoading && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {fixable.length} filed twice · {groups.filter((g) => g.verdict === "legitimate").length} legitimate · {groups.filter((g) => g.verdict === "review").length} to check
            </Text>
          )}
        </Space>
        {canFix ? (
          <Popconfirm
            title={`Let VERA fix all ${fixable.length}?`}
            description="In each, she keeps the most complete entry, moves a scan to it if needed, and sets the others aside — they can be restored."
            okText="Fix all"
            disabled={!fixable.length}
            onConfirm={() => fix.mutate({ all: true })}
          >
            <Button type="primary" icon={<CheckOutlined />} disabled={!fixable.length} loading={fix.isPending && fix.variables?.all}>
              Fix all {fixable.length}
            </Button>
          </Popconfirm>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>The Developer or an administrator applies the fixes.</Text>
        )}
      </Space>
      <Table
        size="small"
        rowKey="key"
        loading={isLoading}
        columns={columns}
        dataSource={groups}
        pagination={{ pageSize: 10, hideOnSinglePage: true }}
        scroll={{ x: "max-content" }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing for VERA to fix" /> }}
      />
      {data?.setAside?.length > 0 && (
        <Collapse
          size="small"
          style={{ marginTop: 12 }}
          items={[
            {
              key: "aside",
              label: `Set aside (${data.setAside.length})`,
              children: (
                <Table
                  size="small"
                  rowKey="id"
                  pagination={{ pageSize: 10, hideOnSinglePage: true }}
                  dataSource={data.setAside}
                  columns={[
                    { title: "Entry", dataIndex: "serialNo", key: "s", render: (s) => <Text style={{ fontFamily: "monospace" }}>{s}</Text> },
                    { title: "Kept instead", dataIndex: "keptSerialNo", key: "k", render: (s) => <Text style={{ fontFamily: "monospace" }}>{s}</Text> },
                    { title: "When", key: "w", render: (_, r) => <Text type="secondary" style={{ fontSize: 12 }}>{new Date(r.setAsideAt).toLocaleString()} · {r.setAsideBy}</Text> },
                    { title: "", key: "a", width: 110, render: (_, r) => canFix && <Button size="small" icon={<RollbackOutlined />} loading={restore.isPending && restore.variables === r.serialNo} onClick={() => restore.mutate(r.serialNo)}>Restore</Button> },
                  ]}
                />
              ),
            },
          ]}
        />
      )}
    </div>
  );
};

export default DuplicateQuickFix;
