import { useState } from "react";
import { Alert, Button, Card, Input, List, Popconfirm, Space, Switch, Tag, Typography } from "antd";
import { CheckCircleFilled, ToolOutlined } from "@ant-design/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { message } from "../../../shared/feedback";
import { AVAILABILITY_KEY, UNIT_NAMES, setErmsAvailability, useErmsAvailability } from "../../../shared/ermsAvailability";
import { unitTheme } from "../../erms/units/unitTheme";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// Admin Settings › System › ERMS Units — the Developer's switch for each
// ERMS unit: Records, Legal Services, Laboratory.
//
// Off, a unit is out of E-Universe for everyone but the Developer: its
// sidebar section is greyed out, its screens show the maintenance notice
// with the reason given here, its documents are neither searched nor opened
// in the Document Portal, and nothing asks the server for its counts — which
// is what makes the rest of the application lighter while it is off. Nothing
// is deleted or changed; switching it back on is all it takes.
// ---------------------------------------------------------------------------

const UNITS = ["records", "legal", "laboratory"];

const UnitRow = ({ unit, state }) => {
  const queryClient = useQueryClient();
  const theme = unitTheme(unit);
  const [reason, setReason] = useState("");
  const save = useMutation({
    mutationFn: setErmsAvailability,
    onSuccess: (units, vars) => {
      queryClient.setQueryData(AVAILABILITY_KEY, units);
      message.success(vars.down ? `${UNIT_NAMES[unit]} is down for maintenance.` : `${UNIT_NAMES[unit]} is back.`);
      setReason("");
    },
    onError: (e) => message.error(e?.response?.data?.message || "The unit could not be switched."),
  });
  const down = Boolean(state?.down);

  return (
    <List.Item style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
      <List.Item.Meta
        avatar={<span style={{ color: theme.accent, fontSize: 22 }}>{theme.icon}</span>}
        title={
          <Space wrap size={6}>
            <Text strong>{UNIT_NAMES[unit]}</Text>
            {down ? (
              <Tag icon={<ToolOutlined />} color="warning">down for maintenance</Tag>
            ) : (
              <Tag icon={<CheckCircleFilled />} color="success">available</Tag>
            )}
          </Space>
        }
        description={
          down ? (
            <Space direction="vertical" size={2}>
              <Text type="secondary">{state.reason || "No reason given."}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Since {state.since ? new Date(state.since).toLocaleString() : "—"}
                {state.by ? ` · by ${state.by}` : ""}
              </Text>
            </Space>
          ) : (
            <Input
              size="small"
              maxLength={300}
              placeholder="Reason, shown to the unit's staff when it is down — e.g. Moving the Legal share to the new NAS"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{ maxWidth: 520 }}
            />
          )
        }
      />
      {down ? (
        <Button type="primary" loading={save.isPending} onClick={() => save.mutate({ unit, down: false })}>
          Bring it back
        </Button>
      ) : (
        <Popconfirm
          title={`Take the ${UNIT_NAMES[unit]} down?`}
          description="Its staff and the Document Portal lose it until you bring it back. You can still open it."
          okText="Take it down"
          okButtonProps={{ danger: true }}
          onConfirm={() => save.mutateAsync({ unit, down: true, reason: reason.trim() || undefined }).catch(() => {})}
        >
          <Space>
            <Text type="secondary" style={{ fontSize: 12 }}>Available</Text>
            <Switch checked loading={save.isPending} />
          </Space>
        </Popconfirm>
      )}
    </List.Item>
  );
};

const ErmsUnitsCard = () => {
  const { units, isLoading } = useErmsAvailability();
  return (
    <Card size="small" title="ERMS units" loading={isLoading}>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="Take a unit down for maintenance, or while it is not in use"
        description="A unit that is down is out of E-Universe for everyone but you: greyed out in the menu, a maintenance notice in place of its screens, kept out of the Document Portal, and no longer asked for its counts — which keeps the rest of the application light. Nothing is deleted; bring it back and it is as it was."
      />
      <List dataSource={UNITS} renderItem={(unit) => <UnitRow key={unit} unit={unit} state={units[unit]} />} />
    </Card>
  );
};

export default ErmsUnitsCard;
