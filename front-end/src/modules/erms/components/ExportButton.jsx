import { useState } from "react";
import { Button, Tooltip } from "antd";
import { FileExcelOutlined } from "@ant-design/icons";
import { message } from "../../../shared/feedback";
import { describeApiError } from "../api/ermsService";

// ---------------------------------------------------------------------------
// "Export to Excel" on a Document Library: what the list shows — its filters
// and search — with every field of every record, not only the columns on
// screen. `load` fetches the workbook ({ blob, fileName, rows, truncated }).
// ---------------------------------------------------------------------------

const ExportButton = ({ load, label = "Export to Excel" }) => {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const { blob, fileName, rows, truncated } = await load();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      message.success(`Exported ${new Intl.NumberFormat().format(rows)} row(s)${truncated ? " — the first 60,000; narrow the filters for the rest" : ""}.`);
    } catch (e) {
      message.error(describeApiError(e, "The export could not be made."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Tooltip title="Every field of the documents in the list as filtered, as an Excel workbook">
      <Button icon={<FileExcelOutlined />} loading={busy} onClick={run}>
        {label}
      </Button>
    </Tooltip>
  );
};

export default ExportButton;
