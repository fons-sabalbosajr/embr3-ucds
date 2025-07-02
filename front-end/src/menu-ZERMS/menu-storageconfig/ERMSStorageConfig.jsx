import React, { useState } from "react";
import { Button, Modal } from "antd";
import ERMSStorageConfigModal from "./ERMSStorageConfigModal";

const ERMSStorageConfig = () => {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <Button type="primary" onClick={() => setOpen(true)}>
        Open Storage Explorer
      </Button>
      <Modal
        title="ERMS Storage Explorer"
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        width={800}
        destroyOnClose
      >
        {/* The modal now handles its own content, including the login form */}
        <ERMSStorageConfigModal />
      </Modal>
    </div>
  );
};

export default ERMSStorageConfig;
