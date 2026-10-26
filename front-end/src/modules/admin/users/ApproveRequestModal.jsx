import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Checkbox, Descriptions, Form, Input, Modal, Radio, Select, Space, Tag, Typography } from "antd";
import { CheckOutlined, CopyOutlined } from "@ant-design/icons";
import axios from "axios";
import { API_BASE_URL } from "../../../config/api";
import { fetchAllYears } from "../../../api/yearService";
import { message } from "../../../shared/feedback";

const { Text, Paragraph } = Typography;

// ---------------------------------------------------------------------------
// The Developer's decision on an account request.
//
// Approve: choose the system (UCDS or ERMS) and what goes with it — the type
// and year containers for UCDS, the unit for ERMS — and the provinces. The
// server makes the account with a generated password and emails the person
// their sign-in details (mailTemplates.accountApproved). Only when that email
// could not be sent is the password shown here, to pass on by hand.
//
// Decline: a reason, which the person is emailed (registrationRejected).
// ---------------------------------------------------------------------------

const PROVINCES = [
  { value: "aurora", label: "Aurora" },
  { value: "bataan", label: "Bataan" },
  { value: "bulacan", label: "Bulacan" },
  { value: "nuevaEcija", label: "Nueva Ecija" },
  { value: "pampanga", label: "Pampanga" },
  { value: "tarlac", label: "Tarlac" },
  { value: "zambales", label: "Zambales" },
];
const ALL_PROVINCES = PROVINCES.map((p) => p.value);
const UNITS = [
  { value: "records", label: "Records Unit" },
  { value: "legal", label: "Legal Services Unit" },
  { value: "laboratory", label: "Laboratory Unit" },
];
const UCDS_TYPES = [
  { value: "planning", label: "Planning Admin", hint: "Edits the register, reads its history; storage containers designated later." },
  { value: "viewer", label: "Encoder", hint: "Encodes within the year containers and provinces given. No storage." },
];

const api = axios.create({ baseURL: API_BASE_URL, withCredentials: true });
const errorOf = (e, fallback) => e?.response?.data?.error || e?.response?.data?.message || fallback;

