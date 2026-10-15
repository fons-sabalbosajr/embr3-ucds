import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, DatePicker, Form, Input, Modal, Select, Space, Tag, Typography, Upload } from "antd";
import { UnitTabs, UploadFooter } from "./UploadParts";
import { InboxOutlined } from "@ant-design/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { message } from "../../../shared/feedback";
import { PERMIT_OPTIONS, PROVINCE_LABEL, describeApiError, uploadRecord } from "../api/ermsService";
import { unitTheme } from "../units/unitTheme";
import NasFolderBrowser from "./NasFolderBrowser";
import "../units/unitupload.css";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// Add an attachment to a record — the desktop system's "Add Attachment".
//
// An amendment, a certified copy, a letter: a second document filed against
// a record that is already on file. It carries the record's proponent,
// permit number and place, is numbered after it (FSN-0000206 Att-00099),
// and its scan is filed beside the record's own unless another folder is
// chosen.
//
// The same window as Upload record (RecordFormModal): numbered tabs, Back
// and Next, the scan and the folder browser on the Document tab — so filing
// an attachment is the same work as filing the record was.
// ---------------------------------------------------------------------------

const theme = unitTheme("records");
const TAB_KEYS = ["attachment", "document"];
const TAB_OF = { title: "attachment", permitType: "attachment", dateApproved: "attachment", remarks: "attachment" };

