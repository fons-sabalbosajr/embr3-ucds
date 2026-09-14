import { useEffect, useState } from "react";
import { Alert, Space, Spin, Tag, Typography } from "antd";
import { CheckCircleFilled, InfoCircleOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { PROVINCE_LABEL, resolvePermit } from "../api/ermsService";

// ---------------------------------------------------------------------------
// Live feedback on whether a permit number resolves to an establishment.
//
// Advisory only. The link is computed again on the server when the record is
// saved, using the same matcher — this just tells the clerk what will happen
// before they commit to it.
//
// Not finding a match is normal, not an error: the register does not cover
// every record ERMS holds, and saying so plainly avoids people "fixing" a
// permit number that was correct all along.
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 400;

const RegisterLookup = ({ permitNumber }) => {
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const value = String(permitNumber || "").trim();
    const t = setTimeout(() => setDebounced(value), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [permitNumber]);

  const enabled = debounced.length >= 3;

  const { data: match, isFetching } = useQuery({
    queryKey: ["erms", "resolve-permit", debounced],
    queryFn: () => resolvePermit(debounced),
    enabled,
    retry: false,
    staleTime: 60 * 1000,
  });

  if (!enabled) return null;

  if (isFetching) {
    return (
      <Space size={6} style={{ marginTop: 4 }}>
        <Spin size="small" />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Checking the register…
        </Typography.Text>
      </Space>
    );
  }

  if (!match) {
    return (
      <Alert
        type="info"
        icon={<InfoCircleOutlined />}
        showIcon
        style={{ marginTop: 6 }}
        message="No establishment carries this permit number"
        description="The record will be saved without a register link. That is common — the register does not cover every record."
      />
    );
  }

  return (
    <Alert
      type="success"
      icon={<CheckCircleFilled />}
      showIcon
      style={{ marginTop: 6 }}
      message={
        <Space size={8} wrap>
          <span>Will link to</span>
          <Tag color="green">{match.sortKey}</Tag>
          <Typography.Text strong>{match.name}</Typography.Text>
          {match.province && (
            <Typography.Text type="secondary">
              {PROVINCE_LABEL[match.province] || match.province}
            </Typography.Text>
          )}
        </Space>
      }
    />
  );
};

export default RegisterLookup;
