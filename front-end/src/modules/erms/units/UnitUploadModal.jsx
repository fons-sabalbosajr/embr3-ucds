import { useEffect, useMemo, useState } from "react";
import { Alert, AutoComplete, Checkbox, DatePicker, Divider, Form, Input, InputNumber, Modal, Select, Space, Tag, Typography, Upload } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { message } from "../../../shared/feedback";
import { checkUnitDuplicates, describeApiError, fetchLookups, uploadUnitDocument, updateUnitDocument } from "../api/ermsService";
import FolderPicker from "../components/FolderPicker";
import { PROVINCE_OPTIONS, groupFields, unitTheme } from "./unitTheme";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// Filing a Legal or Laboratory document — the desktop system's upload.
//
// Choose the document type, fill the form that type defines (from ERMS
// Config), choose the scan, file. The form is rendered from the field
// definitions, so each unit's documents get their own form without each
// needing its own screen; the unit's theme decides how the fields are
// grouped so a case file and a sample sheet read differently.
//
// With `document` set it edits that document's metadata instead; the file
// stays where it was filed.
// ---------------------------------------------------------------------------

const contains = (input, option) => String(option?.value || "").toLowerCase().includes(String(input || "").toLowerCase());

const FieldInput = ({ field, lookups }) => {
  switch (field.type) {
    case "textarea":
      return <Input.TextArea rows={2} placeholder={field.placeholder} />;
    case "date":
      return <DatePicker style={{ width: "100%" }} />;
    case "number":
      return <InputNumber style={{ width: "100%" }} placeholder={field.placeholder} />;
    case "checkbox":
      return <Checkbox />;
    case "select":
      return <Select allowClear options={(field.options || []).map((o) => ({ value: o, label: o }))} placeholder={field.placeholder} />;
    case "lookup": {
      const list = lookups?.[field.lookup] || [];
      return <AutoComplete allowClear options={list.map((it) => ({ value: it.label }))} filterOption={contains} placeholder={field.placeholder || "Choose or type"} />;
    }
    default:
      return <Input placeholder={field.placeholder} />;
  }
};

