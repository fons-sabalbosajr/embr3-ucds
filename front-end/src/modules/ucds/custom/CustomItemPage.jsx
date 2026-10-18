import { Alert, Card, Empty, List, Skeleton, Space, Tag, Typography } from "antd";
import { FolderOutlined, TableOutlined } from "@ant-design/icons";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { API_BASE_URL } from "../../../config/api";
import { useYear } from "../../../context/YearContext";
import CustomTable from "./CustomTable";

const { Title, Text } = Typography;

// ---------------------------------------------------------------------------
// A user-added item in the year's menu.
//
// A folder shows what it holds. A table is the Planning Unit's own: its
// columns designed, its rows filled, worked out, filtered and exported here
// (CustomTable.jsx).
// ---------------------------------------------------------------------------

const fetchItem = async (id) => (await axios.get(`${API_BASE_URL}/api/ucds/menu-items/${id}`, { withCredentials: true })).data;

const CustomItemPage = () => {
  const { id } = useParams();
  const { activeYear } = useYear();
  const { data, isLoading, error } = useQuery({ queryKey: ["ucds", "menu-item", id, activeYear], queryFn: () => fetchItem(id) });

  if (isLoading) return <Skeleton active />;
  if (error) {
    return (
      <Alert
        type="warning"
        showIcon
        message="This item is not in the active year container."
        description="Items belong to the year they were added under. Open that year from the sidebar to see it."
      />
    );
  }

  const { item, children } = data;
  const isTable = item.kind === "table";

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Card size="small">
        <Space direction="vertical" size={0}>
          <Title level={4} style={{ margin: 0 }}>
            {isTable ? <TableOutlined /> : <FolderOutlined />} {item.label}
          </Title>
          <Text type="secondary">
            {data.year} · {isTable ? "custom table" : "folder"} · added by {item.createdBy} on {new Date(item.createdAt).toLocaleDateString()}
            {item.parent === "monitoring" ? " · under Monitoring Plan" : ""}
          </Text>
        </Space>
      </Card>

      {isTable ? (
        // The table itself: its columns, rows, formulas, filters and exports.
        <CustomTable id={item.id} label={item.label} />
      ) : (
        <Card size="small" title="Contents">
          {children.length ? (
            <List
              size="small"
              dataSource={children}
              renderItem={(c) => (
                <List.Item>
                  {c.kind === "table" ? (
                    <Link to={`/e-universe/custom/${c.id}`}><TableOutlined /> {c.label}</Link>
                  ) : (
                    <span><FolderOutlined /> {c.label}</span>
                  )}
                  <Tag>{c.kind}</Tag>
                </List.Item>
              )}
            />
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing inside yet. Use + on the folder in the sidebar to add an item." />
          )}
        </Card>
      )}
    </Space>
  );
};

export default CustomItemPage;
