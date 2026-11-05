import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Checkbox, ConfigProvider, Radio, Tabs, Tag, Tooltip, Typography, theme as antdTheme } from "antd";
import { message } from "../../../shared/feedback";
import {
  ApartmentOutlined,
  AppstoreOutlined,
  CalendarOutlined,
  CheckCircleFilled,
  CloudServerOutlined,
  CodeOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  EditOutlined,
  EnvironmentOutlined,
  ExperimentOutlined,
  ExportOutlined,
  EyeOutlined,
  FileProtectOutlined,
  FileSearchOutlined,
  FolderOpenOutlined,
  FormOutlined,
  HistoryOutlined,
  IdcardOutlined,
  InfoCircleOutlined,
  LockOutlined,
  LoginOutlined,
  MinusCircleOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  SettingOutlined,
  ToolOutlined,
  UserOutlined,
} from "@ant-design/icons";
import axios from "axios";
import AvatarWithName from "../../../components/AvatarwithName";
import useScreen from "../../../shared/useScreen";
import { ACCOUNT_TYPES, LEGACY_TYPES, STORAGE_TYPES, accountType, holdsCapability } from "../../../shared/accountTypes";
import { modulesOf, automaticAccess, CAN_ENTER_MODULES } from "./accessOf";
import "./accountpermission.css";
import { API_BASE_URL } from "../../../config/api";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// Manage access: everything that decides what an account reaches, on one form
// with one Save.
//
//   Type & modules   the account type, its ERMS unit, the modules it enters
//   Years            which year containers it may open
//   Provinces        view, or read and write, per province of the register
//   Actions          the named capabilities the server enforces
//   Storage          the NAS containers designated to it
//   Automatic        what follows from all of the above, shown so nobody has to
//                    work it out: not set here, and not a promise beyond it
//
// The server is the authority on all of it: this dialog edits and explains.
// Type, unit, modules and storage are the Developer's; the rest, an
// administrator's too.
// ---------------------------------------------------------------------------

const TYPE_ICON = { developer: <CodeOutlined />, planning: <ApartmentOutlined />, records: <FolderOpenOutlined />, viewer: <FormOutlined />, admin: <SafetyCertificateOutlined /> };

const UNITS = [
  { value: "records", label: "Records Unit", icon: <FileProtectOutlined /> },
  { value: "legal", label: "Legal Services Unit", icon: <SafetyCertificateOutlined /> },
  { value: "laboratory", label: "Laboratory Unit", icon: <ExperimentOutlined /> },
];

const MODULES = [
  { value: "ucds", label: "Universe Central DB", description: "The register by year: the Monitoring Plan and the year's datasets.", icon: <DatabaseOutlined /> },
  { value: "erms", label: "ERMS", description: "The Document Library, filing, document requests and archive boxes.", icon: <FolderOpenOutlined /> },
  { value: "admin", label: "Administration", description: "Admin Settings. Comes with the Developer type; not given separately.", icon: <SettingOutlined />, typeOnly: true },
];

const CAPABILITIES = [
  { key: "canManageData", name: "Manage data", description: "Add, edit and delete rows in the Monitoring Plan and every imported dataset of the years assigned, within the provinces it may write.", icon: <EditOutlined /> },
  { key: "canGenerateData", name: "Generate reports", description: "Produce ICIR and other reports from register records. The PDFs are filed in the Records container.", icon: <ExportOutlined /> },
  { key: "canViewDataHistory", name: "Data history", description: "See the history of changes behind a record, and who else is viewing a province right now.", icon: <HistoryOutlined /> },
  { key: "canAccessRangePicker", name: "Date range filter", description: "Filter the dashboard and register by a date range instead of the current year only.", icon: <SearchOutlined /> },
  { key: "canRemoveMenuItems", name: "Remove year menu tables", description: "Remove folders and tables from a year container's menu, whoever made them. Without it, a person removes only their own.", icon: <DeleteOutlined /> },
  { key: "canViewAdminPanel", name: "Admin panel", description: "Show the Admin Settings menu. Only a type that includes Administration can open it; for others this does nothing.", icon: <SettingOutlined /> },
];

