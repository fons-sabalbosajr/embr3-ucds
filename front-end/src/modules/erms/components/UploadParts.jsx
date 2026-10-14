import { ConfigProvider, Progress, Tabs, Typography } from "antd";
import { unitTheme } from "../units/unitTheme";

// ---------------------------------------------------------------------------
// Pieces the upload dialogs share (Records, Legal Services, Laboratory).
// ---------------------------------------------------------------------------

/**
 * The dialog's tabs with their labels in the unit's colour — Records blue,
 * Legal red-orange, Laboratory teal — the selected one in full, the rest a
 * shade softer, so which unit's form this is shows in the tabs as well.
 */
export const UnitTabs = ({ unit, ...props }) => {
  const { accent } = unitTheme(unit);
  return (
    <ConfigProvider
      theme={{
        components: {
          Tabs: {
            itemColor: `${accent}b3`,
            itemHoverColor: accent,
            itemSelectedColor: accent,
            itemActiveColor: accent,
            inkBarColor: accent,
            titleFontSize: 14,
          },
        },
      }}
    >
      <Tabs {...props} />
    </ConfigProvider>
  );
};

/**
 * How far an upload has gone, in the dialog's footer: the bar and the
 * percentage while the file travels, then "Filing on the share" while the
 * server writes it. Nothing when no upload is under way (`percent` null).
 */
export const UploadProgress = ({ percent }) => {
  if (percent == null) return null;
  const sent = percent >= 100;
  return (
    <div style={{ flex: "1 1 220px", minWidth: 180, textAlign: "left" }} aria-live="polite">
      <Progress percent={percent} size="small" status={sent ? "normal" : "active"} format={(p) => (p >= 100 ? "100%" : `${p}%`)} style={{ marginBottom: 0 }} />
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {sent ? "Uploaded — filing it on the share…" : `Uploading the scan… ${percent}%`}
      </Typography.Text>
    </div>
  );
};

/** The footer with the progress at its left and the buttons at its right. */
export const UploadFooter = ({ percent, children }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "flex-end" }}>
    <UploadProgress percent={percent} />
    {children}
  </div>
);
