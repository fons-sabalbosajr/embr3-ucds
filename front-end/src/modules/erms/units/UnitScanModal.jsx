import { useEffect, useState } from "react";
import { Alert, Form, Modal, Radio, Space, Upload } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { message } from "../../../shared/feedback";
import { attachUnitFile, describeApiError } from "../api/ermsService";
import FolderPicker from "../components/FolderPicker";
import { unitTheme } from "./unitTheme";

// ---------------------------------------------------------------------------
// File a scan against a Legal or Laboratory document already on file — one
// the desktop system kept without a scan, or one whose scan is replaced
// ("Replace the File to …" in the desktop log). Filed where a new upload of
// the same document would be, unless a folder is chosen; a scan already on
// the share is kept or deleted as the clerk says, never silently replaced.
// ---------------------------------------------------------------------------

const UnitScanModal = ({ unit, unitConfig, document, open, onClose }) => {
  const queryClient = useQueryClient();
  const theme = unitTheme(unit);
  const [scan, setScan] = useState(null);
  const [oldFile, setOldFile] = useState("keep");
  const [folder, setFolder] = useState(null);
  const [subfolder, setSubfolder] = useState(null);
  const [missing, setMissing] = useState(false);
  const hasFile = Boolean(document?.document?.fileName);
  const docType = unitConfig?.docTypes.find((t) => t.code === document?.docType);
  const folderField = unitConfig?.folder?.folderField;
  const yearField = unitConfig?.folder?.yearField;
  const yearValue = yearField ? document?.fields?.[yearField] : null;

  useEffect(() => {
    if (!open) return;
    setScan(null);
    setOldFile("keep");
    setFolder(null);
    setSubfolder(null);
    setMissing(false);
  }, [open]);

  const save = useMutation({
    mutationFn: () => attachUnitFile({ unit, serialNo: document.serialNo, file: scan, replace: hasFile ? oldFile : undefined, folder, subfolder }),
    onSuccess: (result) => {
      message.success(hasFile ? `Re-uploaded the scan of ${document.serialNo}.` : `Filed the scan of ${document.serialNo}.`);
      const prev = result.previous;
      if (prev?.deleted) message.info(`The previous file “${prev.fileName}” was deleted from the share.`);
      else if (prev?.reason === "kept") message.info(`The previous file “${prev.fileName}” was kept on the share.`);
      else if (prev) message.warning(`The previous file “${prev.fileName}” could not be deleted (${prev.reason}); it is still on the share.`);
      queryClient.invalidateQueries({ queryKey: ["erms", "unit", unit] });
      onClose(result.document);
    },
    onError: (e) => message.error(describeApiError(e, "The scan could not be filed.")),
  });

  const submit = () => {
    if (!scan) {
      setMissing(true);
      return;
    }
    save.mutate();
  };

  return (
    <Modal
      open={open}
      title={
        <Space>
          <span style={{ color: theme.accent }}>{theme.icon}</span>
          {hasFile ? `Replace the scan of ${document?.serialNo}` : `File the scan of ${document?.serialNo}`}
        </Space>
      }
      onCancel={() => onClose(null)}
      onOk={submit}
      okText={hasFile ? "Re-upload" : "File scan"}
      confirmLoading={save.isPending}
      width={720}
      destroyOnHidden
    >
      <Form layout="vertical">
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
            <p className="ant-upload-drag-icon"><InboxOutlined style={{ color: theme.accent }} /></p>
            <p className="ant-upload-text">Click or drag the scan here</p>
            <p className="ant-upload-hint">
              Filed on the {theme.short} share under the province, year and {unit === "legal" ? "company" : "station"}
              {docType?.folder ? `, in the ${docType.folder} folder` : ""}.
            </p>
          </Upload.Dragger>
        </Form.Item>

        {hasFile && (
          <Form.Item label="The current file on the share">
            <Radio.Group value={oldFile} onChange={(e) => setOldFile(e.target.value)}>
              <Space direction="vertical">
                <Radio value="keep">Keep it on the share (the document points at the new file; the old one stays where it is)</Radio>
                <Radio value="delete">Delete it from the share after the new file is written</Radio>
              </Space>
            </Radio.Group>
            {oldFile === "delete" && (
              <Alert type="warning" showIcon style={{ marginTop: 8 }} message={`“${document.document.fileName}” will be removed from the share. This cannot be undone from the application.`} />
            )}
          </Form.Item>
        )}

        <Form.Item label="Location on the share" extra="Choose or make the folders, or leave them to the layout.">
          <FolderPicker
            unit={unit}
            province={document?.province}
            date={yearValue ? String(yearValue).slice(0, 10) : undefined}
            hint={folderField ? document?.fields?.[folderField] || undefined : undefined}
            typeFolder={docType?.folder || null}
            value={folder}
            onChange={setFolder}
            subfolder={subfolder}
            onSubfolderChange={setSubfolder}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default UnitScanModal;
