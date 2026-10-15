import { Button, Collapse, Space, Typography } from "antd";
import { FileSearchOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { message } from "../../../shared/feedback";
import { fetchCurrentUser } from "../../../api/universeService";
import { readScanText } from "../../vera/veraService";

const { Text, Paragraph } = Typography;

// ---------------------------------------------------------------------------
// The text VERA read from a scan, which the Document Library's search looks
// in too — and, for the Developer or an administrator, the button to have it
// read (one AI call; see server services/vera/scanText).
// ---------------------------------------------------------------------------

const ScanTextPanel = ({ unit = "records", serialNo, text, readAt, hasScan }) => {
  const queryClient = useQueryClient();
  const { data: me } = useQuery({ queryKey: ["auth", "me"], queryFn: fetchCurrentUser, staleTime: 5 * 60 * 1000, retry: false });
  const canRead = ["developer", "admin"].includes(me?.role);
  const read = useMutation({
    mutationFn: () => readScanText(unit, serialNo),
    onSuccess: (r) => {
      message.success(`VERA read ${r.text.length.toLocaleString()} characters from the scan.`);
      queryClient.invalidateQueries({ queryKey: ["erms"] });
    },
    onError: (e) => message.error(e?.response?.data?.message || "The scan could not be read."),
  });
  if (!text && !(canRead && hasScan)) return null;
  return (
    <Collapse
      size="small"
      items={[
        {
          key: "text",
          label: (
            <Space size={6}>
              <FileSearchOutlined />
              <span>Text read from the scan</span>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {text ? `searchable${readAt ? ` · read ${new Date(readAt).toLocaleDateString()}` : ""}` : "not read yet"}
              </Text>
            </Space>
          ),
          extra: canRead && hasScan && (
            <Button size="small" loading={read.isPending} onClick={(e) => { e.stopPropagation(); read.mutate(); }}>
              {text ? "Read again" : "Read with VERA"}
            </Button>
          ),
          children: text ? (
            <Paragraph style={{ whiteSpace: "pre-wrap", fontSize: 12, marginBottom: 0 }} copyable>
              {text}
            </Paragraph>
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>
              VERA reads the first pages and keeps the first 1,500 characters, so the Document Library&rsquo;s search finds this document by what the scan says.
            </Text>
          ),
        },
      ]}
    />
  );
};

export default ScanTextPanel;
