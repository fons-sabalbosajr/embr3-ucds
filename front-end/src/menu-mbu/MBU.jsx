import React from "react";
import { Button, Result } from "antd";

const MBU = () => {
  return (
    <div>
      <Result
        status="403"
        title="403"
        subTitle="Sorry, this page is under maintenance."
        extra={<Button type="primary">Back to Dashboard</Button>}
      />
    </div>
  );
};

export default MBU;
