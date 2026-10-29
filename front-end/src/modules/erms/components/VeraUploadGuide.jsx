import { useEffect, useMemo, useState } from "react";
import { Button, Form, Space, Tag, Tooltip, Typography } from "antd";
import { BulbOutlined, CheckCircleOutlined, DownOutlined, FileSearchOutlined, RightOutlined, WarningOutlined } from "@ant-design/icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { VeraFlame } from "../../vera/VeraMark";
import { PERMIT_OPTIONS, PROVINCE_LABEL, describeApiError, fetchUnitVeraTips, fetchVeraUploadTips, unitVeraReadScan, veraReadScan } from "../api/ermsService";
import { message } from "../../../shared/feedback";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// VERA's guide on the ERMS upload and edit forms (services/vera/uploadGuide
// on the server): the Records form, and the Legal and Laboratory forms, whose
// fields come from the document type chosen (pass `unit` and `docType`).
//
// As the form is filled, VERA checks it by rule — no AI, nothing spent — and
// says what does not fit: on a record, a permit number of another kind, year
// or region, the register placing it in another province; on a Legal form, a
// docket of another province or year, or with no case behind it, or under
// another company; on a Laboratory form, a COC number already filed; and on
// all, dates out of order, names filed in another spelling. Each with "Use"
// when she has the value, or "Show me" to open the field's tab.
//
// With a PDF chosen, "Read the scan" has her AI model read its first pages
// and propose the fields — each offered beside what the form holds, never
// written over it unasked.
// ---------------------------------------------------------------------------

const RECORD_DATES = new Set(["dateApproved", "dateAmended"]);
const RECORD_FIELDS = ["proponentName", "projectTitle", "permitType", "permitNumber", "dateApproved", "dateAmended", "projectType", "specificProjectType", "province", "city", "fileName"];
const PERMIT_LABEL = Object.fromEntries(PERMIT_OPTIONS.map((o) => [o.value, o.label]));
const asText = (v) => (dayjs.isDayjs(v) ? v.format("YYYY-MM-DD") : Array.isArray(v) ? v.join(", ") : v == null ? "" : typeof v === "string" ? v.trim() : v);
const isPdf = (file) => Boolean(file) && (file.type === "application/pdf" || /\.pdf$/i.test(file.name || ""));

/**
 * @param form     the form's instance
 * @param scan     the file chosen to upload, if any
 * @param isEdit   editing a document already filed
 * @param onGoto   (field) => open the tab holding it
 * @param unit     "legal" | "laboratory" for a unit's form; absent for Records
 * @param docType  the unit's document type chosen ({ code, fields })
 * @param serialNo the document being edited (so it is not its own duplicate)
 */
