import { Space } from "antd";
import { useYear } from "../../../context/YearContext";
import { UcdsHeader } from "../ucdsTheme";
import { VeraFlame } from "../../vera/VeraMark";
import VeraUcdsCheck from "../../vera/VeraUcdsCheck";

// ---------------------------------------------------------------------------
// Universe Central DB › VERA check: VERA's check of the active year's
// register, for the Developer and administrators — the spellings she can
// fix, and what she lists for a person to review.
// ---------------------------------------------------------------------------

const UcdsVeraCheck = () => {
  const { activeYear } = useYear();
  return (
    <Space direction="vertical" size={10} style={{ width: "100%" }}>
      <UcdsHeader
        title={`VERA check — ${activeYear || ""}`}
        description="VERA reads the whole register: places, industries and provinces written several ways, coordinates the wrong way round, the same permit on two firms, firms missing essentials, permits past expiry."
        extra={null}
        actions={<VeraFlame size={28} label="VERA" />}
      />
      <VeraUcdsCheck year={activeYear} />
    </Space>
  );
};

export default UcdsVeraCheck;
