import { Card, Empty, List, Skeleton, Space, Tag, Typography } from "antd";
import { FileTextOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { API_BASE } from "../../../config/api";

// ---------------------------------------------------------------------------
// Records filed against this establishment.
//
// Renders nothing at all when the records module is unavailable to the viewer:
// the API answers { available: false } rather than an error, so a planning
// screen never breaks because ERMS is off or the account lacks that domain.
//
// Read-only. Nothing here writes to the records module.
// ---------------------------------------------------------------------------

const PERMIT_COLOR = {
  "ecc-original": "green",
  "ecc-amended": "gold",
  cnc: "blue",
  "hw-generator": "volcano",
};

const fetchRecords = async (sortKey) => {
  const { data } = await axios.get(
    `${API_BASE}/ucds/establishments/${encodeURIComponent(sortKey)}/records`,
    { withCredentials: true }
  );
  return data;
};

const EstablishmentRecordsPanel = ({ sortKey, limit = 8 }) => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["ucds", "establishment-records", sortKey],
    queryFn: () => fetchRecords(sortKey),
    enabled: Boolean(sortKey),
    retry: false,
  });

  // Silent by design — an unavailable records module is not a planning error.
  if (isError || (data && !data.available)) return null;
  if (!sortKey) return null;

  if (isLoading) {
    return (
      <Card size="small" title="Records">
        <Skeleton active paragraph={{ rows: 3 }} />
      </Card>
    );
  }

  return (
    <Card
      size="small"
      title={
        <Space size={8}>
          <FileTextOutlined />
          <span>Records</span>
          <Typography.Text type="secondary">
            {new Intl.NumberFormat().format(data.total)}
          </Typography.Text>
        </Space>
      }
      extra={
        data.total > 0 && (
          <Link to={`/universe/erms/records?linkedTo=${encodeURIComponent(sortKey)}`}>
            Open in Records
          </Link>
        )
      }
    >
      {data.total === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No records filed against this establishment"
        />
      ) : (
        <List
          size="small"
          dataSource={data.records.slice(0, limit)}
          renderItem={(r) => (
            <List.Item>
              <Space size={8} wrap style={{ width: "100%" }}>
                <Link to={`/universe/erms/records/${encodeURIComponent(r.serialNo)}`}>
                  {r.serialNo}
                </Link>
                <Tag color={PERMIT_COLOR[r.permit?.type]} style={{ marginInlineEnd: 0 }}>
                  {r.permit?.label || r.permit?.type}
                </Tag>
                <Typography.Text ellipsis style={{ maxWidth: 260 }}>
                  {r.projectTitle}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {r.document?.uploadedAt
                    ? new Date(r.document.uploadedAt).toLocaleDateString()
                    : ""}
                </Typography.Text>
              </Space>
            </List.Item>
          )}
        />
      )}
      {data.total > limit && (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Showing {limit} of {new Intl.NumberFormat().format(data.total)}.
        </Typography.Text>
      )}
    </Card>
  );
};

export default EstablishmentRecordsPanel;
