/* eslint-disable react/prop-types -- the application does not use PropTypes */
import { useCallback, useState } from "react";
import { Alert, Button, Collapse, Descriptions, Drawer, Space, Table, Tag, Typography } from "antd";
import { ReadOutlined, ReloadOutlined } from "@ant-design/icons";
import { API_BASE_URL } from "../../../config/api";

// ---------------------------------------------------------------------------
// The Developer's own runbook for document storage: how the deployment fits
// together, how to rotate a share password, every switch that turns document
// access on or off and where it lives, and what to check when documents will
// not open. Opened from the Storage screen's header.
//
// The top of the drawer is live (the activation window's end, the schedule,
// the master switch), read from the same endpoints the Containers and Access
// tabs use, so the reminder to renew the window cannot go stale.
//
// Every front-end file can be downloaded by anyone who opens the site, so
// nothing here names an internal address, a share, or an account: screens,
// steps and the public domain only. Hosts and shares are on the Diagnostics
// tab, which reads them from the server for a verified Developer.
// ---------------------------------------------------------------------------

const { Paragraph, Text, Title } = Typography;

const PUBLIC_URL = "https://e-universe.embr3-onlinesystems.cloud";

const api = (path) => fetch(`${API_BASE_URL}${path}`, { credentials: "include" });

const fmt = (d) =>
  d ? new Date(d).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }) : "—";

const daysUntil = (d) => (d ? Math.ceil((new Date(d) - Date.now()) / 86400000) : null);

const CONTROLS = [
  { key: "master", control: "Master switch", where: "Containers tab › Availability", use: "Turns document access off for everyone at once, e.g. during NAS maintenance." },
  { key: "schedule", control: "Schedule", where: "Containers tab › Availability", use: "Days and hours documents may be opened (Philippine time). Off means any time, every day." },
  { key: "window", control: "Activation window", where: "Access tab › Activation", use: "A start and an end date. Access closes on its own when the window ends." },
  { key: "container", control: "One container", where: "Containers tab, its row", use: "Takes one share (Records, Legal, Laboratory …) out of use without touching the others." },
  { key: "person", control: "One person", where: "Access tab, the table", use: "Which accounts may open which containers." },
];

const StatusBlock = ({ status, loading, onReload }) => {
  if (!status) return null;
  const { activation, availability } = status;
  const left = daysUntil(activation?.endsAt);
  const scheduleOn = availability?.schedule?.enabled;
  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      {left !== null && left <= 30 && (
        <Alert
          type={left <= 7 ? "error" : "warning"}
          showIcon
          message={`Renew the activation window: it ends in ${left} day${left === 1 ? "" : "s"}`}
          description="When it ends, documents stop opening for everyone. Access tab › Activation › set a new end date."
        />
      )}
      <Descriptions
        size="small"
        column={1}
        bordered
        title="Right now"
        extra={
          <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={onReload}>
            Refresh
          </Button>
        }
      >
        <Descriptions.Item label="Document access">
          {activation?.active ? <Tag color="green">Open</Tag> : <Tag color="red">Closed</Tag>}
          {!activation?.active && activation?.reason && <Text type="secondary">{activation.reason}</Text>}
        </Descriptions.Item>
        <Descriptions.Item label="Activation window ends">
          {activation?.endsAt ? (
            <>
              {fmt(activation.endsAt)}{" "}
              <Tag color={left <= 7 ? "red" : left <= 30 ? "orange" : "default"}>{left} days left</Tag>
            </>
          ) : (
            <Text type="secondary">no end date, or held off by another rule</Text>
          )}
        </Descriptions.Item>
        <Descriptions.Item label="Schedule">
          {scheduleOn ? availability.scheduleText : <Tag color="blue">Off: any time, every day</Tag>}
        </Descriptions.Item>
        <Descriptions.Item label="Master switch">
          {availability?.master === false ? <Tag color="red">Off</Tag> : <Tag color="green">On</Tag>}
        </Descriptions.Item>
      </Descriptions>
    </Space>
  );
};

