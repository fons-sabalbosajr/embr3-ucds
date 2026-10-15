import PageHeader from "../../../shared/components/PageHeader";
import { unitTheme } from "../units/unitTheme";

// The band at the top of every ERMS page — Records, Legal Services and
// Laboratory alike (shared/components/PageHeader, which the Universe Central
// DB uses too): the unit's icon and accent, the page's name, a line on what
// it holds, and the page's actions on the right.

const UnitHeader = ({ unit, title, description, actions }) => {
  const theme = unitTheme(unit);
  return <PageHeader accent={theme.accent} icon={theme.icon} title={title || theme.label} description={description ?? theme.description} actions={actions} />;
};

export default UnitHeader;
