import { useState } from "react";
import { Button, Modal } from "antd";
import NasStorageBrowser from "./NasStorageBrowser";

const NasStorageConfig = () => {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <Button type="primary" onClick={() => setOpen(true)}>
        Open Storage Explorer
      </Button>
      <Modal
        title="NAS Storage Explorer"
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        width={800}
        destroyOnClose
      >
        {/* The browser handles its own content, including the login form */}
        <NasStorageBrowser />
      </Modal>
    </div>
  );
};

export default NasStorageConfig;