const SECTIONS = [
  {
    key: "how",
    label: "How it fits together",
    children: (
      <>
        <Paragraph>
          Staff open E-Universe at <Text code>{PUBLIC_URL}</Text>. The VPS answers that address over HTTPS and passes each
          request through Tailscale to the office server, which runs E-Universe and is on the same network as the NAS.
        </Paragraph>
        <Paragraph>
          <Text code>staff anywhere → VPS (HTTPS) → Tailscale → office server → NAS</Text>
        </Paragraph>
        <ul>
          <li>The NAS is never on the internet. Only the office server opens the shares, and staff only ever see documents through E-Universe, with its permissions and audit trail.</li>
          <li>Share passwords are saved here, encrypted, and the server copies them into its Windows vault every time it starts and every time one is saved. Nobody types them on the server.</li>
          <li>If the office server is off, visitors see a plain &ldquo;temporarily unavailable&rdquo; page instead of an error.</li>
        </ul>
      </>
    ),
  },
  {
    key: "rotate",
    label: "Rotate a NAS password",
    children: (
      <ol>
        <li>Change the account&rsquo;s password on the Synology (DSM).</li>
        <li>
          Straight away: <Text strong>Containers tab</Text> › edit the container › enter the new password › <Text strong>Save</Text>.
        </li>
        <li>Saving writes it to the office server at once and runs a connection test; the result shows on the container.</li>
        <li>If the test fails, re-type the password (no spaces before or after) and save again, then check the Diagnostics tab.</li>
      </ol>
    ),
  },
  {
    key: "switches",
    label: "Turn document access on or off",
    children: (
      <>
        <Table
          size="small"
          pagination={false}
          rowKey="key"
          dataSource={CONTROLS}
          columns={[
            { title: "Control", dataIndex: "control", width: 140, render: (v) => <Text strong>{v}</Text> },
            { title: "Where", dataIndex: "where", width: 190 },
            { title: "What it is for", dataIndex: "use" },
          ]}
        />
        <Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
          All of them are stored in the database: a change applies to everyone at once and nothing needs doing on the server.
        </Paragraph>
      </>
    ),
  },
  {
    key: "renew",
    label: "Renew the activation window",
    children: (
      <>
        <Paragraph>
          The window has an end date on purpose, so access can never be left open by forgetting. Before it ends:
        </Paragraph>
        <ol>
          <li>
            <Text strong>Access tab</Text> › Activation › choose a new end date › save.
          </li>
          <li>Put the next renewal in the office calendar, a month ahead of the new end date.</li>
        </ol>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          If it lapses, staff are told documents are switched off. Nothing is lost; renewing opens them again immediately.
        </Paragraph>
      </>
    ),
  },
  {
    key: "trouble",
    label: "When documents will not open",
    children: (
      <ol>
        <li>
          <Text strong>Right now</Text> (top of this panel): access open, window not ended, master switch on, schedule off or inside its hours.
        </li>
        <li>
          <Text strong>Diagnostics tab</Text> › Test all. A failing container: re-save its password (Rotate, above).
        </li>
        <li>
          The whole site shows &ldquo;temporarily unavailable&rdquo;: the office server is off or offline. On it, in PowerShell:{" "}
          <Text code>Get-Service &quot;UCDS API&quot;,&quot;UCDS Web&quot;</Text>.
        </li>
        <li>
          On the office server, <Text code>C:\ucds\logs\api.out.log</Text> shows a <Text code>[NAS]</Text> line at every start: which
          containers&rsquo; passwords were restored, and any that were not.
        </li>
      </ol>
    ),
  },
  {
    key: "sql",
    label: "The legacy ERMS SQL Server",
    children: (
      <>
        <Paragraph>
          <Text strong>SQL Server tab</Text>: E-Universe reads the desktop ERMS databases there, read-only, from the office server over the
          office network. Nothing about the SQL Server is exposed to the internet; you reach it through E-Universe from anywhere.
        </Paragraph>
        <ol>
          <li>Enter the server (as in SSMS), the login and its password, then <Text strong>Save and test</Text>.</li>
          <li>The test shows which databases are readable, and warns if the login can change data. Ask for a read-only login (db_datareader) if it can.</li>
          <li>Rotating its password works like the NAS: change it on the SQL Server, then save the new one here straight away.</li>
          <li>
            The daily divergence check can read it live: <Text code>npm run daily-check -- --source=sql</Text> on the office server.
          </li>
        </ol>
      </>
    ),
  },
  {
    key: "ops",
    label: "Server and updates",
    children: (
      <>
        <ul>
          <li>
            E-Universe runs on the office server as two Windows services, <Text code>UCDS API</Text> and <Text code>UCDS Web</Text>,
            which start with Windows and restart themselves.
          </li>
          <li>
            Update: on the office server, <Text code>git pull</Text>, then <Text code>npm run build</Text> in{" "}
            <Text code>front-end</Text> and restart the service that changed. When a <Text code>package-lock.json</Text> changed,
            stop both services first and run <Text code>npm ci</Text> in <Text code>server</Text> and <Text code>front-end</Text>:
            Windows will not replace packages a running service holds open.
          </li>
          <li>The VPS needs nothing for an update. Its HTTPS certificate renews itself.</li>
          <li>
            Full steps, troubleshooting and rollback: <Text code>server/scripts/winserver/README.md</Text> in the repository.
          </li>
        </ul>
      </>
    ),
  },
];

const NasGuideDrawer = () => {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [act, avail] = await Promise.all([api("/api/nas/activation"), api("/api/nas/availability")]);
      const activation = act.ok ? await act.json() : null;
      const availability = avail.ok ? await avail.json() : null;
      if (!activation && !availability) setError("Could not read the current settings. The guide below still applies.");
      setStatus({ activation, availability });
    } catch {
      setError("Could not read the current settings. The guide below still applies.");
    } finally {
      setLoading(false);
    }
  }, []);

  const show = () => {
    setOpen(true);
    load();
  };

  return (
    <>
      <Button icon={<ReadOutlined />} onClick={show}>
        Developer guide
      </Button>
      <Drawer
        title="Document storage: Developer guide"
        placement="right"
        width="min(760px, 100vw)"
        open={open}
        onClose={() => setOpen(false)}
      >
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          {error && <Alert type="warning" showIcon message={error} />}
          <StatusBlock status={status} loading={loading} onReload={load} />
          <div>
            <Title level={5} style={{ marginTop: 0 }}>
              What to do
            </Title>
            <Collapse items={SECTIONS} defaultActiveKey={["rotate", "switches"]} />
          </div>
        </Space>
      </Drawer>
    </>
  );
};

export default NasGuideDrawer;
