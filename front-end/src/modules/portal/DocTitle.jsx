import { Space, Tag, Typography } from "antd";
import { eccRefOf, refLabelOf } from "./docLabel";
import { useTheme } from "../../theme/ThemeProvider";
import { categoryOf, categoryTag, inkOf } from "./docTypes";

const { Text } = Typography;

/**
 * A document as the Document Portal names it: its reference number (ECC or
 * permit number, a docket or a reference number) in the colour of its kind
 * (docTypes.js), then its title. `detail` adds the proponent and the serial.
 */
export default function DocTitle({ doc, detail = false, strong = true }) {
  const ref = eccRefOf(doc);
  const category = categoryOf(doc);
  const dark = useTheme().mode === "dark";
  return (
    <Space direction="vertical" size={0} style={{ minWidth: 0, maxWidth: "100%" }}>
      <Space size={6} wrap style={{ rowGap: 2 }}>
        <Tag color={category.color} style={{ marginInlineEnd: 0 }}>
          {categoryTag(category)}
        </Tag>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {refLabelOf(doc)}
        </Text>
        <Text strong={strong} style={{ color: ref ? inkOf(category, dark) : undefined }} className="portal-ref">
          {ref || "Not recorded"}
        </Text>
      </Space>
      <Text strong={strong} style={{ lineHeight: 1.35 }}>
        {doc?.projectTitle || "Untitled"}
      </Text>
      {detail && (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {[doc?.proponentName, doc?.province, doc?.serialNo].filter(Boolean).join(" · ")}
        </Text>
      )}
    </Space>
  );
}