const AttachmentModal = ({ open, parent, onClose }) => {
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [tab, setTab] = useState("attachment");
  const [errorTabs, setErrorTabs] = useState([]);
  // One or more scans: each is filed as an attachment of its own, with the
  // details on the form (several at once — the bulk upload).
  const [scans, setScans] = useState([]);
  const scan = scans[0] || null;
  const [missing, setMissing] = useState(false);
  const [targetPath, setTargetPath] = useState(null);
  const province = parent?.location?.province;

  useEffect(() => {
    if (!open || !parent) return;
    setTab("attachment");
    setErrorTabs([]);
    setScans([]);
    setMissing(false);
    setTargetPath(null);
  }, [open, parent]);

  // The starting values, given to the form when it is built (an effect that
  // filled them raced the dialog and could leave the form empty).
  const initialValues = useMemo(
    () => (parent ? { permitType: parent.permit?.type === "ecc-original" ? "ecc-amended" : parent.permit?.type || "other", title: parent.projectTitle, dateApproved: null, remarks: "" } : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parent?.serialNo]
  );

  // The upload's progress, 0–100, while the scan is on its way; null otherwise.
  const [progress, setProgress] = useState(null);
  const save = useMutation({
    // One after the other, so each gets its attachment number in order; the
    // bar is the whole batch's progress.
    mutationFn: async ({ payload }) => {
      const saved = [];
      for (let i = 0; i < scans.length; i++) {
        const file = scans[i];
        const title = scans.length > 1 ? `${payload.projectTitle} — ${file.name.replace(/\.[a-z0-9]{2,5}$/i, "")}` : payload.projectTitle;
        saved.push(
          await uploadRecord({
            payload: { ...payload, projectTitle: title, document: { ...payload.document, fileName: file.name } },
            file,
            onProgress: (p) => setProgress(Math.round(((i + p / 100) / scans.length) * 100)),
          })
        );
      }
      return saved;
    },
    onSettled: () => setProgress(null),
    onSuccess: (saved) => {
      message.success(saved.length === 1 ? `Filed ${saved[0].serialNo}.` : `Filed ${saved.length} attachments: ${saved[0].serialNo} to ${saved[saved.length - 1].serialNo}.`);
      queryClient.invalidateQueries({ queryKey: ["erms"] });
      onClose(saved[saved.length - 1]);
    },
    onError: (e) => message.error(describeApiError(e, "The attachment could not be filed.")),
  });

  const close = () => {
    form.resetFields();
    onClose(null);
  };

  const submit = async () => {
    let v;
    try {
      v = await form.validateFields();
    } catch (err) {
      const tabs = [...new Set((err?.errorFields || []).map((f) => TAB_OF[f.name?.[0]]).filter(Boolean))];
      setErrorTabs(tabs);
      if (tabs[0]) setTab(tabs[0]);
      return;
    }
    if (!scan) {
      setMissing(true);
      setErrorTabs(["document"]);
      setTab("document");
      return;
    }
    setErrorTabs([]);
    save.mutate({
      payload: {
        parentSerialNo: parent.serialNo,
        proponentName: parent.proponentName || v.title,
        projectTitle: v.title,
        remarks: v.remarks || null,
        permit: {
          type: v.permitType,
          number: parent.permit?.number || null,
          processSource: parent.permit?.processSource || null,
          dateApproved: v.dateApproved ? v.dateApproved.format("YYYY-MM-DD") : null,
        },
        project: { type: parent.project?.type || null },
        // The server files the attachment where the record is; this only
        // satisfies the form's shape.
        location: { province, provinceLabel: PROVINCE_LABEL[province] || null },
        document: { fileName: scan.name, targetPath: targetPath || null },
      },
    });
  };

  const step = TAB_KEYS.indexOf(tab);
  const tabLabel = (key, text) => (
    <Badge dot={errorTabs.includes(key)} offset={[6, 0]}>
      <span>{text}</span>
    </Badge>
  );

  const tabs = [
    {
      key: "attachment",
      label: tabLabel("attachment", "Attachment"),
      forceRender: true,
      children: (
        <div className="unit-upload-grid">
          <Form.Item name="title" label="Title" rules={[{ required: true, message: "Give the attachment a title." }]} style={{ gridColumn: "1 / -1" }}>
            <Input placeholder="What the document is — e.g. the amended ECC, a certified true copy" />
          </Form.Item>
          <Form.Item name="permitType" label="Kind of document" rules={[{ required: true, message: "Choose the kind of document." }]}>
            <Select placeholder="Select the kind of document" options={PERMIT_OPTIONS} />
          </Form.Item>
          <Form.Item name="dateApproved" label="Date of the document">
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="remarks" label="Remarks" style={{ gridColumn: "1 / -1" }}>
            <Input.TextArea placeholder="Anything the next person should know" rows={3} />
          </Form.Item>
        </div>
      ),
    },
    {
      key: "document",
      label: tabLabel("document", "Document"),
      forceRender: true,
      children: (
        <div style={{ paddingTop: 8 }}>
          <Form.Item
            label="Scanned document"
            required
            validateStatus={missing && !scan ? "error" : undefined}
            help={missing && !scan ? "Choose the scan to file." : undefined}
            extra={!(missing && !scan) ? "Filed beside the record’s own scan, as the desktop system did, unless you choose another folder below." : undefined}
          >
            <Upload.Dragger
              multiple
              maxCount={20}
              accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff,.doc,.docx,.xls,.xlsx"
              beforeUpload={(file) => {
                setScans((list) => (list.some((f) => f.name === file.name && f.size === file.size) ? list : [...list, file].slice(0, 20)));
                setMissing(false);
                setErrorTabs((t) => t.filter((k) => k !== "document"));
                return false;
              }}
              onRemove={(file) => setScans((list) => list.filter((f) => f.uid !== file.uid))}
              fileList={scans}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">Click or drag the scan here</p>
              <p className="ant-upload-hint">PDF or image. Choose several to file them together — each becomes an attachment of its own (up to 20).</p>
            </Upload.Dragger>
          </Form.Item>
          <Form.Item
            label="Folder on the Records share"
            extra="Open the folders and press File here — or make a new folder inside one, or remove one made by mistake — as in the desktop ERMS. Left alone, the scan files beside the record’s own."
          >
            <NasFolderBrowser
              unit="records"
              province={province}
              date={parent?.permit?.dateApproved ? String(parent.permit.dateApproved).slice(0, 10) : undefined}
              value={targetPath}
              onChange={setTargetPath}
              standardHint="beside the record’s own scan"
            />
          </Form.Item>
        </div>
      ),
    },
  ];

  return (
    <Modal
      open={open}
      title={
        <Space wrap>
          <span style={{ color: theme.accent }}>{theme.icon}</span>
          {`Add attachment — ${theme.label}`}
          <Tag color={theme.color} style={{ fontFamily: "monospace" }}>
            {parent?.serialNo} Att-…
          </Tag>
        </Space>
      }
      onCancel={close}
      // Step through the tabs, or file from either — as Upload record does.
      footer={
        <UploadFooter percent={progress}>
        <Space wrap>
          <Button onClick={close}>Cancel</Button>
          <Button disabled={step <= 0} onClick={() => setTab(TAB_KEYS[step - 1])}>Back</Button>
          {step < TAB_KEYS.length - 1 && <Button onClick={() => setTab(TAB_KEYS[step + 1])}>Next</Button>}
          <Button type="primary" loading={save.isPending} disabled={!province} onClick={submit}>
            {scans.length > 1 ? `Upload ${scans.length} attachments` : "Upload attachment"}
          </Button>
        </Space>
        </UploadFooter>
      }
      width="min(1040px, 96vw)"
      style={{ top: 32 }}
      destroyOnHidden
    >
      {!province && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="This record has no province, so nothing can be filed against it. Set its province first." />}
      <Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
        Filed under the record&rsquo;s proponent and permit number{parent?.permit?.number ? ` (${parent.permit.number})` : ""}, and numbered after it when saved.
      </Text>
      <Form key={parent?.serialNo || "none"} form={form} layout="vertical" preserve={false} initialValues={initialValues}>
        <UnitTabs unit="records" activeKey={tab} onChange={setTab} items={tabs} />
      </Form>
    </Modal>
  );
};

export default AttachmentModal;