const UnitUploadModal = ({ unit, unitConfig, open, document, onClose }) => {
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [docTypeCode, setDocTypeCode] = useState(null);
  const [scan, setScan] = useState(null);
  // The company/station folder on the share the person chose (see
  // FolderPicker); null files under the form's own value as before.
  const [folder, setFolder] = useState(null);
  const [subfolder, setSubfolder] = useState(null);
  const theme = unitTheme(unit);
  const isEdit = Boolean(document);
  // The fields the filing layout reads: which one names the folder, which
  // date gives the year. Watched so the picker lists the right level.
  const province = Form.useWatch("province", form);
  const folderHint = Form.useWatch(unitConfig?.folder?.folderField || "__none", form);
  const yearValue = Form.useWatch(unitConfig?.folder?.yearField || "__none", form);

  const docTypes = useMemo(() => unitConfig?.docTypes || [], [unitConfig]);
  const docType = docTypes.find((t) => t.code === (isEdit ? document.docType : docTypeCode)) || null;

  useEffect(() => {
    if (!open) return;
    setScan(null);
    setFolder(null);
    setSubfolder(null);
    if (document) {
      setDocTypeCode(document.docType);
      const values = { province: document.province };
      for (const f of docTypes.find((t) => t.code === document.docType)?.fields || []) {
        const v = document.fields?.[f.key];
        values[f.key] = f.type === "date" && v ? dayjs(v) : v ?? undefined;
      }
      form.setFieldsValue(values);
    } else {
      setDocTypeCode(docTypes[0]?.code || null);
      form.resetFields();
    }
  }, [open, document, docTypes, form]);

  // The lookup lists the form's fields name: legal officers, statuses,
  // parameter groups. Fetched once; the address lists are not needed here.
  const { data: lookupData } = useQuery({
    queryKey: ["erms", "lookups", "form"],
    queryFn: () => fetchLookups({}),
    enabled: open,
    staleTime: 10 * 60 * 1000,
  });
  const lookups = useMemo(() => {
    if (!lookupData) return {};
    return {
      "legal-statuses": lookupData.legalStatuses,
      "legal-officers": lookupData.legalOfficers,
      "case-handlers": lookupData.caseHandlers,
      "nature-of-business": lookupData.natureOfBusiness,
      "lab-parameters": lookupData.labParameters,
      "project-types": lookupData.projectTypes,
      "document-statuses": lookupData.documentStatuses,
    };
  }, [lookupData]);

  const sections = useMemo(() => groupFields(unit, docType?.fields || []), [unit, docType]);

  // A file name already on file in this unit, per the unit's duplicate rule
  // (Settings › Duplicates). Warned, not refused.
  const { data: dupes } = useQuery({
    queryKey: ["erms", "unit", unit, "duplicates", scan?.name || null],
    queryFn: () => checkUnitDuplicates(unit, scan.name),
    enabled: open && !isEdit && Boolean(scan?.name),
    staleTime: 30 * 1000,
  });

  const settle = (verb) => (saved) => {
    message.success(`${verb} ${saved.serialNo}.`);
    queryClient.invalidateQueries({ queryKey: ["erms", "unit", unit] });
    form.resetFields();
    onClose(saved);
  };
  const create = useMutation({
    mutationFn: uploadUnitDocument,
    onSuccess: settle("Filed"),
    onError: (e) => message.error(describeApiError(e, "The document could not be filed.")),
  });
  const update = useMutation({
    mutationFn: updateUnitDocument,
    onSuccess: settle("Updated"),
    onError: (e) => message.error(describeApiError(e, "The document could not be saved.")),
  });

  const submit = async () => {
    if (!docType) return;
    const v = await form.validateFields();
    const fields = {};
    for (const f of docType.fields || []) {
      const raw = v[f.key];
      fields[f.key] = f.type === "date" && raw ? raw.format("YYYY-MM-DD") : raw ?? null;
    }
    if (isEdit) {
      update.mutate({ unit, serialNo: document.serialNo, province: v.province, fields });
    } else {
      if (!scan) {
        message.error("Choose the scan to file.");
        return;
      }
      create.mutate({ unit, docType: docType.code, province: v.province, folder, subfolder, fields, file: scan });
    }
  };

  return (
    <Modal
      open={open}
      title={
        <Space>
          <span style={{ color: theme.accent }}>{theme.icon}</span>
          {isEdit ? `Edit ${document.serialNo}` : `File a document — ${theme.label}`}
        </Space>
      }
      onCancel={() => {
        form.resetFields();
        onClose(null);
      }}
      onOk={submit}
      okText={isEdit ? "Save" : "File document"}
      confirmLoading={create.isPending || update.isPending}
      width={760}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" preserve={false}>
        <Space size="large" align="start" style={{ width: "100%" }} wrap>
          <Form.Item label="Document type" style={{ minWidth: 300 }}>
            <Select
              value={docType?.code}
              disabled={isEdit}
              onChange={(code) => {
                setDocTypeCode(code);
                form.resetFields(docTypes.flatMap((t) => t.fields.map((f) => f.key)));
              }}
              options={docTypes.map((t) => ({ value: t.code, label: t.label }))}
            />
          </Form.Item>
          <Form.Item name="province" label="Province" rules={[{ required: true, message: "Choose the province." }]} style={{ minWidth: 200 }}>
            <Select options={PROVINCE_OPTIONS} placeholder="Where it is filed" />
          </Form.Item>
          {docType?.serial && !isEdit && (
            <Form.Item label="Serial">
              <Tag>{docType.serial.prefix}{"".padStart(docType.serial.pad, "#")}</Tag>
              <Text type="secondary" style={{ fontSize: 12 }}>assigned on filing</Text>
            </Form.Item>
          )}
        </Space>

        {sections.map((section, i) => (
          <div key={section.title || i}>
            {section.title && <Divider orientation="left" plain style={{ marginTop: 4 }}>{section.title}</Divider>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "0 16px" }}>
              {section.fields.map((f) => (
                <Form.Item
                  key={f.key}
                  name={f.key}
                  label={f.label}
                  valuePropName={f.type === "checkbox" ? "checked" : "value"}
                  rules={f.required ? [{ required: true, message: `${f.label} is required.` }] : undefined}
                  style={f.type === "textarea" ? { gridColumn: "1 / -1" } : undefined}
                >
                  <FieldInput field={f} lookups={lookups} />
                </Form.Item>
              ))}
            </div>
          </div>
        ))}

        {!isEdit && (
          <Form.Item label="Scanned document" required>
            <Upload.Dragger
              maxCount={1}
              accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff,.doc,.docx,.xls,.xlsx"
              beforeUpload={(file) => {
                setScan(file);
                return false;
              }}
              onRemove={() => setScan(null)}
              fileList={scan ? [scan] : []}
            >
              <p className="ant-upload-drag-icon"><InboxOutlined style={{ color: theme.accent }} /></p>
              <p className="ant-upload-text">Click or drag the scan here</p>
              <p className="ant-upload-hint">
                Filed on the {theme.short} share under the province, year and {unit === "legal" ? "company" : "station"}
                {docType?.folder ? `, in the ${docType.folder} folder` : ""}.
              </p>
            </Upload.Dragger>
          </Form.Item>
        )}
        {!isEdit && dupes?.duplicates?.length > 0 && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            message="A file with this name is already filed"
            description={
              <Space direction="vertical" size={2}>
                {dupes.duplicates.map((d) => (
                  <Text key={d.serialNo} style={{ fontSize: 12 }}>
                    <Text style={{ fontFamily: "monospace" }}>{d.serialNo}</Text> · {d.docTypeLabel || d.docType} · {d.title || "—"}
                  </Text>
                ))}
                <Text type="secondary" style={{ fontSize: 12 }}>It may be the same scan. You may still file this one.</Text>
              </Space>
            }
          />
        )}
        {!isEdit && (
          <Form.Item
            label="Location on the share"
            extra={scan ? `Where the scan files: the ${unit === "legal" ? "company" : "station"} folder under the province and year, and a folder inside it. Choose ones that exist, make new ones, or leave them to the layout.` : "Where the scan will file. Choose the province and the scan for it to apply."}
          >
            <FolderPicker
              unit={unit}
              province={province}
              date={yearValue && typeof yearValue.format === "function" ? yearValue.format("YYYY-MM-DD") : yearValue || undefined}
              hint={typeof folderHint === "string" ? folderHint : undefined}
              typeFolder={docType?.folder || null}
              value={folder}
              onChange={setFolder}
              subfolder={subfolder}
              onSubfolderChange={setSubfolder}
            />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
};

export default UnitUploadModal;
