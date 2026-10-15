import {
  Button,
  Card,
  Select,
  Space,
  Tag,
  Typography,
} from "antd";
import { InboxOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { assignToBox, describeApiError, fetchBoxes } from "../api/ermsService";
import { message } from "../../../shared/feedback";

/** Where this record physically sits. */
/** `unit`: a Legal or Laboratory document, into its unit's boxes; omitted, a record. */
const BoxAssignment = ({ record, canWrite, unit }) => {
  const queryClient = useQueryClient();

  const { data: boxes = [] } = useQuery({
    queryKey: ["erms", "boxes", unit || "records"],
    queryFn: () => fetchBoxes(undefined, unit),
    enabled: canWrite,
  });

  const mutation = useMutation({
    mutationFn: (vars) => assignToBox({ ...vars, unit }),
    onSuccess: (result) => {
      message.success(
        result.archive ? `Filed into box ${result.archive.boxCode}.` : "Removed from its box."
      );
      queryClient.invalidateQueries({ queryKey: ["erms"] });
    },
    onError: (e) => message.error(describeApiError(e, "Could not change the box.")),
  });

  const current = record.archive?.boxCode || null;
  // Only open boxes accept records; the API refuses the rest.
  const openBoxes = boxes.filter((b) => b.status === "open" || b.code === current);

  return (
    <Card title="Archive box" size="small">
      <Space direction="vertical" size={8} style={{ width: "100%" }}>
        {current ? (
          <Space size={8} wrap>
            <Tag icon={<InboxOutlined />} color="blue">
              {current}
            </Tag>
            <Typography.Text type="secondary">
              Filed {new Date(record.archive.filedAt).toLocaleDateString()} by{" "}
              {record.archive.filedBy}
            </Typography.Text>
            <Link to="/e-universe/erms/archive">View boxes</Link>
          </Space>
        ) : (
          <Typography.Text type="secondary">Not filed into a box yet.</Typography.Text>
        )}

        {canWrite && (
          <Space wrap>
            <Select
              style={{ width: 260 }}
              placeholder="Select an open box"
              value={current}
              onChange={(code) => mutation.mutate({ serialNo: record.serialNo, boxCode: code })}
              loading={mutation.isPending}
              options={openBoxes.map((b) => ({
                value: b.code,
                label: `${b.code} — ${b.label}`,
                disabled: b.status !== "open",
              }))}
              notFoundContent="No open boxes"
            />
            {current && (
              <Button
                size="small"
                onClick={() => mutation.mutate({ serialNo: record.serialNo, boxCode: null })}
                loading={mutation.isPending}
              >
                Remove from box
              </Button>
            )}
          </Space>
        )}
      </Space>
    </Card>
  );
};

export default BoxAssignment;
