import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { Button, Card, Empty, Result, Space, Spin, Tooltip, Typography } from "antd";
import { BulbOutlined, LineChartOutlined, ReloadOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useTheme } from "../../../theme/ThemeProvider";
import embLogo from "../../../assets/emblogo.svg";
import { getPublicProgress, readSnapshot, writeSnapshot } from "./progressService";
import TrackerView from "./TrackerView";
import "./progress.css";

dayjs.extend(relativeTime);
const { Text, Title } = Typography;

// ---------------------------------------------------------------------------
// The Progress Tracker's public link (/e-universe/progress/:token): the UCD
// updating's figures for people without an E-Universe account, while the
// Developer keeps the link on (Admin Settings › Progress Tracker › Public
// link). Read-only: the same tiles, charts and tables as the Developer's
// screen, without a file, a link, a name, the activity or VERA — the server
// sends none of them. The figures are fetched again every minute.
// ---------------------------------------------------------------------------

export default function PublicProgress() {
  const { token } = useParams();
  const { mode, toggleMode } = useTheme();
  // The figures this browser last saw paint at once; the current ones follow.
  const snapKey = `public.${token}`;
  const { data, error, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["public-progress", token],
    queryFn: () => getPublicProgress(token),
    // Every 15 s while a province's workbook is being edited, every minute otherwise.
    refetchInterval: (query) => (query.state.data?.editing?.length ? 15 * 1000 : 60 * 1000),
    staleTime: 30 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: (prev) => prev,
    initialData: () => readSnapshot("public", snapKey)?.data,
    initialDataUpdatedAt: () => readSnapshot("public", snapKey)?.at,
    retry: (count, e) => e?.response?.status !== 404 && count < 2,
  });
  useEffect(() => {
    if (data) writeSnapshot("public", snapKey, data);
  }, [data, snapKey]);
  const season = data?.season;
  useEffect(() => {
    document.title = season ? `${season.name} · Progress` : "UCD Updating · Progress";
  }, [season]);

  const body = isLoading ? (
    <div className="pt-public-center">
      <Spin size="large" />
    </div>
  ) : error ? (
    <Result
      status={error?.response?.status === 404 ? "404" : "warning"}
      title={error?.response?.status === 404 ? "This link is not available" : "The figures could not be loaded"}
      subTitle={error?.response?.data?.message || "Please try again in a moment."}
      extra={error?.response?.status !== 404 && <Button onClick={() => refetch()}>Try again</Button>}
    />
  ) : !data?.matrix?.length ? (
    <Card>
      <Empty description="No figures yet." />
    </Card>
  ) : (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <TrackerView data={data} mode="public" theme={mode} token={token} />
    </Space>
  );

  return (
    <div className="pt-public">
      <header className="pt-public-head">
        <div className="pt-public-brand">
          <img src={embLogo} alt="EMB Region III" width={40} height={40} />
          <div>
            <Title level={4} style={{ margin: 0 }}>
              <LineChartOutlined /> {season?.name || "UCD Updating"} — Progress
            </Title>
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              DENR–EMB Region III · Planning Unit
              {season && ` · ${dayjs(season.startsAt).format("MMM D")} – ${dayjs(season.endsAt).format("MMM D, YYYY")}`}
              {season?.checkedAt && ` · updated ${dayjs(season.checkedAt).fromNow()}`}
            </Text>
          </div>
        </div>
        <Space size={6}>
          <Tooltip title="Fetch the figures again">
            <Button icon={<ReloadOutlined />} loading={isFetching} onClick={() => refetch()} aria-label="Refresh" />
          </Tooltip>
          <Tooltip title={mode === "dark" ? "Light mode" : "Dark mode"}>
            <Button icon={<BulbOutlined />} onClick={toggleMode} aria-label="Switch light or dark mode" />
          </Tooltip>
        </Space>
      </header>
      <main className="pt-public-main">{body}</main>
      <footer className="pt-public-foot">
        <Text type="secondary" style={{ fontSize: 12 }}>
          Figures only, read from the main sheet of each RAW file. Firms: baseline, added from ERMS, added from ECC Online.
          {season?.linkExpiresAt && ` This link works until ${dayjs(season.linkExpiresAt).format("MMM D, YYYY")}.`}
        </Text>
      </footer>
    </div>
  );
}
