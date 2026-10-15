import { DatabaseOutlined } from "@ant-design/icons";
import PageHeader from "../../shared/components/PageHeader";
import { UCDS_ACCENT } from "./ucdsColors";

// ---------------------------------------------------------------------------
// The Universe Central DB's look: the same page header, cards and tables as
// ERMS (shared/components), in its own colour.
// ---------------------------------------------------------------------------

/** The header band of a Universe Central DB page. */
export const UcdsHeader = ({ title = "Universe Central DB", description, actions, extra }) => (
  <PageHeader
    compact
    accent={UCDS_ACCENT}
    icon={<DatabaseOutlined />}
    title={title}
    description={description ?? "The Universe of Firms and Industries: the monitoring plan per province, the survey, and the reports drawn from them."}
    actions={actions}
    extra={extra}
  />
);