const VeraUploadGuide = ({ form, scan, isEdit, onGoto, unit, docType, serialNo }) => {
  const [open, setOpen] = useState(true);
  // The whole form, as it stands.
  const all = Form.useWatch((values) => values, form) || {};
  const dateFields = useMemo(() => (unit ? new Set((docType?.fields || []).filter((f) => f.type === "date").map((f) => f.key)) : RECORD_DATES), [unit, docType]);

  const payload = unit
    ? {
        docType: docType?.code || "",
        province: all.province || null,
        serialNo: serialNo || null,
        isNew: !isEdit,
        fileName: scan?.name || null,
        fields: Object.fromEntries((docType?.fields || []).filter((f) => f.type !== "checkbox").map((f) => [f.key, asText(all[f.key]) === "" ? null : asText(all[f.key])])),
      }
    : {
        isNew: !isEdit,
        ...Object.fromEntries(RECORD_FIELDS.map((k) => [k, asText(all[k]) === "" ? null : String(asText(all[k]))])),
        fileName: scan?.name || asText(all.fileName) || null,
      };
  // Asked once typing pauses, not on every key.
  const key = JSON.stringify(payload);
  const [asked, setAsked] = useState(key);
  useEffect(() => {
    const t = setTimeout(() => setAsked(key), 700);
    return () => clearTimeout(t);
  }, [key]);
  const { data: tips = [] } = useQuery({
    queryKey: ["erms", "vera-guide", unit || "records", asked],
    queryFn: () => (unit ? fetchUnitVeraTips(unit, JSON.parse(asked)) : fetchVeraUploadTips(JSON.parse(asked))),
    enabled: !unit || Boolean(docType),
    staleTime: 60 * 1000,
    placeholderData: (previous) => previous,
    retry: false,
  });

  const shown = (field, value) =>
    field === "permitType" ? PERMIT_LABEL[value] || value : field === "province" ? PROVINCE_LABEL[value] || value : dateFields.has(field) ? dayjs(value).format("MMM D, YYYY") : String(value);
  const use = (field, value) => {
    form.setFieldValue(field, dateFields.has(field) ? dayjs(value) : value);
    form.validateFields([field]).catch(() => {});
  };

  // The scan, read by VERA's model — on request, and forgotten when another
  // file or document type is chosen.
  const read = useMutation({
    mutationFn: () => (unit ? unitVeraReadScan(unit, docType.code, scan) : veraReadScan(scan)),
    onError: (e) => message.error(describeApiError(e, "VERA could not read the scan.")),
  });
  useEffect(() => {
    read.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan, docType?.code]);
  const readings = (read.data?.suggestions || []).map((s) => ({ ...s, now: String(asText(all[s.field]) ?? "") }));
  const differ = readings.filter((s) => s.now.toLowerCase() !== String(s.value).toLowerCase());
  const empty = differ.filter((s) => !s.now);
  const fillEmpty = () => {
    empty.forEach((s) => use(s.field, s.value));
    message.success(`VERA filled ${empty.length} empty field(s) from the scan. Check them against the document.`);
  };

  if (unit && !docType) return null;
  const warnings = tips.filter((t) => t.level === "warn").length;
  const count = tips.length + differ.length;

  return (
    <div style={{ border: "1px solid rgba(114, 46, 209, 0.25)", background: "rgba(114, 46, 209, 0.04)", borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>
      <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
        <Space size={8} style={{ cursor: "pointer" }} onClick={() => setOpen((o) => !o)}>
          {open ? <DownOutlined style={{ fontSize: 10 }} /> : <RightOutlined style={{ fontSize: 10 }} />}
          <VeraFlame size={18} label="VERA" />
          <Text strong>VERA&rsquo;s suggestions</Text>
          {count ? <Tag color={warnings ? "orange" : "purple"}>{count}</Tag> : <Tag icon={<CheckCircleOutlined />} color="green">Looks right so far</Tag>}
        </Space>
        {isPdf(scan) && (
          <Tooltip title="VERA's AI model reads the first pages of the scan and suggests the fields. You choose which to use.">
            <Button size="small" icon={<FileSearchOutlined />} loading={read.isPending} onClick={() => read.mutate()}>
              {read.data ? "Read it again" : "Read the scan"}
            </Button>
          </Tooltip>
        )}
      </Space>

      {open && (tips.length > 0 || read.data) && (
        <Space direction="vertical" size={6} style={{ width: "100%", marginTop: 8 }}>
          {tips.map((t) => (
            <Space key={t.id} align="start" size={8} style={{ width: "100%", justifyContent: "space-between" }}>
              <Space align="start" size={6}>
                {t.level === "warn" ? <WarningOutlined style={{ color: "#d46b08", marginTop: 4 }} /> : <BulbOutlined style={{ color: "#722ed1", marginTop: 4 }} />}
                <Text style={{ fontSize: 13 }}>{t.message}</Text>
              </Space>
              {t.fix ? (
                <Button size="small" type="link" onClick={() => use(t.fix.field, t.fix.value)}>
                  {t.fix.label}
                </Button>
              ) : (
                onGoto && (
                  <Button size="small" type="link" onClick={() => onGoto(t.field)}>
                    Show me
                  </Button>
                )
              )}
            </Space>
          ))}

          {read.data && (
            <div style={{ marginTop: tips.length ? 4 : 0 }}>
              <Space size={6} wrap style={{ marginBottom: 4 }}>
                <FileSearchOutlined style={{ color: "#722ed1" }} />
                <Text strong style={{ fontSize: 13 }}>From the scan</Text>
                {read.data.confidence && <Tag color={read.data.confidence === "high" ? "green" : read.data.confidence === "medium" ? "gold" : "default"}>{read.data.confidence} confidence</Tag>}
                <Text type="secondary" style={{ fontSize: 12 }}>{read.data.cached ? "read before — no AI request" : read.data.model}</Text>
                {empty.length > 0 && (
                  <Button size="small" type="primary" ghost onClick={fillEmpty}>
                    Fill the {empty.length} empty field{empty.length === 1 ? "" : "s"}
                  </Button>
                )}
              </Space>
              {differ.length === 0 ? (
                <Text type="secondary" style={{ fontSize: 12, display: "block" }}>
                  <CheckCircleOutlined style={{ color: "#389e0d" }} /> The form agrees with what VERA read.
                </Text>
              ) : (
                differ.map((s) => (
                  <Space key={s.field} size={8} style={{ width: "100%", justifyContent: "space-between" }}>
                    <Text style={{ fontSize: 13 }}>
                      <Text type="secondary">{s.label}:</Text> <Text strong>{shown(s.field, s.value)}</Text>
                      {s.now && <Text type="secondary"> (the form has {shown(s.field, s.now)})</Text>}
                    </Text>
                    <Button size="small" type="link" onClick={() => use(s.field, s.value)}>
                      Use
                    </Button>
                  </Space>
                ))
              )}
            </div>
          )}
        </Space>
      )}
    </div>
  );
};

export default VeraUploadGuide;
