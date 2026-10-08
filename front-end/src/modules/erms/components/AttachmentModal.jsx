import { useEffect, useMemo, useState } from "react";
import { Alert, Checkbox, DatePicker, Form, Input, Modal, Select, Space, Tag, Typography, Upload } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { message } from "../../../shared/feedback";
import { PERMIT_OPTIONS, PROVINCE_LABEL, describeApiError, uploadRecord } from "../api/ermsService";
import FolderPicker from "./FolderPicker";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// Add an attachment to a record — the desktop system's "Add Attachment".
//
// An amendment, a certified copy, a letter: a second document filed against
// a record that is already on file. It carries the record's proponent,
// permit number and place, is numbered after it (FSN-0000206 Att-00012),
// and its scan is filed beside the record's own unless another folder is
// chosen.
// ---------------------------------------------------------------------------

const AttachmentModal = ({ open, parent, onClose }) => {
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [scan, setScan] = useState(null);
  const [missing, setMissing] = useState(false);
  const [elsewhere, setElsewhere] = useState(false);
  const [folder, setFolder] = useState(null);
  const [subfolder, setSubfolder] = useState(null);
  const province = parent?.location?.province;

  useEffect(() => {
    if (!open || !parent) return;
    setScan(null);
    setMissing(false);
    setElsewhere(false);
    setFolder(null);
    setSubfolder(null);
  }, [open, parent]);

  // The starting values, given to the form when it is built (an effect that
  // filled them raced the dialog and could leave the form empty).
  const initialValues = useMemo(
    () => (parent ? { permitType: parent.permit?.type === "ecc-original" ? "ecc-amended" : parent.permit?.type || "other", title: parent.projectTitle, dateApproved: null, remarks: "" } : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parent?.serialNo]
  );

  const save = useMutation({
    mutationFn: ({ payload }) => uploadRecord({ payload, file: scan }),
    onSuccess: (saved) => {
      message.success(`Filed ${saved.serialNo}.`);
      queryClient.invalidateQueries({ queryKey: ["erms"] });
      onClose(saved);
    },
    onError: (e) => message.error(describeApiError(e, "The attachment could not be filed.")),
  });

  const submit = async () => {
    const v = await form.validateFields();
    if (!scan) {
      setMissing(true);
      return;
    }
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
        document: { fileName: scan.name, folder: elsewhere ? folder : null, subfolder: elsewhere ? subfolder : null },
      },
    });
  };

  return (
    <Modal
      open={open}
      title={
        <Space>
          Add an attachment to
          <Tag style={{ fontFamily: "monospace" }}>{parent?.serialNo}</Tag>
        </Space>
      }
      okText="File attachment"
      onOk={submit}
      okButtonProps={{ disabled: !province }}
      confirmLoading={save.isPending}
      onCancel={() => onClose(null)}
      width={720}
      destroyOnHidden
    >
      {!province && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="This record has no province, so nothing can be filed against it. Set its province first." />}
      <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
        Filed under the record&rsquo;s proponent and permit number{parent?.permit?.number ? ` (${parent.permit.number})` : ""}, and numbered after it.
      </Text>
      <Form key={parent?.serialNo || "none"} form={form} layout="vertical" preserve={false} initialValues={initialValues}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "0 16px" }}>
          <Form.Item name="title" label="Title" rules={[{ required: true, message: "Give the attachment a title." }]} style={{ gridColumn: "1 / -1" }}>
            <Input placeholder="What the document is — e.g. the amended ECC, a certified true copy" />
          </Form.Item>
          <Form.Item name="permitType" label="Kind of document" rules={[{ required: true }]}>
            <Select placeholder="Select the kind of document" options={PERMIT_OPTIONS} />
          </Form.Item>
          <Form.Item name="dateApproved" label="Date of the document">
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="remarks" label="Remarks" style={{ gridColumn: "1 / -1" }}>
            <Input.TextArea placeholder="Optional note" rows={2} />
          </Form.Item>
        </div>
        <Form.Item label="Scanned document" required validateStatus={missing && !scan ? "error" : undefined} help={missing && !scan ? "Choose the scan to file." : undefined}>
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
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">Click or drag the scan here</p>
            <p className="ant-upload-hint">Filed in the same folder as the record&rsquo;s own scan.</p>
          </Upload.Dragger>
        </Form.Item>
        <Checkbox checked={elsewhere} onChange={(e) => setElsewhere(e.target.checked)} style={{ marginBottom: elsewhere ? 8 : 0 }}>
          File it in a different folder
        </Checkbox>
        {elsewhere && (
          <FolderPicker
            unit="records"
            province={province}
            date={parent?.permit?.dateApproved ? String(parent.permit.dateApproved).slice(0, 10) : undefined}
            hint={parent?.projectTitle}
            typeFolder={null}
            value={folder}
            onChange={setFolder}
            subfolder={subfolder}
            onSubfolderChange={setSubfolder}
          />
        )}
      </Form>
    </Modal>
  );
};

export default AttachmentModal;