const PROVINCES = [
  { key: "aurora", name: "Aurora" },
  { key: "bataan", name: "Bataan" },
  { key: "bulacan", name: "Bulacan" },
  { key: "nuevaEcija", name: "Nueva Ecija" },
  { key: "pampanga", name: "Pampanga" },
  { key: "tarlac", name: "Tarlac" },
  { key: "zambales", name: "Zambales" },
];

const PROVINCE_LEVEL = { none: "No access", view: "View only", readWrite: "Can edit" };

const AUTOMATIC_ICON = { sign: <LoginOutlined />, documents: <FileSearchOutlined />, desk: <AppstoreOutlined />, ai: <RobotOutlined />, figures: <DatabaseOutlined /> };

const sorted = (list) => [...list].sort();
const sameList = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

// The checkboxes and radio buttons a little larger than the default: on a form
// that is mostly these, they are what the eye and the mouse go to.
const CONTROL_SIZES = { components: { Checkbox: { controlInteractiveSize: 18 }, Radio: { radioSize: 18, dotSize: 8 } } };

/**
 * One choice. The whole row is the control's own label, so a click anywhere on
 * it counts once, and a screen reader reads the name with the box. `on` marks
 * the row chosen, `note` says why a box cannot be changed, `tags` go by the name.
 */
function AccessOption({ as: Control = Checkbox, on, icon, name, description, note, tags, compact, ...control }) {
  const className = ["access-option", on && "access-option-on", compact && "access-option-compact"].filter(Boolean).join(" ");
  return (
    <Control {...control} className={className}>
      <span className="access-option-icon" aria-hidden="true">{icon}</span>
      <span className="access-option-text">
        <span className="access-option-name">
          {name}
          {tags}
          {note && (
            <span className="access-option-note">
              <LockOutlined aria-hidden="true" /> {note}
            </span>
          )}
        </span>
        {description && <span className="access-option-description">{description}</span>}
      </span>
    </Control>
  );
}

/** "2 of 4", at the end of a section's heading. */
const HeldCount = ({ held, of }) => <span className="access-count">{held} of {of}</span>;