export const ApproveRequestModal = ({ request, open, onClose }) => {
  const [form] = Form.useForm();
  const [years, setYears] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null); // the server's answer, once the account exists

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDone(null);
    fetchAllYears()
      .then((list) => setYears((list || []).filter((y) => y.hidden !== true).map((y) => y.year).sort((a, b) => b - a)))
      .catch(() => setYears([]));
  }, [open]);

  // The form starts from what the person asked for.
  useEffect(() => {
    if (!open || !request) return;
    const system = request.system === "ucds" ? "ucds" : request.system === "erms" ? "erms" : undefined;
    form.setFieldsValue({
      name: request.name,
      email: request.email,
      division: request.division,
      designation: request.position,
      username: request.suggestedUsername || "",
      system,
      ermsUnit: request.ermsUnit || undefined,
      ucdsType: "viewer",
      assignedYears: [],
      // The Records Unit files for the whole region; the other units and UCDS start empty.
      provinces: system === "erms" ? ALL_PROVINCES : [],
    });
  }, [open, request, form]);

  useEffect(() => {
    if (open && years.length && !form.getFieldValue("assignedYears")?.length) {
      const thisYear = new Date().getFullYear();
      form.setFieldsValue({ assignedYears: years.includes(thisYear) ? [thisYear] : [years[0]] });
    }
  }, [open, years, form]);

  const submit = async () => {
    const v = await form.validateFields();
    const permission = v.system === "erms" ? "records" : v.system === "developer" ? "developer" : v.ucdsType;
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.post(`/api/sign-up/${request._id}/approve`, {
        name: v.name,
        email: v.email,
        division: v.division,
        designation: v.designation,
        username: v.username.trim(),
        permission,
        ermsUnit: permission === "records" ? v.ermsUnit : undefined,
        assignedYears: permission === "records" ? [] : v.assignedYears || [],
        provinces: v.provinces || [],
      });
      setDone(data);
      if (data.emailSent) message.success(`Account ${data.user.username} created; the sign-in details were emailed to ${data.user.email}.`);
    } catch (e) {
      setError(errorOf(e, "The account could not be created."));
    } finally {
      setSaving(false);
    }
  };

  const close = () => onClose(Boolean(done));

  if (!request) return null;

  return (
    <Modal
      open={open}
      onCancel={close}
      width={720}
      title={done ? "Account created" : `Approve ${request.name}`}
      destroyOnHidden
      footer={
        done
          ? [<Button key="ok" type="primary" onClick={close}>Done</Button>]
          : [
              <Button key="cancel" onClick={close}>Cancel</Button>,
              <Button key="approve" type="primary" icon={<CheckOutlined />} loading={saving} onClick={submit}>
                Approve and create account
              </Button>,
            ]
      }
    >
      {done ? (
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <Alert
            type={done.emailSent ? "success" : "warning"}
            showIcon
            message={done.emailSent ? `The sign-in details were emailed to ${done.user.email}.` : "The account exists, but the email could not be sent."}
            description={
              done.emailSent
                ? "They sign in with the username or this email address, and choose their own password with “Forgot your password?”."
                : "Pass these details on in person. The password is shown only now."
            }
          />
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="Name">{done.user.name}</Descriptions.Item>
            <Descriptions.Item label="Username"><Text code copyable>{done.user.username}</Text></Descriptions.Item>
            {done.temporaryPassword && (
              <Descriptions.Item label="Temporary password">
                <Text code copyable={{ icon: <CopyOutlined /> }}>{done.temporaryPassword}</Text>
              </Descriptions.Item>
            )}
          </Descriptions>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            Storage containers and capabilities can be adjusted any time from the account’s <strong>Edit Access</strong>.
          </Paragraph>
        </Space>
      ) : (
        <Form form={form} layout="vertical" requiredMark={false}>
          {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}
          <Paragraph type="secondary" style={{ marginTop: 0 }}>
            Requested <Text strong>{request.accessLabel || "—"}</Text>
            {request.requestedAt ? ` on ${new Date(request.requestedAt).toLocaleString()}` : ""}.
          </Paragraph>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0 16px" }}>
            <Form.Item name="name" label="Full name" rules={[{ required: true, whitespace: true, message: "The name is required." }]}>
              <Input />
            </Form.Item>
            <Form.Item name="email" label="Email" rules={[{ required: true, type: "email", message: "Enter a valid email address." }]}>
              <Input />
            </Form.Item>
            <Form.Item name="division" label="Division / Section">
              <Input />
            </Form.Item>
            <Form.Item name="designation" label="Position">
              <Input />
            </Form.Item>
            <Form.Item
              name="username"
              label="Username"
              extra="Suggested from the name; checked for clashes when you approve."
              rules={[
                { required: true, message: "Choose a username." },
                { pattern: /^[a-z0-9][a-z0-9._-]{2,39}$/i, message: "3–40 letters, digits, dots, dashes or underscores." },
              ]}
            >
              <Input autoComplete="off" />
            </Form.Item>
          </div>

          <Form.Item name="system" label="System" rules={[{ required: true, message: "Choose the system." }]}>
            <Radio.Group
              optionType="button"
              buttonStyle="solid"
              options={[
                { value: "ucds", label: "UCDS — Planning" },
                { value: "erms", label: "ERMS — Records" },
                { value: "developer", label: "Developer" },
              ]}
              onChange={(e) => form.setFieldsValue({ provinces: e.target.value === "erms" ? ALL_PROVINCES : form.getFieldValue("provinces") })}
            />
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(a, b) => a.system !== b.system || a.ucdsType !== b.ucdsType}>
            {({ getFieldValue }) => {
              const system = getFieldValue("system");
              if (system === "developer") {
                return <Alert type="warning" showIcon style={{ marginBottom: 16 }} message="A Developer holds everything: both systems, administration, the NAS and every storage container — and approves accounts." />;
              }
              if (system === "erms") {
                return (
                  <Form.Item name="ermsUnit" label="ERMS unit" extra="The person sees that unit's documents and files into its storage container." rules={[{ required: true, message: "Choose the unit." }]}>
                    <Select options={UNITS} placeholder="Choose the unit" style={{ maxWidth: 320 }} />
                  </Form.Item>
                );
              }
              if (system === "ucds") {
                const type = UCDS_TYPES.find((t) => t.value === getFieldValue("ucdsType"));
                return (
                  <>
                    <Form.Item name="ucdsType" label="Account type" extra={type?.hint}>
                      <Radio.Group options={UCDS_TYPES.map((t) => ({ value: t.value, label: t.label }))} />
                    </Form.Item>
                    <Form.Item name="assignedYears" label="Year containers" rules={[{ required: true, type: "array", min: 1, message: "Choose at least one year." }]}>
                      <Select mode="multiple" placeholder="Years" options={years.map((y) => ({ value: y, label: String(y) }))} style={{ maxWidth: 420 }} />
                    </Form.Item>
                  </>
                );
              }
              return null;
            }}
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(a, b) => a.system !== b.system}>
            {({ getFieldValue }) =>
              getFieldValue("system") && getFieldValue("system") !== "developer" ? (
                <Form.Item
                  name="provinces"
                  label={
                    <Space size={8}>
                      <span>Provinces (read and write)</span>
                      <Button size="small" type="link" style={{ padding: 0 }} onClick={() => form.setFieldsValue({ provinces: ALL_PROVINCES })}>all</Button>
                      <Button size="small" type="link" style={{ padding: 0 }} onClick={() => form.setFieldsValue({ provinces: [] })}>none</Button>
                    </Space>
                  }
                  rules={[{ required: true, type: "array", min: 1, message: "Choose at least one province." }]}
                >
                  <Checkbox.Group options={PROVINCES} />
                </Form.Item>
              ) : null
            }
          </Form.Item>
        </Form>
      )}
    </Modal>
  );
};

export const RejectRequestModal = ({ request, open, onClose }) => {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (open) {
      setReason("");
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.post(`/api/sign-up/${request._id}/reject`, { reason });
      message[data.emailSent ? "success" : "warning"](
        data.emailSent ? `Declined; ${request.email} has been told.` : `Declined, but the email to ${request.email} could not be sent.`
      );
      onClose(true);
    } catch (e) {
      setError(errorOf(e, "The request could not be declined."));
    } finally {
      setSaving(false);
    }
  };

  const preview = useMemo(() => (reason.trim() ? reason.trim() : null), [reason]);
  if (!request) return null;
  return (
    <Modal
      open={open}
      onCancel={() => onClose(false)}
      title={`Decline ${request.name}'s request`}
      okText="Decline and notify"
      okButtonProps={{ danger: true, loading: saving }}
      onOk={submit}
      destroyOnHidden
    >
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        {error && <Alert type="error" showIcon message={error} />}
        <Text>
          <Tag>{request.email}</Tag> is emailed that the request was not approved{preview ? ", with this reason:" : "."}
        </Text>
        <Input.TextArea rows={3} maxLength={500} showCount placeholder="Reason (optional), e.g. not EMB Region III personnel" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Space>
    </Modal>
  );
};
