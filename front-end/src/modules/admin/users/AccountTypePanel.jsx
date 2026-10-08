import React, { useEffect, useState } from "react";
import { Alert, Button, Select, Space, Tag, Typography } from "antd";
import { SaveOutlined } from "@ant-design/icons";
import { message } from "../../../shared/feedback";
import { API_BASE_URL } from "../../../config/api";
import { ACCOUNT_TYPES, LEGACY_TYPES, STORAGE_TYPES, accountType } from "../../../shared/accountTypes";

const { Text, Paragraph } = Typography;

// ---------------------------------------------------------------------------
// The account type and the storage containers shared with it.
//
// Both are the Developer's to set. Anyone else sees them read-only: the type
// decides which modules an account enters, and a container designation is
// how the NAS reaches a Planning or Records admin without a drive letter or
// a credential — so neither is something an account should be able to give
// itself.
// ---------------------------------------------------------------------------

const api = (path, options = {}) =>
  fetch(`${API_BASE_URL}${path}`, { credentials: "include", ...options });

// An ERMS User from before the System field existed is a Records Unit user.
const unitOf = (permission, ermsUnit) => ermsUnit || (String(permission || "").toLowerCase() === "records" ? "records" : null);

const AccountTypePanel = ({ userId, permission, nasContainers, ermsUnit, onChanged }) => {
  const [me, setMe] = useState(null);
  const [containers, setContainers] = useState([]);
  const [unitOptions, setUnitOptions] = useState([]);
  const [type, setType] = useState(String(permission || "viewer").toLowerCase());
  const [grants, setGrants] = useState(Array.isArray(nasContainers) ? nasContainers : []);
  const [unit, setUnit] = useState(unitOf(permission, ermsUnit));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setType(String(permission || "viewer").toLowerCase());
    setGrants(Array.isArray(nasContainers) ? nasContainers : []);
    setUnit(unitOf(permission, ermsUnit));
  }, [permission, nasContainers, ermsUnit, userId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [meRes, listRes, typesRes] = await Promise.all([api("/api/auth/me"), api("/api/storage/containers"), api("/api/users/types")]);
        const meBody = await meRes.json().catch(() => ({}));
        const listBody = await listRes.json().catch(() => ({}));
        const typesBody = await typesRes.json().catch(() => ({}));
        if (cancelled) return;
        setMe(meBody);
        setUnitOptions(Array.isArray(typesBody.ermsUnits) ? typesBody.ermsUnits : []);
        // For a Developer this is every enabled container; for anyone else it
        // is only what they hold, which is all they need to see here.
        setContainers(Array.isArray(listBody.containers) ? listBody.containers : []);
      } catch {
        if (!cancelled) setError("Could not load the account types.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isDeveloper = me?.role === "developer";
  const current = accountType(type);
  const typeIsLegacy = LEGACY_TYPES.some((t) => t.value === type);
  const canHoldStorage = STORAGE_TYPES.has(type) && type !== "developer";
  const typeChanged = type !== String(permission || "viewer").toLowerCase();
  const grantsChanged =
    JSON.stringify([...grants].sort()) !== JSON.stringify([...(Array.isArray(nasContainers) ? nasContainers : [])].sort());
  // The System applies to ERMS Users; for any other type it is cleared.
  const isErmsUser = type === "records";
  const wantedUnit = isErmsUser ? unit || "records" : null;
  const unitChanged = wantedUnit !== unitOf(permission, ermsUnit);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (unitChanged) {
        const res = await api(`/api/users/${encodeURIComponent(userId)}/erms-unit`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ermsUnit: wantedUnit }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(body.error || body.message || "Could not set the ERMS system.");
          return;
        }
      }
      if (typeChanged) {
        const res = await api(`/api/users/${encodeURIComponent(userId)}/type`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ permission: type }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(body.error || body.message || "Could not change the account type.");
          return;
        }
      }
      if (grantsChanged || typeChanged) {
        const res = await api(`/api/nas/access/${encodeURIComponent(userId)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nasContainers: canHoldStorage ? grants : [] }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(body.error || body.message || "Could not update the storage containers.");
          return;
        }
      }
      message.success("Account type and storage access saved. It applies on their next request; a type change applies at their next sign-in.");
      onChanged?.({ permission: type, nasContainers: canHoldStorage ? grants : [], ermsUnit: wantedUnit });
    } finally {
      setSaving(false);
    }
  };

  const options = [...ACCOUNT_TYPES, ...(typeIsLegacy ? LEGACY_TYPES : [])].map((t) => ({
    value: t.value,
    label: (
      <Space size={6}>
        <Tag color={t.color} style={{ marginRight: 0 }}>{t.label}</Tag>
      </Space>
    ),
  }));

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      {error && <Alert type="error" showIcon message={error} closable onClose={() => setError(null)} />}

      {!isDeveloper && me && (
        <Alert
          type="info"
          showIcon
          message="Only the Developer can change an account's type or share storage with it."
        />
      )}

      <div>
        <Text strong>Account type</Text>
        <div style={{ marginTop: 6 }}>
          <Select placeholder="Select the account type"
            value={type}
            onChange={setType}
            disabled={!isDeveloper}
            options={options}
            style={{ width: 260 }}
          />
        </div>
        <Paragraph type="secondary" style={{ marginTop: 6, marginBottom: 0 }}>
          {current.description}
        </Paragraph>
        {typeIsLegacy && (
          <Paragraph type="warning" style={{ marginTop: 6, marginBottom: 0 }}>
            This account holds the legacy Administrator type. Reassign it to one of the four types.
          </Paragraph>
        )}
      </div>

      {isErmsUser && (
        <div>
          <Text strong>System</Text>
          <div style={{ marginTop: 6 }}>
            <Select placeholder="Select the system"
              value={unit || "records"}
              onChange={setUnit}
              disabled={!isDeveloper}
              options={(unitOptions.length ? unitOptions : [{ value: "records", label: "Records Unit" }, { value: "legal", label: "Legal Services Unit" }, { value: "laboratory", label: "Laboratory Unit" }]).map((u) => ({ value: u.value, label: u.label }))}
              style={{ width: 260 }}
            />
          </div>
          <Paragraph type="secondary" style={{ marginTop: 6, marginBottom: 0 }}>
            The desktop ERMS was three subsystems — Records, Legal Services, Laboratory — each with its
            own documents and its own share. An ERMS User belongs to one of them: they see that unit's
            documents, file into that unit's container, and never choose a year container.
          </Paragraph>
        </div>
      )}

      <div>
        <Text strong>Storage containers shared with this account</Text>
        <div style={{ marginTop: 6 }}>
          {type === "developer" ? (
            <Text type="secondary">A Developer opens every container; nothing to designate.</Text>
          ) : !canHoldStorage ? (
            <Text type="secondary">An Encoder works in UCDS only and has no storage access.</Text>
          ) : (
            <Select
              mode="multiple"
              value={grants.filter((k) => containers.some((c) => c.key === k))}
              onChange={setGrants}
              disabled={!isDeveloper}
              placeholder={containers.length ? "Choose containers" : "No containers are switched on"}
              options={containers.map((c) => ({ value: c.key, label: c.label }))}
              style={{ width: "100%", maxWidth: 480 }}
            />
          )}
        </div>
        {canHoldStorage && (
          <Paragraph type="secondary" style={{ marginTop: 6, marginBottom: 0 }}>
            The person opens these under <strong>Storage</strong> in the sidebar, while document
            access is switched on. They never see a share path or a credential; the server
            reads the files on their behalf and every read is audited.
          </Paragraph>
        )}
      </div>

      {isDeveloper && (
        <Button
          type="primary"
          icon={<SaveOutlined />}
          loading={saving}
          disabled={!typeChanged && !grantsChanged && !unitChanged}
          onClick={save}
        >
          Save type, system and storage access
        </Button>
      )}
    </Space>
  );
};

export default AccountTypePanel;
