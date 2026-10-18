import { Link } from "react-router-dom";
import { Button, Card, Space, Tag, Typography } from "antd";
import { GlobalOutlined, LineChartOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { getProgress } from "../progress/progressService";

const { Text, Paragraph } = Typography;

// ---------------------------------------------------------------------------
// Admin Settings › System › Progress Tracker (Developer only): the way in to
// the Progress Tracker now that it is not in the menu — the season, whether
// its public link is on, and the button to the screen (where the season and
// the link are set).
// ---------------------------------------------------------------------------

export default function ProgressTrackerCard() {
  const { data } = useQuery({ queryKey: ["admin", "progress-tracker"], queryFn: () => getProgress(null), staleTime: 60 * 1000 });
  const season = data?.season;
  const share = season?.share;
  const on = share?.enabled && !(share.expiresAt && dayjs(share.expiresAt).isBefore(dayjs()));
  return (
    <Card
      title={
        <Space>
          <LineChartOutlined />
          Progress Tracker
        </Space>
      }
      style={{ maxWidth: 760 }}
    >
      <Paragraph type="secondary">
        The UCD updating&rsquo;s progress, read live from the Planning Unit&rsquo;s SharePoint RAW files. Set the season and its folders there, and the public link people without an account use to follow the figures.
      </Paragraph>
      <Space direction="vertical" size={8} style={{ marginBottom: 16 }}>
        <Text>
          Season: <b>{season ? `${season.name} (${dayjs(season.startsAt).format("MMM D")} – ${dayjs(season.endsAt).format("MMM D, YYYY")})` : "none yet"}</b>
        </Text>
        <Space>
          <Text>Public link:</Text>
          {on ? <Tag icon={<GlobalOutlined />} color="blue">On{share.expiresAt ? ` until ${dayjs(share.expiresAt).format("MMM D, YYYY")}` : ""}</Tag> : <Tag>Off</Tag>}
        </Space>
      </Space>
      <Link to="/e-universe/admin/progress-tracker">
        <Button type="primary" icon={<LineChartOutlined />}>
          Open the Progress Tracker
        </Button>
      </Link>
    </Card>
  );
}
