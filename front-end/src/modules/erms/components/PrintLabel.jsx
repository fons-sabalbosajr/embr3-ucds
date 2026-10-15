import { useRef, useState } from "react";
import { Button, Modal, QRCode, Space, Typography } from "antd";
import { PrinterOutlined, QrcodeOutlined } from "@ant-design/icons";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// A label for a folder, a record's paper file or an archive box: its code in
// large type, a few lines saying what it is, and a QR code that opens it in
// E-Universe when scanned with a phone. Printed from its own small window, so
// nothing else on the screen goes to the printer.
//
//   code    the serial or box code, printed large
//   lines   [string] — what it is (permit, proponent, project, …)
//   path    the address in E-Universe the QR code opens
// ---------------------------------------------------------------------------

const PrintLabel = ({ code, lines = [], path, buttonLabel = "Print label", size = "middle" }) => {
  const [open, setOpen] = useState(false);
  const labelRef = useRef(null);
  const url = `${window.location.origin}${path}`;

  const print = () => {
    const html = labelRef.current?.innerHTML || "";
    const win = window.open("", "_blank", "width=480,height=420");
    if (!win) return;
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${code}</title>
<style>
  @page { size: 90mm 50mm; margin: 3mm; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; }
  .eu-label { display: flex; gap: 10px; align-items: center; border: 1px solid #000; border-radius: 6px; padding: 8px; width: 84mm; height: 44mm; box-sizing: border-box; }
  .eu-label__qr svg { width: 34mm; height: 34mm; }
  .eu-label__code { font-size: 18pt; font-weight: 700; font-family: Consolas, monospace; margin-bottom: 4px; word-break: break-all; }
  .eu-label__line { font-size: 8.5pt; line-height: 1.25; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .eu-label__agency { font-size: 7pt; margin-top: 4px; color: #333; }
</style></head><body>${html}<script>window.onload=function(){window.print();setTimeout(function(){window.close()},300)}</script></body></html>`);
    win.document.close();
  };

  return (
    <>
      <Button size={size} icon={<QrcodeOutlined />} onClick={() => setOpen(true)}>
        {buttonLabel}
      </Button>
      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        title={`Label — ${code}`}
        width={460}
        footer={
          <Space>
            <Button onClick={() => setOpen(false)}>Close</Button>
            <Button type="primary" icon={<PrinterOutlined />} onClick={print}>Print</Button>
          </Space>
        }
        destroyOnHidden
      >
        {/* What prints: the same markup, in the label's own window. */}
        <div ref={labelRef}>
          <div className="eu-label" style={{ display: "flex", gap: 12, alignItems: "center", border: "1px solid #999", borderRadius: 6, padding: 10, background: "#fff", color: "#000" }}>
            <div className="eu-label__qr" style={{ flex: "none" }}>
              <QRCode value={url} type="svg" size={128} bordered={false} color="#000000" bgColor="#ffffff" />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="eu-label__code" style={{ fontSize: 20, fontWeight: 700, fontFamily: "Consolas, monospace", wordBreak: "break-all" }}>{code}</div>
              {lines.filter(Boolean).map((l, i) => (
                <div key={i} className="eu-label__line" style={{ fontSize: 12, lineHeight: 1.3 }}>{l}</div>
              ))}
              <div className="eu-label__agency" style={{ fontSize: 10, marginTop: 4, color: "#333" }}>EMB Region III · E-Universe</div>
            </div>
          </div>
        </div>
        <Text type="secondary" style={{ display: "block", marginTop: 8, fontSize: 12 }}>
          Sized for a 90 × 50 mm label. Scanning the code opens it in E-Universe (sign-in required).
        </Text>
      </Modal>
    </>
  );
};

export default PrintLabel;
