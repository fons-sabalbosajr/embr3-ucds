import {
  Alert,
  Button,
  Card,
  Radio,
  Segmented,
  Space,
  Switch,
  Tooltip,
  Typography,
} from "antd";
import { BgColorsOutlined, MoonOutlined, SunOutlined } from "@ant-design/icons";
import { useTheme } from "../../theme/ThemeProvider";

const { Text, Paragraph, Title } = Typography;

// ---------------------------------------------------------------------------
// Appearance, for everyone.
//
// These are per-device display preferences: they identify nobody, grant
// nothing, and are stored in this browser rather than on the account. Two
// people sharing a workstation login therefore do not fight over each other's
// theme, and nothing here needs a server round trip.
//
// The colours are Ant Design accents rather than a free colour picker. The
// algorithm derives the whole palette — hovers, borders, disabled states,
// focus rings — from the accent, and a hand-picked hex can easily produce
// combinations nobody can read.
// ---------------------------------------------------------------------------

const GeneralSettings = () => {
  const {
    mode,
    setMode,
    appearance,
    setAppearance,
    resetAppearance,
    accents,
    densities,
  } = useTheme();

  return (
    <Space direction="vertical" size="large" style={{ width: "100%", maxWidth: 720 }}>
      <Card>
        <Title level={5} style={{ marginTop: 0 }}>
          Appearance
        </Title>
        <Paragraph type="secondary" style={{ marginBottom: 24 }}>
          These settings apply to this browser only, so a shared workstation
          keeps whatever each person set. They are remembered when you sign out.
        </Paragraph>

        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <div>
            <Text strong>Theme</Text>
            <div style={{ marginTop: 8 }}>
              <Segmented
                value={mode}
                onChange={setMode}
                options={[
                  { value: "light", label: "Light", icon: <SunOutlined /> },
                  { value: "dark", label: "Dark", icon: <MoonOutlined /> },
                ]}
              />
            </div>
          </div>

          <div>
            <Text strong>Accent colour</Text>
            <Paragraph type="secondary" style={{ fontSize: 12, margin: "4px 0 10px" }}>
              Used for buttons, links, the selected menu item and focus
              outlines. The rest of the palette is derived from it, so contrast
              stays readable in both themes.
            </Paragraph>
            <Radio.Group
              value={appearance.accent}
              onChange={(e) => setAppearance({ accent: e.target.value })}
            >
              <Space wrap size={[8, 8]}>
                {accents.map((a) => (
                  <Tooltip key={a.key} title={a.label}>
                    <Radio.Button value={a.key} style={{ paddingInline: 12 }}>
                      <Space size={6}>
                        <span
                          style={{
                            display: "inline-block",
                            width: 12,
                            height: 12,
                            borderRadius: 3,
                            background: a.color,
                            verticalAlign: "middle",
                          }}
                        />
                        {a.label}
                      </Space>
                    </Radio.Button>
                  </Tooltip>
                ))}
              </Space>
            </Radio.Group>
          </div>

          <div>
            <Text strong>Density</Text>
            <Paragraph type="secondary" style={{ fontSize: 12, margin: "4px 0 10px" }}>
              Controls text size and control height across tables, forms and
              menus.
            </Paragraph>
            <Segmented
              value={appearance.density}
              onChange={(value) => setAppearance({ density: value })}
              options={densities.map((d) => ({ value: d.key, label: d.label }))}
            />
          </div>

          <div>
            <Space align="start" size={12}>
              <Switch
                checked={appearance.tintedSider !== false}
                onChange={(checked) => setAppearance({ tintedSider: checked })}
              />
              <div>
                <Text strong>Tinted sidebar and header</Text>
                <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0 }}>
                  Gives the navigation the accent colour. Turn it off for a
                  plain neutral sidebar.
                </Paragraph>
              </div>
            </Space>
          </div>

          <div>
            <Button icon={<BgColorsOutlined />} onClick={resetAppearance}>
              Reset appearance
            </Button>
          </div>
        </Space>
      </Card>

      <Alert
        type="info"
        showIcon
        message="Looking for something else?"
        description="Settings that affect other people — user accounts, the register, storage — are under Admin Settings and need the appropriate role."
      />
    </Space>
  );
};

export default GeneralSettings;
