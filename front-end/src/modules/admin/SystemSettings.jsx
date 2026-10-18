import { useEffect, useState } from "react";
import { Tabs } from "antd";
import { useSearchParams } from "react-router-dom";
import DatabaseSettings from "./developer/DatabaseSettings";
import ActivityHistoryConfig from "./developer/ActivityHistoryConfig";
import ErmsUnitsCard from "./developer/ErmsUnitsCard";
import ProgressTrackerCard from "./developer/ProgressTrackerCard";
import { fetchCurrentUser } from "../../api/universeService";

// ---------------------------------------------------------------------------
// How the system itself behaves: its database and what it records.
//
// Two sidebar entries became two tabs. Both answer "is the platform healthy
// and what is it keeping", which is one question an administrator asks in one
// sitting. A third, for the Developer only: which ERMS units are open, and
// taking one down for maintenance.
//
// The records share is deliberately not a tab here. It needs the developer
// role and an emailed code on top of the admin domain, and folding a
// differently-guarded screen into this one would make that gate easy to lose.
// ---------------------------------------------------------------------------

const TABS = [
  { key: "database", label: "Database", element: DatabaseSettings },
  { key: "audit", label: "Activity History", element: ActivityHistoryConfig },
  // Taking an ERMS unit down for maintenance: the Developer's alone (the API
  // refuses anyone else), so the tab is only offered to them.
  { key: "erms-units", label: "ERMS Units", element: ErmsUnitsCard, developerOnly: true },
  // The Progress Tracker's way in, now that it is out of the menu (Developer only, as its API is).
  { key: "progress-tracker", label: "Progress Tracker", element: ProgressTrackerCard, developerOnly: true },
];

const SystemSettings = ({ theme }) => {
  const [params, setParams] = useSearchParams();
  const [isDeveloper, setIsDeveloper] = useState(false);
  useEffect(() => {
    fetchCurrentUser().then((me) => setIsDeveloper(me?.role === "developer")).catch(() => {});
  }, []);
  const tabs = TABS.filter((t) => !t.developerOnly || isDeveloper);
  const active = tabs.some((t) => t.key === params.get("tab"))
    ? params.get("tab")
    : "database";

  return (
    <Tabs
      activeKey={active}
      onChange={(key) => setParams({ tab: key }, { replace: true })}
      destroyInactiveTabPane
      items={tabs.map(({ key, label, element: Element }) => ({
        key,
        label,
        children: <Element theme={theme} />,
      }))}
    />
  );
};

export default SystemSettings;
