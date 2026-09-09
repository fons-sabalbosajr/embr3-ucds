import { Tabs } from "antd";
import { useSearchParams } from "react-router-dom";
import RegisterConfig from "../ucds/register-config/RegisterConfig";
import RegisterActivity from "../ucds/register-config/RegisterActivity";
import DuplicatesData from "../ucds/duplicates/DuplicatesData";

// ---------------------------------------------------------------------------
// Everything about the register behind Monitoring Plan, in one screen.
//
// These were three sidebar entries — Monitoring Config, Register Activity and
// Duplicate Data — for one subject. Someone reconciling a duplicate usually
// wants the activity trail next, and three menu items made that three
// navigations away from where they were.
//
// The tab is in the URL so a link to a particular tab still works, and so the
// old routes can redirect to the right place rather than to the top of the
// screen.
// ---------------------------------------------------------------------------

const TABS = [
  { key: "config", label: "Monitoring Config", element: RegisterConfig },
  { key: "activity", label: "Register Activity", element: RegisterActivity },
  { key: "duplicates", label: "Duplicate Data", element: DuplicatesData },
];

const RegisterSettings = ({ theme }) => {
  const [params, setParams] = useSearchParams();
  const active = TABS.some((t) => t.key === params.get("tab"))
    ? params.get("tab")
    : "config";

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

export default RegisterSettings;
