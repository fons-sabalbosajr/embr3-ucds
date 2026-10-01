import { useEffect, useMemo, useState } from "react";
import { Alert, App as AntdApp, AutoComplete, DatePicker, Form, Input, Modal, Radio, Select, Space, Tabs, Tag, Typography, Upload } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import { attachRecordFile } from "../../../shared/api/recordDocuments";
import RegisterLookup from "./RegisterLookup";
import FolderPicker from "./FolderPicker";
import dayjs from "dayjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PROVINCE_LABEL,
  checkDuplicates,
  createRecord,
  describeApiError,
  fetchLookups,
  fetchNextSerial,
  fetchUnitSettings,
  updateRecord,
  uploadRecord,
} from "../api/ermsService";

// Create and edit share one form: the fields are identical and only the
// submitted verb differs.
//
// Project type, city and barangay are offered from the desktop ERMS's own
// menus (see /api/erms/lookups) — the same lists the Records Unit chose from
// for years — but stay free text underneath, so a value that is not on the
// list, or one typed into an older record, is still accepted.

const contains = (input, option) =>
  String(option?.value || "").toLowerCase().includes(String(input || "").toLowerCase());

// The type folder the layout files each permit kind into (the desktop
// system's folders; see configService DEFAULTS). Shown as the default leaf
// in the location picker.
const TYPE_FOLDER = {
  "ecc-original": "ECC Folder",
  "ecc-amended": "ECC Folder",
  cnc: "CNC",
  "hw-generator": "HWID Folder",
  dp: "DP Folder",
  pto: "PTO Folder",
  other: "Others",
};

const PERMIT_OPTIONS = [
  { value: "ecc-original", label: "ECC (Original)" },
  { value: "ecc-amended", label: "ECC (Amended)" },
  { value: "cnc", label: "Certificate of Non-Coverage" },
  { value: "hw-generator", label: "HW Generator Registration" },
  { value: "other", label: "Other" },
];

