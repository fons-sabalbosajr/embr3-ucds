import {
  Alert,
  Button,
  Card,
  ColorPicker,
  Radio,
  Segmented,
  Space,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { BgColorsOutlined, CheckOutlined, MoonOutlined, SunOutlined } from "@ant-design/icons";
import { useTheme } from "../../theme/ThemeProvider";

const { Text, Paragraph, Title } = Typography;

// ---------------------------------------------------------------------------
// Appearance, for everyone.
//
// Per-person display preferences: they identify nobody and grant nothing.
// They follow the account (PUT /api/profile/theme) and are mirrored in this
// browser for the sign-in pages, where there is no account to ask yet.
//
// The accent presets are chosen to stay legible under both algorithms; a
// custom colour is offered as well, with the note that a very light or very
// saturated pick can make buttons and links hard to read. Everything else
// — the navigation surfaces, corners, the content background — is derived
// from the accent so the whole screen keeps one look.
// ---------------------------------------------------------------------------

const Swatch = ({ color, active, onClick, title, size = 28 }) => (
  <Tooltip title={title}>
    <button
      type="button"
      aria-label={title}
      onClick={onClick}
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        border: active ? "2px solid var(--eu-accent)" : "2px solid transparent",
        outline: active ? "2px solid #fff" : "1px solid rgba(0,0,0,0.15)",
        outlineOffset: active ? -4 : 0,
        background: color,
        cursor: "pointer",
        padding: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
      }}
    >
      {active && <CheckOutlined style={{ fontSize: 13, filter: "drop-shadow(0 0 1px rgba(0,0,0,.6))" }} />}
    </button>
  </Tooltip>
);

/** A little sidebar + header + content sketch showing a navigation style. */
const NavPreview = ({ sider, header, accent, active }) => (
  <div
    style={{
      width: 96,
      height: 64,
      borderRadius: 8,
      overflow: "hidden",
      display: "grid",
      gridTemplateColumns: "28px 1fr",
      gridTemplateRows: "16px 1fr",
      border: active ? "2px solid var(--eu-accent)" : "1px solid rgba(0,0,0,0.15)",
      background: "#eef0f3",
    }}
  >
    <div style={{ gridRow: "1 / 3", background: sider }}>
      <div style={{ margin: "22px 5px 0", height: 6, borderRadius: 2, background: accent }} />
      <div style={{ margin: "4px 5px 0", height: 6, borderRadius: 2, background: "rgba(255,255,255,0.25)" }} />
    </div>
    <div style={{ background: header }} />
    <div />
  </div>
);

const Section = ({ title, hint, children }) => (
  <div>
    <Text strong>{title}</Text>
    {hint && (
      <Paragraph type="secondary" style={{ fontSize: 12, margin: "4px 0 10px" }}>
        {hint}
      </Paragraph>
    )}
    {!hint && <div style={{ height: 8 }} />}
    {children}
  </div>
);

