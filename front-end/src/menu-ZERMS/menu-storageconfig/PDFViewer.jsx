import React from "react";
import { Modal } from "antd";

const PDFViewer = ({ file, onClose }) => {
  // The new endpoint will rely on the server-side session cookie for auth
  const url = `http://10.14.77.107:8081/api/erms/view-pdf?file=${encodeURIComponent(
    file
  )}`;

  return (
    <div>
      <Modal
        open={true}
        onCancel={onClose}
        title={file}
        footer={null}
        width={900}
        destroyOnClose
      >
        <iframe
          src={url}
          width="100%"
          height="600px"
          style={{ border: "none" }}
          title="PDF Viewer"
        ></iframe>
      </Modal>
    </div>
  );
};

export default PDFViewer;
