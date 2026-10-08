import { useEffect, useMemo, useState } from "react";
import { Alert, App as AntdApp, AutoComplete, DatePicker, Form, Input, InputNumber, Modal, Radio, Select, Skeleton, Space, Tabs, Tag, Typography, Upload } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import { attachRecordFile } from "../../../shared/api/recordDocuments";
import RegisterLookup from "./RegisterLookup";
import FolderPicker from "./FolderPicker";
import SuggestInput from "./SuggestInput";
import dayjs from "dayjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PERMIT_OPTIONS,
  PROVINCE_LABEL,
  checkDuplicates,
  createRecord,
  describeApiError,
  fetchLookups,
  fetchNextSerial,
  fetchRecord,
  fetchRecordSuggestions,
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
  luc: "LUC Folder",
  coa: "COA Folder",
  other: "Others",
};

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

  // Editing starts from the record as stored, never from the row it was
  // opened on. The register's rows carry only the columns it shows, so a
  // form filled from one showed the mailing address and the coordinates
  // empty — and saving wrote those blanks back over the real values. The
  // query is the record page's own, so it is usually already cached.
  const { data: stored, isError: storedFailed } = useQuery({
    queryKey: ["erms", "record", record?.serialNo],
    queryFn: () => fetchRecord(record.serialNo),
    enabled: open && isEdit,
    staleTime: 0,
  });
  const storedRecord = stored?.record || null;
  const current = isEdit ? storedRecord : null;
  // Editing waits for the stored record: the row it was opened from is a
  // partial copy, and a form filled from it saved blanks over the rest.
  const waiting = isEdit && !storedRecord && !storedFailed;

  // The form's values, given to it as initial values so they are in place
  // the moment it is built. Filling it from an effect raced the dialog (and
  // React's development double-mount): the effect ran, the fields were
  // cleared, a "fill once" guard would not fill them again, and the edit
  // dialog opened empty.
  const initialValues = useMemo(
    () =>
      current
        ? {
            proponentName: current.proponentName,
            projectTitle: current.projectTitle,
            remarks: current.remarks,
            permitType: current.permit?.type,
            permitNumber: current.permit?.number,
            processSource: current.permit?.processSource,
            dateApproved: current.permit?.dateApproved ? dayjs(current.permit.dateApproved) : null,
            dateAmended: current.permit?.dateAmended ? dayjs(current.permit.dateAmended) : null,
            projectType: current.project?.type,
            province: current.location?.province,
            city: current.location?.city,
            barangay: current.location?.barangay,
            street: current.location?.street,
            mailingAddress: current.location?.mailingAddress,
            lat: current.location?.lat ?? null,
            long: current.location?.long ?? null,
            fileName: current.document?.fileName,
            fileClass: current.document?.fileClass,
          }
        : { permitType: "cnc" },
    // The serial, not the object: a background refresh of the same record
    // must not rebuild the form under what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current?.serialNo, isEdit]
  );

  // Everything outside the form starts afresh each time the dialog opens.
  useEffect(() => {
    if (!open || waiting) return;
    setScan(null);
    setFolder(null);
    setSubfolder(null);
    setOldFile("keep");
    setTab("permit");
    setPermitNumber(initialValues.permitNumber || "");
  }, [open, waiting, initialValues]);

  const settle = (verb) => (saved) => {
    message.success(`${verb} ${saved.serialNo}.`);
    queryClient.setQueryData(["erms", "record", saved.serialNo], (old) =>
      old && typeof old === "object" ? { ...old, record: saved } : old
    );
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
      const hadFile = Boolean(current?.document?.fileName);
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
        mailingAddress: v.mailingAddress || null,
        lat: typeof v.lat === "number" ? v.lat : null,
        long: typeof v.long === "number" ? v.long : null,
      },
      // With a scan attached the server fills the document from the file —
      // and on a re-upload the document is left to the upload step, so a
      // failed upload does not leave the record naming a file it lacks.
      document: isEdit && scan
        ? { fileClass: v.fileClass || null }
        : { fileName: scan ? scan.name : v.fileName || null, folder: scan ? folder : null, subfolder: scan ? subfolder : null, fileClass: v.fileClass || null },
    };

    if (isEdit) updateMutation.mutate({ serialNo: current.serialNo, ...payload });
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
    if (open && !waiting && rules && !form.getFieldValue("fileClass")) {
      form.setFieldValue("fileClass", current?.document?.fileClass || rules.privacy.defaultClassification);
    }
  }, [open, waiting, rules, current, form]);

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
    () => (lookups?.cities || []).map((c) => ({ value: c.label, id: c.id, lat: c.lat, long: c.long })),
    [lookups]
  );
  const barangayOptions = useMemo(() => {
    const cityId = cityOptions.find((c) => c.value === city)?.id;
    return (lookups?.barangays || [])
      .filter((b) => !cityId || b.cityId === cityId)
      .map((b) => ({ value: b.label, lat: b.lat, long: b.long }));
  }, [lookups, cityOptions, city]);

  // The desktop system's address tables carry coordinates: choosing a
  // barangay (or, failing that, a city) fills the latitude and longitude
  // when they are still empty — never over coordinates someone entered.
  const fillCoordinates = (_, option) => {
    if (typeof option?.lat !== "number" || typeof option?.long !== "number" || (!option.lat && !option.long)) return;
    const lat = form.getFieldValue("lat");
    const long = form.getFieldValue("long");
    const fromCity = cityOptions.some((c) => c.lat === lat && c.long === long);
    if ((lat == null && long == null) || fromCity) form.setFieldsValue({ lat: option.lat, long: option.long });
  };

  // Which tab holds which fields, so a validation error can open the tab it
  // is on rather than fail silently behind another one.
  const TAB_OF = {
    proponentName: "permit", projectTitle: "permit", permitType: "permit", permitNumber: "permit", processSource: "permit",
    dateApproved: "permit", dateAmended: "permit", projectType: "permit",
    province: "location", city: "location", barangay: "location", street: "location", mailingAddress: "location", lat: "location", long: "location",
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
          {/* Offered from what is already on file, so a second permit for a
              proponent is spelled the way the first was. */}
          <Form.Item name="proponentName" label="Proponent" rules={[{ required: true, message: "Enter the proponent." }]} style={{ gridColumn: "1 / -1" }}>
            <SuggestInput
              placeholder="Name of the proponent"
              queryKey={["records", "proponentName"]}
              fetcher={(q) => fetchRecordSuggestions("proponentName", q)}
              onPick={(fill) => {
                if (fill.projectTitle && !form.getFieldValue("projectTitle")) form.setFieldValue("projectTitle", fill.projectTitle);
              }}
            />
          </Form.Item>
          <Form.Item name="projectTitle" label="Project title" rules={[{ required: true, message: "Enter the project title." }]} style={{ gridColumn: "1 / -1" }}>
            <SuggestInput
              placeholder="Title of the project"
              queryKey={["records", "projectTitle"]}
              fetcher={(q) => fetchRecordSuggestions("projectTitle", q)}
            />
          </Form.Item>
          <Form.Item name="permitType" label="Permit type" rules={[{ required: true }]}>
            <Select placeholder="Select the permit type" options={PERMIT_OPTIONS} />
          </Form.Item>
          <Form.Item name="processSource" label="Process">
            <Select placeholder="Select the process"
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
            <Select placeholder="Select a province" options={provinceOptions} />
          </Form.Item>
          <Form.Item name="city" label="City / Municipality">
            <AutoComplete options={cityOptions} filterOption={contains} placeholder={province ? "Choose or type" : "Select the province first"} allowClear onSelect={fillCoordinates} />
          </Form.Item>
          <Form.Item name="barangay" label="Barangay">
            <AutoComplete options={barangayOptions} filterOption={contains} placeholder={city ? "Choose or type" : "Choose the city first"} allowClear onSelect={fillCoordinates} />
          </Form.Item>
          <Form.Item name="street" label="Street">
            <Input placeholder="Street, purok or sitio" />
          </Form.Item>
          <Form.Item name="mailingAddress" label="Mailing address" style={{ gridColumn: "1 / -1" }}>
            <Input.TextArea rows={2} maxLength={500} placeholder="Where correspondence goes, when not the project site" />
          </Form.Item>
          <Form.Item name="lat" label="Latitude" extra="Filled from the barangay or city when chosen.">
            <InputNumber min={-90} max={90} step={0.000001} precision={6} style={{ width: "100%" }} placeholder="e.g. 14.676041" />
          </Form.Item>
          <Form.Item name="long" label="Longitude">
            <InputNumber min={-180} max={180} step={0.000001} precision={6} style={{ width: "100%" }} placeholder="e.g. 120.536529" />
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
            <Select placeholder="The unit's default" options={classifications.map((c) => ({ value: c, label: c }))} />
          </Form.Item>
          <Form.Item name="remarks" label="Remarks">
            <Input.TextArea placeholder="Anything the next person should know" rows={3} />
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
      // Not before the stored record is in: saving the register row's partial
      // values would blank the fields the row does not carry.
      okButtonProps={{ disabled: waiting || (isEdit && storedFailed) }}
      width={760}
      destroyOnHidden
    >
      {!isEdit && (
        <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
          The serial shown is the next in the FSN sequence and is claimed when the record is saved.
        </Typography.Paragraph>
      )}
      {isEdit && storedFailed && (
        <Alert type="error" showIcon style={{ marginBottom: 12 }} message="The record could not be loaded, so it cannot be edited right now. Close this and try again." />
      )}
      {waiting ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : (
        <Form key={current?.serialNo || "new"} form={form} layout="vertical" preserve={false} initialValues={initialValues}>
          <Tabs activeKey={tab} onChange={setTab} items={tabs} />
        </Form>
      )}
    </Modal>
  );
};

export default RecordFormModal;
