import { Tabs } from "antd";
import { useSearchParams } from "react-router-dom";
import DatabaseSettings from "./developer/DatabaseSettings";
import ActivityHistoryConfig from "./developer/ActivityHistoryConfig";

// ---------------------------------------------------------------------------
// How the system itself behaves: its database and what it records.
//
// Two sidebar entries became two tabs. Both answer "is the platform healthy
// and what is it keeping", which is one question an administrator asks in one
// sitting.
//
// The records share is deliberately not a tab here. It needs the developer
// role and an emailed code on top of the admin domain, and folding a
// differently-guarded screen into this one would make that gate easy to lose.
// ---------------------------------------------------------------------------

const TABS = [
  { key: "database", label: "Database", element: DatabaseSettings },
  { key: "audit", label: "Activity History", element: ActivityHistoryConfig },
];

const SystemSettings = ({ theme }) => {
  const [params, setParams] = useSearchParams();
  const active = TABS.some((t) => t.key === params.get("tab"))
    ? params.get("tab")
    : "database";

  return (
    <Tabs
      activeKey={active}
      onChange={(key) => setParams({ tab: key }, { replace: true })}
      destroyInactiveTabPane
      items={TABS.map(({ key, label, element: Element }) => ({
        key,
        label,
        children: <Element theme={theme} />,
      }))}
    />
  );
};

export default SystemSettings;