const AccountPermission = ({ onClose, onPermissionsUpdate, userData }) => {
  const { token } = antdTheme.useToken();
  const { phone } = useScreen();
  // The theme's colours, light or dark, for accountpermission.css.
  const colours = {
    "--access-primary": token.colorPrimary,
    "--access-primary-bg": token.colorPrimaryBg,
    "--access-primary-border": token.colorPrimaryBorder,
    "--access-border": token.colorBorderSecondary,
    "--access-text-2": token.colorTextSecondary,
    "--access-text-3": token.colorTextTertiary,
    "--access-fill": token.colorFillSecondary,
    "--access-fill-soft": token.colorFillQuaternary,
    "--access-success": token.colorSuccess,
    "--access-warning": token.colorWarning,
    "--access-surface": token.colorBgElevated,
  };
  const [me, setMe] = useState(null);
  const [account, setAccount] = useState(null);
  const [years, setYears] = useState([]);
  const [containers, setContainers] = useState([]);
  const [veraAccess, setVeraAccess] = useState(null);
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!userData?.username) return;
    setError(null);
    try {
      const get = (path, fallback) => axios.get(`${API_BASE_URL}${path}`, { withCredentials: true }).catch(() => ({ data: fallback }));
      const [usersRes, yearsRes, meRes, containersRes, veraRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/users`, { params: { username: userData.username }, withCredentials: true }),
        get("/api/admin/years", { years: [] }),
        get("/api/auth/me", null),
        get("/api/storage/containers", { containers: [] }),
        get("/api/vera/config", null),
      ]);
      const current = (usersRes.data || [])[0];
      if (!current) {
        setError("This account could not be found.");
        return;
      }
      const type = String(current.permission || "viewer").toLowerCase();
      const next = {
        type,
        unit: current.ermsUnit || (type === "records" ? "records" : null),
        modules: modulesOf(current),
        storage: Array.isArray(current.nasContainers) ? current.nasContainers : [],
        caps: Object.fromEntries(CAPABILITIES.map(({ key }) => [key, holdsCapability(current, key)])),
        provinces: Object.fromEntries(PROVINCES.map(({ key }) => [key, current[key] === "readWrite" ? "readWrite" : current[key] === "view" ? "view" : "none"])),
        years: Array.isArray(current.assignedYears) ? current.assignedYears.map(Number) : [],
      };
      setAccount(current);
      setMe(meRes.data);
      setYears((yearsRes.data?.years || []).filter((y) => y.hidden !== true).sort((a, b) => a.year - b.year));
      setContainers(Array.isArray(containersRes.data?.containers) ? containersRes.data.containers : []);
      setVeraAccess(Array.isArray(veraRes.data?.config?.roleAccess) ? veraRes.data.config.roleAccess : null);
      setForm(next);
      setSaved(next);
    } catch (err) {
      console.error("Error fetching user data:", err);
      setError("The account's access could not be loaded.");
    }
  }, [userData?.username]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const isDeveloper = me?.role === "developer";
  const canEdit = isDeveloper || me?.role === "admin";
  const editingSelf = String(me?.user?.userId || "") === String(userData?._id || "");

  const changed = useMemo(() => {
    if (!form || !saved) return {};
    const unit = form.type === "records" ? form.unit || "records" : null;
    return {
      type: form.type !== saved.type,
      unit: unit !== (saved.type === "records" ? saved.unit || "records" : null),
      modules: !sameList(form.modules, saved.modules),
      storage: !sameList(form.storage, saved.storage),
      caps: JSON.stringify(form.caps) !== JSON.stringify(saved.caps),
      provinces: JSON.stringify(form.provinces) !== JSON.stringify(saved.provinces),
      years: !sameList(form.years, saved.years),
    };
  }, [form, saved]);
  const dirty = Object.values(changed).some(Boolean);

  const type = accountType(form?.type || userData.permission);
  const allAccess = form?.type === "developer" || form?.type === "admin";
  const developerType = form?.type === "developer";
  const canHoldStorage = form ? STORAGE_TYPES.has(form.type) && !developerType : false;
  const entersUcds = form?.modules.includes("ucds");

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const put = (path, body) => axios.put(`${API_BASE_URL}${path}`, body, { withCredentials: true });
      const id = encodeURIComponent(account._id);
      const email = encodeURIComponent(account.email);
      if (changed.unit) await put(`/api/users/${id}/erms-unit`, { ermsUnit: form.type === "records" ? form.unit || "records" : null });
      // A new type clears the account's modules, so the modules are saved after it.
      if (changed.type) await put(`/api/users/${id}/type`, { permission: form.type });
      if (changed.storage || changed.type) await put(`/api/nas/access/${id}`, { nasContainers: canHoldStorage ? form.storage : [] });
      if (!allAccess && (changed.modules || changed.type)) await put(`/api/users/${id}/domains`, { domains: form.modules.filter((m) => m !== "admin") });
      if (changed.caps) await axios.patch(`${API_BASE_URL}/api/users/${email}/permissions`, form.caps, { withCredentials: true });
      if (changed.provinces) await axios.patch(`${API_BASE_URL}/api/users/${email}/province-permissions`, form.provinces, { withCredentials: true });
      if (changed.years) await put(`/api/users/${id}/years`, { years: form.years });
      setSaved(form);
      message.success("Access saved. It applies on the person's next request; a new account type, at their next sign-in.");
      onPermissionsUpdate?.();
    } catch (err) {
      setError(err?.response?.data?.error || err?.response?.data?.message || "Some of the access could not be saved. Close and open this again to see what was.");
    } finally {
      setSaving(false);
    }
  };

  const chooseType = (value) => {
    // A type brings its own modules; anything extra is chosen again.
    set({ type: value, modules: modulesOf({ permission: value }), unit: value === "records" ? form.unit || "records" : null });
  };

  const toggle = (list, value, on) => (on ? [...new Set([...list, value])] : list.filter((v) => v !== value));

  if (error && !form) return <Alert type="error" showIcon message={error} />;
  if (!form) return <div className="access-loading">Loading the account&rsquo;s access…</div>;

  const developerOnly = !isDeveloper ? <Tooltip title="Only a Developer can change this."><LockOutlined className="access-lock" /></Tooltip> : null;

  const typeTab = (
    <div className="access-section-stack">
      <section>
        <h4 className="access-heading"><IdcardOutlined /> Account type {developerOnly}</h4>
        <Radio.Group value={form.type} onChange={(e) => chooseType(e.target.value)} disabled={!isDeveloper || editingSelf} className="access-list">
          {[...ACCOUNT_TYPES, ...LEGACY_TYPES.filter((t) => t.value === saved.type)].map((t) => (
            <AccessOption key={t.value} as={Radio} value={t.value} on={form.type === t.value} icon={TYPE_ICON[t.value] || <UserOutlined />} name={t.label} description={t.description} />
          ))}
        </Radio.Group>
        {editingSelf && <Text type="secondary" className="access-note">You cannot change your own account type.</Text>}
      </section>

      {form.type === "records" && (
        <section>
          <h4 className="access-heading"><ToolOutlined /> ERMS unit {developerOnly}</h4>
          <Radio.Group value={form.unit || "records"} onChange={(e) => set({ unit: e.target.value })} disabled={!isDeveloper} className="access-list access-list-columns">
            {UNITS.map((u) => (
              <AccessOption key={u.value} as={Radio} compact value={u.value} on={(form.unit || "records") === u.value} icon={u.icon} name={u.label} />
            ))}
          </Radio.Group>
        </section>
      )}

      <section>
        <h4 className="access-heading"><AppstoreOutlined /> Modules {developerOnly}</h4>
        <div className="access-list">
          {MODULES.map((m) => {
            const held = allAccess || form.modules.includes(m.value);
            const locked = !isDeveloper || allAccess || m.typeOnly || !CAN_ENTER_MODULES.includes(form.type);
            // The last module cannot be unticked: an account enters at least one.
            const last = held && form.modules.filter((x) => x !== "admin").length === 1;
            // A box that cannot be changed says why, rather than only looking grey.
            const why = m.typeOnly || allAccess ? "Set by the account type" : last ? "An account needs at least one module" : !isDeveloper ? "Developer only" : null;
            return (
              <AccessOption
                key={m.value}
                on={held}
                checked={held}
                disabled={locked || last}
                onChange={(e) => set({ modules: toggle(form.modules, m.value, e.target.checked) })}
                icon={m.icon}
                name={m.label}
                description={m.description}
                note={why}
              />
            );
          })}
        </div>
      </section>
    </div>
  );

  const yearsTab = (
    <section>
      <h4 className="access-heading"><CalendarOutlined /> Year containers {!allAccess && <HeldCount held={form.years.length} of={years.length} />}</h4>
      {allAccess ? (
        <Alert type="info" showIcon message={`A ${type.label} enters every active year container.`} />
      ) : (
        <>
          <p className="access-hint">The years this account may pick at sign-in and switch to from the header. Hidden and archived years are never offered.</p>
          {canEdit && years.length > 1 && (
            <div className="access-select-all">
              <Checkbox
                indeterminate={form.years.length > 0 && form.years.length < years.length}
                checked={form.years.length === years.length}
                onChange={(e) => set({ years: e.target.checked ? years.map((y) => y.year) : [] })}
              >
                Select all years
              </Checkbox>
            </div>
          )}
          <div className="access-tiles">
            {years.map((y) => (
              <AccessOption
                key={y.year}
                compact
                on={form.years.includes(y.year)}
                checked={form.years.includes(y.year)}
                disabled={!canEdit}
                onChange={(e) => set({ years: toggle(form.years, y.year, e.target.checked) })}
                icon={<CalendarOutlined />}
                name={String(y.year)}
                tags={
                  <>
                    {y.year === new Date().getFullYear() && <Tag color="processing">current</Tag>}
                    {y.locked && <Tag color="red">locked</Tag>}
                    {y.status !== "active" && <Tag>{y.status}</Tag>}
                  </>
                }
              />
            ))}
          </div>
          {entersUcds && !form.years.length && <Alert className="access-warning" type="warning" showIcon message="No year assigned: this account can sign in, but cannot enter the Universe Central DB." />}
        </>
      )}
    </section>
  );

  const provinceRows = PROVINCES.map((p) => {
    const level = form.provinces[p.key];
    return (
      <tr key={p.key} className={level === "none" ? "access-grid-none" : undefined}>
        <th scope="row">{p.name}</th>
        <td>
          <Checkbox checked={level !== "none"} disabled={!canEdit} aria-label={`${p.name}: view`} onChange={(e) => set({ provinces: { ...form.provinces, [p.key]: e.target.checked ? "view" : "none" } })} />
        </td>
        <td>
          <Checkbox checked={level === "readWrite"} disabled={!canEdit} aria-label={`${p.name}: edit`} onChange={(e) => set({ provinces: { ...form.provinces, [p.key]: e.target.checked ? "readWrite" : "view" } })} />
        </td>
        <td className="access-grid-level">{PROVINCE_LEVEL[level]}</td>
      </tr>
    );
  });
  const allAt = (test) => PROVINCES.every((p) => test(form.provinces[p.key]));
  const someAt = (test) => PROVINCES.some((p) => test(form.provinces[p.key]));
  const setAll = (level) => set({ provinces: Object.fromEntries(PROVINCES.map((p) => [p.key, level])) });

  const provincesTab = (
    <section>
      <h4 className="access-heading"><EnvironmentOutlined /> Monitoring Plan provinces {!allAccess && <HeldCount held={PROVINCES.filter((p) => form.provinces[p.key] !== "none").length} of={PROVINCES.length} />}</h4>
      {allAccess ? (
        <Alert type="info" showIcon message={`A ${type.label} sees every province.`} />
      ) : (
        <>
          <p className="access-hint">
            Which provinces of the register this account sees, within each year container&rsquo;s own list. <b>Edit</b> also needs the Manage data action.
          </p>
          <table className="access-grid">
            <thead>
              <tr>
                <th scope="col">Province</th>
                <th scope="col"><EyeOutlined /> View</th>
                <th scope="col"><EditOutlined /> Edit</th>
                <th scope="col" className="access-grid-level">Access</th>
              </tr>
              <tr className="access-grid-all">
                <th scope="row">All provinces</th>
                <td>
                  <Checkbox checked={allAt((l) => l !== "none")} indeterminate={someAt((l) => l !== "none") && !allAt((l) => l !== "none")} disabled={!canEdit} aria-label="All provinces: view" onChange={(e) => setAll(e.target.checked ? "view" : "none")} />
                </td>
                <td>
                  <Checkbox checked={allAt((l) => l === "readWrite")} indeterminate={someAt((l) => l === "readWrite") && !allAt((l) => l === "readWrite")} disabled={!canEdit} aria-label="All provinces: edit" onChange={(e) => setAll(e.target.checked ? "readWrite" : "view")} />
                </td>
                <td />
              </tr>
            </thead>
            <tbody>{provinceRows}</tbody>
          </table>
        </>
      )}
    </section>
  );

  const actionsTab = (
    <section>
      <h4 className="access-heading"><ToolOutlined /> What this account may do {!developerType && <HeldCount held={CAPABILITIES.filter((c) => form.caps[c.key]).length} of={CAPABILITIES.length} />}</h4>
      {developerType && <Alert className="access-warning" type="info" showIcon message="A Developer holds every action." />}
      <div className="access-list">
        {CAPABILITIES.map((c) => {
          const held = developerType || form.caps[c.key] === true;
          return (
            <AccessOption
              key={c.key}
              on={held}
              checked={held}
              disabled={!canEdit || developerType}
              onChange={(e) => set({ caps: { ...form.caps, [c.key]: e.target.checked } })}
              icon={c.icon}
              name={c.name}
              description={c.description}
            />
          );
        })}
      </div>
    </section>
  );

  const storageTab = (
    <section>
      <h4 className="access-heading"><CloudServerOutlined /> Storage containers {developerOnly}</h4>
      {developerType ? (
        <Alert type="info" showIcon message="A Developer opens every container." />
      ) : !canHoldStorage ? (
        <Alert type="info" showIcon message="An Encoder works in the Universe Central DB only and has no storage access." />
      ) : !containers.length ? (
        <Alert type="info" showIcon message="No storage containers are switched on." />
      ) : (
        <>
          <p className="access-hint">Opened under Storage in the sidebar. The person never sees a share path or a credential, and every read is audited.</p>
          <div className="access-tiles">
            {containers.map((c) => {
              const own = form.type === "records" && (form.unit || "records") === c.key;
              const on = own || form.storage.includes(c.key);
              return (
                <AccessOption
                  key={c.key}
                  compact
                  on={on}
                  checked={on}
                  disabled={!isDeveloper || own}
                  onChange={(e) => set({ storage: toggle(form.storage, c.key, e.target.checked) })}
                  icon={<FolderOpenOutlined />}
                  name={c.label}
                  note={own ? "Their own unit's" : null}
                />
              );
            })}
          </div>
        </>
      )}
    </section>
  );

  const automatic = automaticAccess({ ...account, permission: form.type, ermsUnit: form.unit, domains: form.modules }, veraAccess);
  const automaticTab = (
    <section>
      <h4 className="access-heading"><InfoCircleOutlined /> Follows from the above</h4>
      <p className="access-hint">Nothing to tick here. This is what the type and modules already give, and where each is decided.</p>
      <div className="access-list">
        {automatic.map((a) => (
          <div key={a.key} className="access-option access-option-static">
            <span className="access-option-state">{a.on ? <CheckCircleFilled className="access-on" aria-label="Yes" /> : <MinusCircleOutlined className="access-off" aria-label="No" />}</span>
            <span className="access-option-body">
              <span className="access-option-icon" aria-hidden="true">{AUTOMATIC_ICON[a.icon]}</span>
              <span className="access-option-text">
                <span className="access-option-name">{a.name}</span>
                <span className="access-option-description">{a.detail}</span>
              </span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );

  const heldYears = allAccess ? "all" : form.years.length;
  const heldProvinces = allAccess ? "all" : PROVINCES.filter((p) => form.provinces[p.key] !== "none").length;
  const heldActions = developerType ? "all" : CAPABILITIES.filter((c) => form.caps[c.key]).length;
  const heldStorage = developerType ? "all" : canHoldStorage ? form.storage.length : 0;
  const tabLabel = (icon, label, count, edited) => (
    <span className={`access-tab${edited ? " access-tab-edited" : ""}`}>
      {icon}
      <span>{label}</span>
      {count !== undefined && <span className="access-tab-count">{count}</span>}
    </span>
  );

  return (
    <ConfigProvider theme={CONTROL_SIZES}>
    <div className="account-permission-container" style={colours}>
      <div className="user-info">
        <div className="avatar-section">
          <AvatarWithName userHandle={userData.username} size="56px" />
          <span className={`status-dot ${userData.status === "online" ? "online" : "offline"}`} />
        </div>
        <div className="user-details">
          <p className="user-name-details"><strong>{userData.name}</strong></p>
          <p className="user-email-details">
            <LoginOutlined /> Signs in as <Text code>{userData.username}</Text> or {userData.email}
          </p>
          <p className="user-permission-details"><Tag color={type.color}>{type.label}</Tag></p>
        </div>
      </div>

      {!canEdit && me && <Alert className="access-warning" type="info" showIcon icon={<SafetyCertificateOutlined />} message="Only a Developer or Administrator can change access. Shown read-only." />}
      {error && <Alert className="access-warning" type="error" showIcon message={error} closable onClose={() => setError(null)} />}

      <Tabs
        defaultActiveKey="type"
        tabPosition={phone ? "top" : "left"}
        className="access-tabs"
        items={[
          { key: "type", label: tabLabel(<IdcardOutlined />, "Type & modules", undefined, changed.type || changed.unit || changed.modules), children: typeTab },
          { key: "years", label: tabLabel(<CalendarOutlined />, "Years", heldYears, changed.years), children: yearsTab },
          { key: "provinces", label: tabLabel(<EnvironmentOutlined />, "Provinces", heldProvinces, changed.provinces), children: provincesTab },
          { key: "actions", label: tabLabel(<ToolOutlined />, "Actions", heldActions, changed.caps), children: actionsTab },
          { key: "storage", label: tabLabel(<CloudServerOutlined />, "Storage", heldStorage, changed.storage), children: storageTab },
          { key: "automatic", label: tabLabel(<InfoCircleOutlined />, "Automatic"), children: automaticTab },
        ]}
      />

      <div className="footer-actions">
        {dirty && <Text type="warning" className="access-unsaved">Unsaved changes</Text>}
        <Button onClick={onClose}>{dirty ? "Cancel" : "Close"}</Button>
        <Button type="primary" onClick={save} loading={saving} disabled={!dirty || !canEdit}>Save access</Button>
      </div>
    </div>
    </ConfigProvider>
  );
};

export default AccountPermission;
