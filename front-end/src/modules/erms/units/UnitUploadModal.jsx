import { useEffect, useMemo, useState } from "react";
import { Alert, AutoComplete, Badge, Button, Checkbox, DatePicker, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Tabs, Tag, Tooltip, Typography, Upload } from "antd";
import { InboxOutlined, NumberOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { message } from "../../../shared/feedback";
import { checkUnitDuplicates, claimDocket, describeApiError, fetchLookups, fetchNextDocket, fetchUnitSuggestions, uploadUnitDocument, updateUnitDocument } from "../api/ermsService";
import FolderPicker from "../components/FolderPicker";
import SuggestInput from "../components/SuggestInput";
import { PROVINCE_OPTIONS, groupFields, unitTheme } from "./unitTheme";
import "./unitupload.css";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// Filing a Legal or Laboratory document — the desktop system's upload.
//
// Choose the document type, fill the form that type defines (from ERMS
// Config), choose the scan, file. The form is rendered from the field
// definitions, so each unit's documents get their own form without each
// needing its own screen; the unit's theme decides how the fields are
// grouped so a case file and a sample sheet read differently. Each group is
// a tab, and the scan and its place on the share are the last one.
//
// With `document` set it edits that document's metadata instead; the file
// stays where it was filed.
// ---------------------------------------------------------------------------

const contains = (input, option) => String(option?.value || "").toLowerCase().includes(String(input || "").toLowerCase());

// The fields offered from what the unit already has on file (the server's
// unitDocumentService.SUGGESTABLE). The rest are typed, or chosen from a list.
const SUGGESTED = {
  legal: ["docketNo", "pabCaseNo", "companyName", "companyAddress", "documentType"],
  laboratory: ["cocNo", "firmName", "address", "receivedBy", "unitUnderTest", "subject"],
};

/**
 * The docket field on a form that opens a case (a Notice of Violation): an
 * existing docket can be picked as on any Legal form, or the next number
 * for the province and year issued from the register, as the desktop
 * system's docket register did (EMBR3-2023-PA-111). The number is claimed
 * when issued, so two clerks opening cases at once get two numbers.
 */
const DocketField = ({ value, onChange, onPick, yearField, placeholder }) => {
  const form = Form.useFormInstance();
  const province = Form.useWatch("province", form);
  const dateValue = Form.useWatch(yearField || "__none", form);
  const year = dateValue && typeof dateValue.year === "function" ? dateValue.year() : new Date().getFullYear();

  const { data: next } = useQuery({
    queryKey: ["erms", "docket-next", province, year],
    queryFn: () => fetchNextDocket({ province, year }),
    enabled: Boolean(province),
    staleTime: 0,
  });
  const issue = useMutation({
    mutationFn: () => claimDocket({ province, year }),
    onSuccess: (docket) => {
      onChange?.(docket.docketNo);
      message.success(`Docket ${docket.docketNo} issued.`);
    },
    onError: (e) => message.error(describeApiError(e, "Could not issue a docket number.")),
  });

  return (
    <Space.Compact style={{ width: "100%" }}>
      <SuggestInput
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        queryKey={["legal", "docketNo"]}
        fetcher={(q) => fetchUnitSuggestions("legal", "docketNo", q)}
        onPick={onPick}
      />
      <Popconfirm
        title={next ? `Issue ${next.docketNo}?` : "Issue the next docket number?"}
        description={`The next number in the ${year} register for this province. It is taken when issued.`}
        onConfirm={() => issue.mutate()}
        okText="Issue"
        disabled={!province}
      >
        <Tooltip title={province ? null : "Choose the province first"}>
          <Button icon={<NumberOutlined />} loading={issue.isPending} disabled={!province}>
            New case number
          </Button>
        </Tooltip>
      </Popconfirm>
    </Space.Compact>
  );
};

const FieldInput = ({ field, lookups, unit, onPick, value, onChange, docket, ...rest }) => {
  if (docket && field.key === "docketNo") {
    return <DocketField value={value} onChange={onChange} onPick={onPick} yearField={docket.yearField} placeholder={field.placeholder} />;
  }
  if ((SUGGESTED[unit] || []).includes(field.key) && ["text", "textarea", undefined].includes(field.type)) {
    return (
      <SuggestInput
        id={rest.id}
        value={value}
        onChange={onChange}
        textarea={field.type === "textarea"}
        placeholder={field.placeholder}
        queryKey={[unit, field.key]}
        fetcher={(q) => fetchUnitSuggestions(unit, field.key, q)}
        onPick={onPick}
      />
    );
  }
  const props = { value, onChange, ...rest };
  switch (field.type) {
    case "textarea":
      return <Input.TextArea rows={2} placeholder={field.placeholder} {...props} />;
    case "date":
      return <DatePicker style={{ width: "100%" }} {...props} />;
    case "number":
      return <InputNumber style={{ width: "100%" }} placeholder={field.placeholder} {...props} />;
    case "checkbox":
      return <Checkbox {...props} />;
    case "select":
      return <Select allowClear options={(field.options || []).map((o) => ({ value: o, label: o }))} placeholder={field.placeholder} {...props} />;
    case "lookup": {
      const list = lookups?.[field.lookup] || [];
      return <AutoComplete allowClear options={list.map((it) => ({ value: it.label }))} filterOption={contains} placeholder={field.placeholder || "Choose or type"} {...props} />;
    }
    default:
      return <Input placeholder={field.placeholder} {...props} />;
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
  // The tab on show, and the tabs holding a field that failed its check.
  const [tab, setTab] = useState("section-0");
  const [errorTabs, setErrorTabs] = useState([]);
  const [scanMissing, setScanMissing] = useState(false);
  const theme = unitTheme(unit);
  const isEdit = Boolean(document);
  // The fields the filing layout reads: which one names the folder, which
  // date gives the year. Watched so the picker lists the right level.
  const province = Form.useWatch("province", form);
  const folderHint = Form.useWatch(unitConfig?.folder?.folderField || "__none", form);
  const yearValue = Form.useWatch(unitConfig?.folder?.yearField || "__none", form);

  const docTypes = useMemo(() => unitConfig?.docTypes || [], [unitConfig]);
  const docType = docTypes.find((t) => t.code === (isEdit ? document.docType : docTypeCode)) || null;

  // What the edit form starts from: the document as stored. Given to the
  // form as its initial values, so they are there the moment it is built.
  // Setting them from an effect instead raced the dialog: the fields were
  // filled before the form inside it existed, the form opened empty, and
  // saving wrote the blanks over the document.
  const editValues = useMemo(() => {
    if (!document) return undefined;
    const values = { province: document.province };
    for (const f of docTypes.find((t) => t.code === document.docType)?.fields || []) {
      const v = document.fields?.[f.key];
      values[f.key] = f.type === "date" && v ? dayjs(v) : v ?? undefined;
    }
    return values;
  }, [document, docTypes]);

  useEffect(() => {
    if (!open) return;
    setScan(null);
    setFolder(null);
    setSubfolder(null);
    setTab("section-0");
    setErrorTabs([]);
    setScanMissing(false);
    if (document) {
      setDocTypeCode(document.docType);
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
  // A new case: this type opens one, so its docket can be issued here.
  const issuesDocket = !isEdit && Boolean(docType && unitConfig?.docket?.issueOn?.includes(docType.code));

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
    queryClient.setQueryData(["erms", "unit", unit, "document", saved.serialNo], (old) =>
      old && typeof old === "object" ? { ...old, document: saved } : old
    );
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

  // The tabs: one per section of the form, then the scan and where it files.
  const tabKeys = [...sections.map((_, i) => `section-${i}`), ...(isEdit ? [] : ["scan"])];
  const tabOf = (key) => {
    const i = sections.findIndex((s) => s.fields.some((f) => f.key === key));
    return i >= 0 ? `section-${i}` : null;
  };
  const step = tabKeys.indexOf(tab);

  // A chosen docket or COC number brings its company or firm with it — only
  // into fields this document type has and the clerk has left empty.
  const fillFrom = (fill) => {
    const own = new Set((docType?.fields || []).map((f) => f.key));
    const values = Object.fromEntries(Object.entries(fill).filter(([k]) => own.has(k) && !form.getFieldValue(k)));
    if (Object.keys(values).length) form.setFieldsValue(values);
  };

  const submit = async () => {
    if (!docType) return;
    let v;
    try {
      v = await form.validateFields();
    } catch (err) {
      // Open the tab holding the first problem, and mark every tab with one.
      const tabs = [...new Set((err?.errorFields || []).map((e) => tabOf(e.name?.[0])).filter(Boolean))];
      setErrorTabs(tabs);
      if (tabs.length) setTab(tabs[0]);
      if (!isEdit && !scan) setScanMissing(true);
      return;
    }
    setErrorTabs([]);
    const fields = {};
    for (const f of docType.fields || []) {
      const raw = v[f.key];
      fields[f.key] = f.type === "date" && raw ? raw.format("YYYY-MM-DD") : raw ?? null;
    }
    if (isEdit) {
      // Only what was changed. Every other field keeps its stored value
      // exactly — a date field re-sent as a plain date would lose the time
      // the desktop system recorded with it (a conference schedule, say).
      const same = (a, b) => {
        const norm = (x) => (dayjs.isDayjs(x) ? x.format("YYYY-MM-DD") : x === "" || x === undefined ? null : x);
        return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
      };
      const changed = {};
      for (const f of docType.fields || []) if (!same(editValues?.[f.key], v[f.key])) changed[f.key] = fields[f.key];
      const provinceChanged = v.province && v.province !== document.province;
      if (!Object.keys(changed).length && !provinceChanged) {
        message.info("Nothing was changed.");
        onClose(null);
        return;
      }
      update.mutate({ unit, serialNo: document.serialNo, ...(provinceChanged ? { province: v.province } : {}), fields: changed });
    } else {
      if (!scan) {
        setScanMissing(true);
        setTab("scan");
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
      // Step through the tabs, or file from any of them.
      footer={
        <Space>
          <Button onClick={() => { form.resetFields(); onClose(null); }}>Cancel</Button>
          <Button disabled={step <= 0} onClick={() => setTab(tabKeys[step - 1])}>Back</Button>
          {step < tabKeys.length - 1 && <Button onClick={() => setTab(tabKeys[step + 1])}>Next</Button>}
          <Button type="primary" loading={create.isPending || update.isPending} onClick={submit}>
            {isEdit ? "Save" : "File document"}
          </Button>
        </Space>
      }
      width="min(1040px, 96vw)"
      style={{ top: 32 }}
      destroyOnHidden
    >
      {/* Rebuilt for each document, and once the unit's field list is in,
          so the initial values always match the fields on show. */}
      <Form key={isEdit ? `${document.serialNo}:${docTypes.length}` : "new"} form={form} layout="vertical" preserve={false} initialValues={editValues}>
        {/* What the document is and where it belongs: always in view. */}
        <div className="unit-upload-head">
          <Form.Item label="Document type">
            <Select placeholder="Choose the document type"
              value={docType?.code}
              disabled={isEdit}
              onChange={(code) => {
                setDocTypeCode(code);
                setTab("section-0");
                setErrorTabs([]);
                form.resetFields(docTypes.flatMap((t) => t.fields.map((f) => f.key)));
              }}
              options={docTypes.map((t) => ({ value: t.code, label: t.label }))}
            />
          </Form.Item>
          <Form.Item name="province" label="Province" rules={[{ required: true, message: "Choose the province." }]}>
            <Select options={PROVINCE_OPTIONS} placeholder="Where it is filed" />
          </Form.Item>
          {docType?.serial && !isEdit && (
            <Form.Item label="Serial">
              <Space size={6}>
                <Tag style={{ fontFamily: "monospace" }}>{docType.serial.prefix}{"".padStart(docType.serial.pad, "#")}</Tag>
                <Text type="secondary" style={{ fontSize: 12 }}>assigned on filing</Text>
              </Space>
            </Form.Item>
          )}
        </div>

        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            // forceRender: every field stays mounted, so the form checks the
            // tabs nobody opened as well as the one on show.
            ...sections.map((section, i) => ({
              key: `section-${i}`,
              forceRender: true,
              label: (
                <Badge dot={errorTabs.includes(`section-${i}`)} offset={[6, 0]}>
                  <span>{`${i + 1}. ${section.title || "Details"}`}</span>
                </Badge>
              ),
              children: (
                <div className="unit-upload-grid">
                  {section.fields.map((f) => (
                    <Form.Item
                      key={f.key}
                      name={f.key}
                      label={f.label}
                      valuePropName={f.type === "checkbox" ? "checked" : "value"}
                      rules={f.required ? [{ required: true, message: `${f.label} is required.` }] : undefined}
                      style={f.type === "textarea" ? { gridColumn: "1 / -1" } : undefined}
                    >
                      <FieldInput field={f} lookups={lookups} unit={unit} onPick={fillFrom} docket={issuesDocket ? { yearField: unitConfig?.folder?.yearField } : null} />
                    </Form.Item>
                  ))}
                </div>
              ),
            })),
            ...(isEdit
              ? []
              : [
                  {
                    key: "scan",
                    forceRender: true,
                    label: (
                      <Badge dot={scanMissing && !scan} offset={[6, 0]}>
                        <span>{`${sections.length + 1}. Scan & location`}</span>
                      </Badge>
                    ),
                    children: (
                      <div className="unit-upload-scan">
                        <div>
                          <Form.Item
                            label="Scanned document"
                            required
                            validateStatus={scanMissing && !scan ? "error" : undefined}
                            help={scanMissing && !scan ? "Choose the scan to file." : undefined}
                          >
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
                          {dupes?.duplicates?.length > 0 && (
                            <Alert
                              type="warning"
                              showIcon
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
                        </div>
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
                      </div>
                    ),
                  },
                ]),
          ]}
        />
      </Form>
    </Modal>
  );
};

export default UnitUploadModal;
