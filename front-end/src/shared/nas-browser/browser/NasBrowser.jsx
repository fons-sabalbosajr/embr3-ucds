import { Alert, Card, Space, Typography } from "antd";
import { Link } from "react-router-dom";
import NasStorageBrowser from "../storage/NasStorageBrowser";

const { Paragraph } = Typography;

// There is no share browser any more, and that is deliberate.
//
// Walking the share from a browser is the "browse arbitrary NAS directories"
// capability the design forbids: it would let anyone who reached this screen
// read documents belonging to records they have no access to, bypassing the
// province scope that governs everything else. Documents are opened from their
// record instead, where that scope applies.
//
// What remains is a one-level listing of the share root, as a diagnostic.

const NasBrowser = () => (
  <Space direction="vertical" size="large" style={{ width: "100%" }}>
    <Alert
      type="info"
      showIcon
      message="Documents are opened from their record"
      description={
        <Paragraph style={{ marginBottom: 0 }}>
          Browsing the share directly would bypass the province scope that
          decides who may read which record, so it is not offered. Find the
          record under <Link to="/universe/erms/records">Records</Link> and open
          its document there.
        </Paragraph>
      }
    />

    <Card title="Share root" size="small">
      <NasStorageBrowser />
    </Card>
  </Space>
);

export default NasBrowser;