const GeneralSettings = () => {
  const {
    mode,
    setMode,
    appearance,
    setAppearance,
    resetAppearance,
    accents,
    accentColor,
    densities,
    navStyles,
    navStyle,
    radii,
    surfaces,
  } = useTheme();

  const customActive = Boolean(appearance.accentHex);

  return (
    <Space direction="vertical" size="large" style={{ width: "100%", maxWidth: 760 }}>
      <Card>
        <Title level={5} style={{ marginTop: 0 }}>
          Appearance
        </Title>
        <Paragraph type="secondary" style={{ marginBottom: 24 }}>
          Your own look. It is kept on your account, so it follows you to any computer you sign in on.
        </Paragraph>

        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <Section title="Theme">
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: "light", label: "Light", icon: <SunOutlined /> },
                { value: "dark", label: "Dark", icon: <MoonOutlined /> },
              ]}
            />
          </Section>

          <Section
            title="Accent colour"
            hint="Used for buttons, links, the selected menu item and focus outlines. The rest of the palette is derived from it, so contrast stays readable in both themes."
          >
            <Space wrap size={[8, 8]} align="center">
              {accents.map((a) => (
                <Swatch
                  key={a.key}
                  color={a.color}
                  title={a.label}
                  active={!customActive && appearance.accent === a.key}
                  onClick={() => setAppearance({ accent: a.key, accentHex: null })}
                />
              ))}
              <span style={{ width: 1, height: 24, background: "rgba(0,0,0,0.15)", margin: "0 4px" }} />
              <ColorPicker
                value={appearance.accentHex || accentColor}
                onChangeComplete={(c) => setAppearance({ accentHex: c.toHexString().slice(0, 7).toLowerCase() })}
                disabledAlpha
                showText={() => <span style={{ fontSize: 12 }}>{customActive ? "Custom" : "Pick your own"}</span>}
                presets={[{ label: "Presets", colors: accents.map((a) => a.color) }]}
              />
              {customActive && (
                <Tag closable onClose={() => setAppearance({ accentHex: null })} style={{ marginInlineStart: 0 }}>
                  {appearance.accentHex}
                </Tag>
              )}
            </Space>
            {customActive && (
              <Paragraph type="secondary" style={{ fontSize: 12, margin: "8px 0 0" }}>
                A very light or very saturated colour can make buttons and links hard to read. If it does, pick a preset.
              </Paragraph>
            )}
          </Section>

          <Section title="Navigation" hint="How the sidebar and header take the accent. They stay dark in both themes; the content area follows the theme.">
            <Radio.Group value={navStyle} onChange={(e) => setAppearance({ navStyle: e.target.value, tintedSider: e.target.value !== "neutral" })}>
              <Space wrap size={[12, 12]} align="start">
                {navStyles.map((s) => {
                  // Sketch the surfaces the same way ThemeProvider derives them.
                  const preview = previewSurfaces(accentColor, s.key);
                  return (
                    <Radio.Button key={s.key} value={s.key} style={{ height: "auto", padding: 8, lineHeight: 1.2 }}>
                      <Space direction="vertical" size={4} align="center">
                        <NavPreview sider={preview.sider} header={preview.header} accent={accentColor} active={navStyle === s.key} />
                        <Text style={{ fontSize: 12 }}>{s.label}</Text>
                      </Space>
                    </Radio.Button>
                  );
                })}
              </Space>
            </Radio.Group>
            <Paragraph type="secondary" style={{ fontSize: 12, margin: "8px 0 0" }}>
              {navStyles.find((s) => s.key === navStyle)?.description}
            </Paragraph>
          </Section>

          <Section title="Content background" hint="The surface behind cards and tables.">
            <Segmented
              value={appearance.surface || "plain"}
              onChange={(value) => setAppearance({ surface: value })}
              options={surfaces.map((s) => ({ value: s.key, label: s.label }))}
            />
            <Paragraph type="secondary" style={{ fontSize: 12, margin: "8px 0 0" }}>
              {surfaces.find((s) => s.key === (appearance.surface || "plain"))?.description}
            </Paragraph>
          </Section>

          <Section title="Corners" hint="How rounded buttons, inputs, cards and tables are.">
            <Segmented
              value={appearance.radius || "rounded"}
              onChange={(value) => setAppearance({ radius: value })}
              options={radii.map((r) => ({ value: r.key, label: r.label }))}
            />
          </Section>

          <Section title="Density" hint="Controls text size and control height across tables, forms and menus.">
            <Segmented
              value={appearance.density}
              onChange={(value) => setAppearance({ density: value })}
              options={densities.map((d) => ({ value: d.key, label: d.label }))}
            />
          </Section>

          <div>
            <Button icon={<BgColorsOutlined />} onClick={resetAppearance}>
              Reset appearance
            </Button>
          </div>
        </Space>
      </Card>

      {/* <Alert
        type="info"
        showIcon
        // message="Looking for something else?"
        // description="Settings that affect other people — user accounts, the register, storage, ERMS — are under Admin Settings and need the appropriate role."
      /> */}
    </Space>
  );
};

/** Mirrors ThemeProvider.navigationSurfaces for the previews. */
function previewSurfaces(accent, style) {
  const mix = (a, b, amount) => {
    const parse = (hex) => [0, 2, 4].map((i) => parseInt(hex.replace("#", "").slice(i, i + 2), 16));
    const [r1, g1, b1] = parse(a);
    const [r2, g2, b2] = parse(b);
    const to = (x, y) => Math.round(x + (y - x) * amount);
    return `#${[to(r1, r2), to(g1, g2), to(b1, b2)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  };
  switch (style) {
    case "neutral":
      return { sider: "#161a20", header: "#1f242c" };
    case "deep":
      return { sider: mix(accent, "#07090d", 0.9), header: mix(accent, "#07090d", 0.72) };
    case "vivid":
      return { sider: mix(accent, "#000000", 0.42), header: mix(accent, "#000000", 0.22) };
    case "graphite":
      return { sider: "#24262b", header: mix(accent, "#2c2f35", 0.7) };
    default:
      return { sider: mix(accent, "#0d1522", 0.82), header: mix(accent, "#0d1522", 0.52) };
  }
}

export default GeneralSettings;