const RecordFormModal = ({ open, record, writableProvinces, onClose }) => {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const isEdit = Boolean(record);
  // Watched so the register lookup can react as the number is typed.
  const [permitNumber, setPermitNumber] = useState("");
  // The scan to file with a new record. Held here, not uploaded on pick: the
  // record and its file are one request, so nothing lands on the share for a
  // record that is then not saved.
  const [scan, setScan] = useState(null);
  // The project folder on the share the clerk chose for the scan, if any
  // (see FolderPicker). Null files under the project title as before.
  const [folder, setFolder] = useState(null);
  const [subfolder, setSubfolder] = useState(null);
  // Re-uploading over a record that has a scan: what to do with the old
  // file on the share. "keep" leaves it where the desktop system filed it.
  const [oldFile, setOldFile] = useState("keep");
  const [tab, setTab] = useState("permit");

  // The serial the record will get, as the desktop system showed the next
  // FSN. Peeked, not claimed: the number is taken on save.
  const { data: nextSerial } = useQuery({
    queryKey: ["erms", "next-serial"],
    queryFn: fetchNextSerial,
    enabled: open && !isEdit,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  useEffect(() => {
    if (!open) return;
    setScan(null);
    setFolder(null);
    setSubfolder(null);
    setOldFile("keep");
    setTab("permit");
    setPermitNumber(record?.permit?.number || "");
    form.setFieldsValue(
      record
        ? {
            proponentName: record.proponentName,
            projectTitle: record.projectTitle,
            remarks: record.remarks,
            permitType: record.permit?.type,
            permitNumber: record.permit?.number,
            processSource: record.permit?.processSource,
            dateApproved: record.permit?.dateApproved ? dayjs(record.permit.dateApproved) : null,
            dateAmended: record.permit?.dateAmended ? dayjs(record.permit.dateAmended) : null,
            projectType: record.project?.type,
            province: record.location?.province,
            city: record.location?.city,
            barangay: record.location?.barangay,
            street: record.location?.street,
            fileName: record.document?.fileName,
            fileClass: record.document?.fileClass,
          }
        : { permitType: "cnc" }
    );
  }, [open, record, form]);

  const settle = (verb) => (saved) => {
    message.success(`${verb} ${saved.serialNo}.`);
    queryClient.invalidateQueries({ queryKey: ["erms"] });
    form.resetFields();
    onClose(saved);
  };

  const createMutation = useMutation({
    mutationFn: (payload) => (scan ? uploadRecord({ payload, file: scan }) : createRecord(payload)),
    onSuccess: settle(scan ? "Filed" : "Created"),
    onError: (e) => message.error(describeApiError(e, "Could not create the record.")),
  });

  // Editing with a new scan chosen: the record's fields first, then the
  // re-upload, which says what became of the old file.
  const updateMutation = useMutation({
    mutationFn: async (payload) => {
      const saved = await updateRecord(payload);
      if (!scan) return saved;
      const hadFile = Boolean(record?.document?.fileName);
      const result = await attachRecordFile({ serialNo: payload.serialNo, file: scan, replace: hadFile ? oldFile : "missing", folder, subfolder });
      if (result.previous) {
        if (result.previous.deleted) message.info(`The previous file “${result.previous.fileName}” was deleted from the share.`);
        else if (result.previous.reason === "kept") message.info(`The previous file “${result.previous.fileName}” was kept on the share.`);
        else message.warning(`The previous file “${result.previous.fileName}” could not be deleted (${result.previous.reason}); it is still on the share.`);
      }
      return result.record;
    },
    onSuccess: settle(scan ? "Updated and re-uploaded" : "Updated"),
    onError: (e) => message.error(describeApiError(e, "Could not save the record.")),
  });

  const submit = async () => {
    const v = await form.validateFields();
    const payload = {
      proponentName: v.proponentName,
      projectTitle: v.projectTitle,
      remarks: v.remarks || null,
      permit: {
        type: v.permitType,
        number: v.permitNumber || null,
        processSource: v.processSource || null,
        dateApproved: v.dateApproved ? v.dateApproved.format("YYYY-MM-DD") : null,
        dateAmended: v.dateAmended ? v.dateAmended.format("YYYY-MM-DD") : null,
      },
      project: { type: v.projectType || null },
      location: {
        province: v.province,
        provinceLabel: PROVINCE_LABEL[v.province] || null,
        city: v.city || null,
        barangay: v.barangay || null,
        street: v.street || null,
      },
      // With a scan attached the server fills the document from the file —
      // and on a re-upload the document is left to the upload step, so a
      // failed upload does not leave the record naming a file it lacks.
      document: isEdit && scan
        ? { fileClass: v.fileClass || null }
        : { fileName: scan ? scan.name : v.fileName || null, folder: scan ? folder : null, subfolder: scan ? subfolder : null, fileClass: v.fileClass || null },
    };

    if (isEdit) updateMutation.mutate({ serialNo: record.serialNo, ...payload });
    else createMutation.mutate(payload);
  };

  // Only provinces the account may write are offered — the API refuses the
  // rest, so listing them would only produce a rejected save.
  const provinceOptions = (writableProvinces || Object.keys(PROVINCE_LABEL)).map((p) => ({
    value: p,
    label: PROVINCE_LABEL[p] || p,
  }));

  // The menus, per province for the address lists. Cached: they change only
  // when the loader is re-run.
  const province = Form.useWatch("province", form);
  const city = Form.useWatch("city", form);
  const dateApproved = Form.useWatch("dateApproved", form);
  const projectTitle = Form.useWatch("projectTitle", form);
  const permitType = Form.useWatch("permitType", form);

  // The Records Unit's own rules (Settings › ERMS): what is required, what
  // is warned about, which classifications are offered.
  const { data: unitSettings } = useQuery({
    queryKey: ["erms", "unit-settings", "records"],
    queryFn: () => fetchUnitSettings("records"),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });
  const rules = unitSettings?.settings;
  const classifications = rules?.privacy?.classifications || ["Public"];
  useEffect(() => {
    if (open && rules && !form.getFieldValue("fileClass")) {
      form.setFieldValue("fileClass", record?.document?.fileClass || rules.privacy.defaultClassification);
    }
  }, [open, rules, record, form]);

  // A permit number or file name already filed, shown as it is typed. The
  // API refuses the save when the unit chose to block; otherwise the clerk
  // is told and may go ahead.
  const [permitDebounced, setPermitDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setPermitDebounced(permitNumber.trim()), 400);
    return () => clearTimeout(t);
  }, [permitNumber]);
  const wantsDuplicateCheck = Boolean(rules && (rules.duplicates.warnOnPermitNumber || rules.duplicates.blockOnPermitNumber || rules.duplicates.warnOnFileName));
  const { data: dupes } = useQuery({
    queryKey: ["erms", "duplicates", permitDebounced, scan?.name || null, record?.serialNo || null],
    queryFn: () => checkDuplicates({ permitNumber: permitDebounced || undefined, fileName: scan?.name || undefined, exclude: record?.serialNo || undefined }),
    enabled: open && wantsDuplicateCheck && Boolean(permitDebounced || scan?.name),
    staleTime: 30 * 1000,
  });
  const { data: lookups } = useQuery({
    queryKey: ["erms", "lookups", province || null],
    queryFn: () => fetchLookups({ province }),
    enabled: open,
    staleTime: 10 * 60 * 1000,
  });

  const projectTypeOptions = useMemo(() => {
    const groups = new Map();
    for (const t of lookups?.projectTypes || []) {
      const g = t.category || (t.source === "records-data" ? "Used in records" : "Other");
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push({ value: t.label });
    }
    return [...groups].map(([label, options]) => ({ label, options }));
  }, [lookups]);

  const cityOptions = useMemo(
    () => (lookups?.cities || []).map((c) => ({ value: c.label, id: c.id })),
    [lookups]
  );
  const barangayOptions = useMemo(() => {
    const cityId = cityOptions.find((c) => c.value === city)?.id;
    return (lookups?.barangays || [])
      .filter((b) => !cityId || b.cityId === cityId)
      .map((b) => ({ value: b.label }));
  }, [lookups, cityOptions, city]);

  // Which tab holds which fields, so a validation error can open the tab it
  // is on rather than fail silently behind another one.
  const TAB_OF = {
    proponentName: "permit", projectTitle: "permit", permitType: "permit", permitNumber: "permit", processSource: "permit",
    dateApproved: "permit", dateAmended: "permit", projectType: "permit",
    province: "location", city: "location", barangay: "location", street: "location",
    fileName: "document", remarks: "document",
  };
  const submitWithTabs = () =>
    submit().catch((err) => {
      const first = err?.errorFields?.[0]?.name?.[0];
      if (first && TAB_OF[first]) setTab(TAB_OF[first]);
    });

  const tabs = [
    {
      key: "permit",
      label: "Proponent & permit",
      forceRender: true,
      children: (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "0 16px" }}>
          <Form.Item name="proponentName" label="Proponent" rules={[{ required: true, message: "Enter the proponent." }]} style={{ gridColumn: "1 / -1" }}>
            <Input placeholder="Name of the proponent" />
          </Form.Item>
          <Form.Item name="projectTitle" label="Project title" rules={[{ required: true, message: "Enter the project title." }]} style={{ gridColumn: "1 / -1" }}>
            <Input placeholder="Title of the project" />
          </Form.Item>
          <Form.Item name="permitType" label="Permit type" rules={[{ required: true }]}>
            <Select options={PERMIT_OPTIONS} />
          </Form.Item>
          <Form.Item name="processSource" label="Process">
            <Select
              allowClear
              options={[
                { value: "Manual Process", label: "Manual Process" },
                { value: "Online Process", label: "Online Process" },
              ]}
            />
          </Form.Item>
          <div style={{ gridColumn: "1 / -1" }}>
            <Form.Item
              name="permitNumber"
              label="Permit number"
              extra="Used to link this record to an establishment in the Universe register."
              style={{ marginBottom: 8 }}
              rules={rules?.dataQuality?.requirePermitNumber ? [{ required: true, message: "The permit number is required." }] : undefined}
            >
              <Input placeholder="ECC-OL-R03-2019-0573" onChange={(e) => setPermitNumber(e.target.value)} />
            </Form.Item>
            {dupes?.duplicates?.length > 0 && (
              <Alert
                type={dupes.blocks ? "error" : "warning"}
                showIcon
                style={{ marginBottom: 8 }}
                message={dupes.blocks ? "Already filed — the unit refuses a second record with this permit number" : "Already filed"}
                description={
                  <Space direction="vertical" size={2}>
                    {dupes.duplicates.map((d) => (
                      <Typography.Text key={d.serialNo} style={{ fontSize: 12 }}>
                        <Typography.Text style={{ fontFamily: "monospace" }}>{d.serialNo}</Typography.Text> · {d.permit?.label || d.permit?.type} {d.permit?.number || ""} · {d.proponentName || "—"}
                        {d.document?.fileName === scan?.name ? " · same file name" : ""}
                      </Typography.Text>
                    ))}
                    {!dupes.blocks && <Typography.Text type="secondary" style={{ fontSize: 12 }}>An amendment or attachment may belong on the existing record. You may still save this one.</Typography.Text>}
                  </Space>
                }
              />
            )}
            <RegisterLookup permitNumber={permitNumber} />
          </div>
          <Form.Item name="dateApproved" label="Date approved" rules={rules?.dataQuality?.requireDateApproved ? [{ required: true, message: "The date approved is required." }] : undefined}>
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="dateAmended" label="Date amended">
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="projectType" label="Project type" style={{ gridColumn: "1 / -1" }} rules={rules?.dataQuality?.requireProjectType ? [{ required: true, message: "The project type is required." }] : undefined}>
            <AutoComplete options={projectTypeOptions} filterOption={contains} placeholder="e.g. Mining and Quarrying Projects" allowClear />
          </Form.Item>
        </div>
      ),
    },
    {
      key: "location",
      label: "Location",
      forceRender: true,
      children: (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "0 16px" }}>
          <Form.Item
            name="province"
            label="Province"
            rules={[{ required: true, message: "Select a province." }]}
            extra={writableProvinces ? "Only provinces your account may modify are listed." : undefined}
          >
            <Select options={provinceOptions} />
          </Form.Item>
          <Form.Item name="city" label="City / Municipality">
            <AutoComplete options={cityOptions} filterOption={contains} placeholder={province ? "Choose or type" : "Select the province first"} allowClear />
          </Form.Item>
          <Form.Item name="barangay" label="Barangay">
            <AutoComplete options={barangayOptions} filterOption={contains} placeholder={city ? "Choose or type" : "Choose the city first"} allowClear />
          </Form.Item>
          <Form.Item name="street" label="Street">
            <Input />
          </Form.Item>
        </div>
      ),
    },
    {
      key: "document",
      label: "Document",
      forceRender: true,
      children: (
        <>
          {isEdit ? (
            <>
              <Form.Item name="fileName" label="Document file name">
                <Input placeholder="Scan file name as stored on the records share" />
              </Form.Item>
              <Form.Item
                label="Re-upload the scanned document"
                extra="Choose a file to replace the document on this record. It is filed on the share under the province, year and project like a new upload."
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
                  <p className="ant-upload-drag-icon">
                    <InboxOutlined />
                  </p>
                  <p className="ant-upload-text">Click or drag the new scan here</p>
                  <p className="ant-upload-hint">Leave empty to keep the current document.</p>
                </Upload.Dragger>
              </Form.Item>
              {scan && record?.document?.fileName && (
                <Form.Item label="The current file on the NAS">
                  <Radio.Group value={oldFile} onChange={(e) => setOldFile(e.target.value)}>
                    <Space direction="vertical">
                      <Radio value="keep">Keep it on the share (the record points at the new file; the old one stays where it is)</Radio>
                      <Radio value="delete">Delete it from the share after the new file is written</Radio>
                    </Space>
                  </Radio.Group>
                  {oldFile === "delete" && (
                    <Alert
                      type="warning"
                      showIcon
                      style={{ marginTop: 8 }}
                      message={`“${record.document.fileName}” will be removed from the NAS. This cannot be undone from the application.`}
                    />
                  )}
                </Form.Item>
              )}
              {scan && (
                <Form.Item label="Location on the share" extra="Where the new scan files. Choose or make the folders, or leave them to the layout.">
                  <FolderPicker
                    unit="records"
                    province={province}
                    date={dateApproved ? dateApproved.format("YYYY-MM-DD") : undefined}
                    hint={projectTitle}
                    typeFolder={TYPE_FOLDER[permitType]}
                    value={folder}
                    onChange={setFolder}
                    subfolder={subfolder}
                    onSubfolderChange={setSubfolder}
                  />
                </Form.Item>
              )}
            </>
          ) : (
            <Form.Item
              label="Scanned document"
              extra="Filed on the Records share under the province, year and project, like the desktop system did. Leave empty to create the record without a scan."
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
                <p className="ant-upload-drag-icon">
                  <InboxOutlined />
                </p>
                <p className="ant-upload-text">Click or drag the scan here</p>
                <p className="ant-upload-hint">PDF or image; one file per record.</p>
              </Upload.Dragger>
            </Form.Item>
          )}
          {!isEdit && (
            <Form.Item
              label="Location on the share"
              extra={scan ? "Where the scan files: the project folder under the province and year, and a folder inside it. Choose ones that exist, make new ones, or leave them to the layout." : "Where a scan would file. Attach a scan above for it to apply."}
            >
              <FolderPicker
                unit="records"
                province={province}
                date={dateApproved ? dateApproved.format("YYYY-MM-DD") : undefined}
                hint={projectTitle}
                typeFolder={TYPE_FOLDER[permitType]}
                value={folder}
                onChange={setFolder}
                subfolder={subfolder}
                onSubfolderChange={setSubfolder}
              />
            </Form.Item>
          )}
          <Form.Item name="fileClass" label="Classification" extra="Who the document is for. The unit's default applies when left as is (Settings › ERMS › Data privacy).">
            <Select options={classifications.map((c) => ({ value: c, label: c }))} />
          </Form.Item>
          <Form.Item name="remarks" label="Remarks">
            <Input.TextArea rows={3} />
          </Form.Item>
        </>
      ),
    },
  ];

  return (
    <Modal
      title={
        <Space>
          {isEdit ? `Edit ${record.serialNo}` : "Upload record"}
          {!isEdit && (
            <Tag color="geekblue" style={{ fontFamily: "monospace" }}>
              {nextSerial ? `next: ${nextSerial}` : "next FSN…"}
            </Tag>
          )}
        </Space>
      }
      open={open}
      onCancel={() => {
        form.resetFields();
        onClose(null);
      }}
      onOk={submitWithTabs}
      okText={isEdit ? (scan ? "Save and re-upload" : "Save") : scan ? "File record and scan" : "Create record"}
      confirmLoading={createMutation.isPending || updateMutation.isPending}
      width={760}
      destroyOnHidden
    >
      {!isEdit && (
        <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
          The serial shown is the next in the FSN sequence and is claimed when the record is saved.
        </Typography.Paragraph>
      )}
      <Form form={form} layout="vertical" preserve={false}>
        <Tabs activeKey={tab} onChange={setTab} items={tabs} />
      </Form>
    </Modal>
  );
};

export default RecordFormModal;
