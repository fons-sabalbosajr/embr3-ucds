import { useEffect, useState } from "react";
import { App as AntdApp, DatePicker, Form, Input, Modal, Select, Typography } from "antd";
import RegisterLookup from "./RegisterLookup";
import dayjs from "dayjs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  PROVINCE_LABEL,
  createRecord,
  describeApiError,
  updateRecord,
} from "../api/ermsService";

// Create and edit share one form: the fields are identical and only the
// submitted verb differs.

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

  useEffect(() => {
    if (!open) return;
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
    mutationFn: createRecord,
    onSuccess: settle("Created"),
    onError: (e) => message.error(describeApiError(e, "Could not create the record.")),
  });

  const updateMutation = useMutation({
    mutationFn: updateRecord,
    onSuccess: settle("Updated"),
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
      document: { fileName: v.fileName || null },
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

  return (
    <Modal
      title={isEdit ? `Edit ${record.serialNo}` : "New record"}
      open={open}
      onCancel={() => {
        form.resetFields();
        onClose(null);
      }}
      onOk={submit}
      okText={isEdit ? "Save" : "Create record"}
      confirmLoading={createMutation.isPending || updateMutation.isPending}
      width={720}
      destroyOnClose
    >
      {!isEdit && (
        <Typography.Paragraph type="secondary">
          The serial number is assigned when the record is saved, continuing the
          existing FSN sequence.
        </Typography.Paragraph>
      )}
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item
          name="proponentName"
          label="Proponent"
          rules={[{ required: true, message: "Enter the proponent." }]}
        >
          <Input placeholder="Name of the proponent" />
        </Form.Item>
        <Form.Item
          name="projectTitle"
          label="Project title"
          rules={[{ required: true, message: "Enter the project title." }]}
        >
          <Input placeholder="Title of the project" />
        </Form.Item>

        <Form.Item
          name="permitType"
          label="Permit type"
          rules={[{ required: true }]}
        >
          <Select options={PERMIT_OPTIONS} />
        </Form.Item>
        <Form.Item
          name="permitNumber"
          label="Permit number"
          extra="Used to link this record to an establishment in the UCDS register."
          style={{ marginBottom: 8 }}
        >
          <Input
            placeholder="ECC-OL-R03-2019-0573"
            onChange={(e) => setPermitNumber(e.target.value)}
          />
        </Form.Item>
        <RegisterLookup permitNumber={permitNumber} />
        <Form.Item name="processSource" label="Process">
          <Select
            allowClear
            options={[
              { value: "Manual Process", label: "Manual Process" },
              { value: "Online Process", label: "Online Process" },
            ]}
          />
        </Form.Item>
        <Form.Item name="dateApproved" label="Date approved">
          <DatePicker style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item name="dateAmended" label="Date amended">
          <DatePicker style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item name="projectType" label="Project type">
          <Input placeholder="e.g. Mining and Quarrying Projects" />
        </Form.Item>

        <Form.Item
          name="province"
          label="Province"
          rules={[{ required: true, message: "Select a province." }]}
          extra={
            writableProvinces
              ? "Only provinces your account may modify are listed."
              : undefined
          }
        >
          <Select options={provinceOptions} />
        </Form.Item>
        <Form.Item name="city" label="City / Municipality">
          <Input />
        </Form.Item>
        <Form.Item name="barangay" label="Barangay">
          <Input />
        </Form.Item>
        <Form.Item name="street" label="Street">
          <Input />
        </Form.Item>
        <Form.Item name="fileName" label="Document file name">
          <Input placeholder="Scan file name as stored on the records share" />
        </Form.Item>
        <Form.Item name="remarks" label="Remarks">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default RecordFormModal;
