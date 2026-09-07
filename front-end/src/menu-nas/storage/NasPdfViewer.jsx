import { Modal } from "antd";
import { API_BASE_URL } from "../../config/api";

const NasPdfViewer = ({ file, onClose }) => {
  // The endpoint relies on the server-side session cookie for auth
  const url = `${API_BASE_URL}/api/nas/view-pdf?file=${encodeURIComponent(
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

export default NasPdfViewer;
