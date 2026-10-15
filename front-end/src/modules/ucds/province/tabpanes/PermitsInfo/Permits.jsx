import React, { useState, useEffect } from "react";
import {
  Table,
  Button,
  Row,
  Col,
  Input,
  ConfigProvider,
  AutoComplete,
} from "antd";
import "./permits.css";

const ECCOptions = [
  { value: "ECC Manual" },
  { value: "ECC Online" },
  { value: "ECC EMB CO" },
  { value: "CNC Manual" },
  { value: "CNC Online" },
];

const HAZ_PROCESS_OPTIONS = [{ value: "MANUAL" }, { value: "ONLINE" }];

const PD1586_COLUMNS = [
  {
    title: "ECC/CNC Reference No.",
    dataIndex: "ecc_cnc",
    key: "ecc_cnc",
    align: "center",
    width: 200,
    render: (value, record) =>
      record.isEditing ? (
        <Input
          value={value}
          onChange={(e) =>
            record.handleChange("ecc_cnc", e.target.value, record.key)
          }
          placeholder="-"
        />
      ) : (
        <span>{value || "-"}</span>
      ),
  },
  {
    title: "Permit Process Source",
    dataIndex: "permit_process",
    key: "permit_process",
    align: "center",
    width: 200,
    render: (value, record) =>
      record.isEditing ? (
        <ConfigProvider
          theme={{
            components: {
              AutoComplete: {
                optionFontSize: 10,
                fontSize: 13,
                boxShadow: "none",
              },
            },
          }}
        >
          <AutoComplete
            style={{
              width: "100%",
              fontSize: 13,
            }}
            options={ECCOptions}
            value={value}
            onChange={(val) =>
              record.handleChange("permit_process", val, record.key)
            }
            filterOption={(inputValue, option) =>
              option.value.toLowerCase().includes(inputValue.toLowerCase())
            }
            allowClear={true}
            disabled={!record.isEditing}
          >
            <Input
              style={{
                marginTop: "2px",
              }}
              placeholder="-"
              readOnly={!record.isEditing}
            />
          </AutoComplete>
        </ConfigProvider>
      ) : (
        <span>{value || "-"}</span>
      ),
  },
  {
    title: "Date Approved",
    dataIndex: "date_approved",
    key: "date_approved",
    align: "center",
    width: 200,
    render: (value, record) =>
      record.isEditing ? (
        <Input
          value={value}
          onChange={(e) =>
            record.handleChange("date_approved", e.target.value, record.key)
          }
          placeholder="-"
        />
      ) : (
        <span>{value || "-"}</span>
      ),
  },
  {
    title: "Date Amended",
    dataIndex: "date_amended",
    key: "date_amended",
    align: "center",
    width: 200,
    render: (value, record) =>
      record.isEditing ? (
        <Input
          value={value}
          onChange={(e) =>
            record.handleChange("date_amended", e.target.value, record.key)
          }
          placeholder="-"
        />
      ) : (
        <span>{value || "-"}</span>
      ),
  },
  {
    title: "Remarks",
    dataIndex: "pd1586_remarks",
    key: "pd1586_remarks",
    align: "center",
    render: (value, record) =>
      record.isEditing ? (
        <Input
          value={value}
          onChange={(e) =>
            record.handleChange("pd1586_remarks", e.target.value, record.key)
          }
          placeholder="-"
        />
      ) : (
        <span>{value || "-"}</span>
      ),
  },
];

const RA8749_COLUMNS = [
  {
    title: "PTO Code",
    dataIndex: "pto_code",
    key: "pto_code",
    align: "center",
    width: 200,
    render: (value, record) =>
      record.isEditing ? (
        <Input
          value={value}
          onChange={(e) =>
            record.handleChange("pto_code", e.target.value, record.key)
          }
          placeholder="-"
        />
      ) : (
        <span>{value || "-"}</span>
      ),
  },
  {
    title: "Date Issued",
    dataIndex: "pto_issued",
    key: "pto_issued",
    align: "center",
    width: 200,
    render: (value, record) =>
      record.isEditing ? (
        <Input
          value={value}
          onChange={(e) =>
            record.handleChange("pto_issued", e.target.value, record.key)
          }
          placeholder="-"
        />
      ) : (
        <span>{value || "-"}</span>
      ),
  },
  {
    title: "Date of Expiration",
    dataIndex: "pto_expiration",
    key: "pto_expiration",
    align: "center",
    width: 200,
    render: (value, record) =>
      renderWithExpiryCheck(value, record, "pto_expiration"),
  },
  {
    title: "Remarks",
    dataIndex: "ra8749_remarks",
    key: "ra8749_remarks",
    align: "center",
    render: (value, record) =>
      record.isEditing ? (
        <Input
          value={value}
          onChange={(e) =>
            record.handleChange("ra8749_remarks", e.target.value, record.key)
          }
          placeholder="-"
        />
      ) : (
        <span>{value || "-"}</span>
      ),
  },
];

const RA9275_COLUMNS = [
  {
    title: "WWDP Code",
    dataIndex: "wwdp_code",
    key: "wwdp_code",
    align: "center",
    width: 200,
    render: (value, record) =>
      record.isEditing ? (
        <Input
          value={value}
          onChange={(e) =>
            record.handleChange("wwdp_code", e.target.value, record.key)
          }
          placeholder="-"
        />
      ) : (
        <span>{value || "-"}</span>
      ),
  },
  {
    title: "Date Issued",
    dataIndex: "wwdp_issued",
    key: "wwdp_issued",
    align: "center",
    width: 200,
    render: (value, record) =>
      record.isEditing ? (
        <Input
          value={value}
          onChange={(e) =>
            record.handleChange("wwdp_issued", e.target.value, record.key)
          }
          placeholder="-"
        />
      ) : (
        <span>{value || "-"}</span>
      ),
  },
  {
    title: "Date of Expiration",
    dataIndex: "wwdp_expiration",
    key: "wwdp_expiration",
    align: "center",
    width: 200,
    render: (value, record) =>
      renderWithExpiryCheck(value, record, "wwdp_expiration"),
  },
  {
    title: "Remarks",
    dataIndex: "ra9275_remarks",
    key: "ra9275_remarks",
    align: "center",
    render: (value, record) =>
      record.isEditing ? (
        <Input
          value={value}
          onChange={(e) =>
            record.handleChange("ra9275_remarks", e.target.value, record.key)
          }
          placeholder="-"
        />
      ) : (
        <span>{value || "-"}</span>
      ),
  },
];

const RA6969_COLUMNS = [
  {
    title: "Hazwaste ID",
    dataIndex: "haz_id",
    key: "haz_id",
    align: "center",
    width: 200,
    render: (value, record) =>
      record.isEditing ? (
        <Input
          value={value}
          onChange={(e) =>
            record.handleChange("haz_id", e.target.value, record.key)
          }
          placeholder="-"
        />
      ) : (
        <span>{value || "-"}</span>
      ),
  },
  {
    title: "Hazwaste Process Source",
    dataIndex: "haz_process_source",
    key: "haz_process_source",
    align: "center",
    width: 200,
    render: (value, record) =>
      record.isEditing ? (
        <AutoComplete
          style={{ width: "100%", fontSize: 13 }}
          options={HAZ_PROCESS_OPTIONS}
          value={value}
          onChange={(val) =>
            record.handleChange("haz_process_source", val, record.key)
          }
          filterOption={(inputValue, option) =>
            option.value.toLowerCase().includes(inputValue.toLowerCase())
          }
          allowClear={true}
          disabled={!record.isEditing}
        >
          <Input
            style={{ marginTop: "2px" }}
            placeholder="-"
            readOnly={!record.isEditing}
          />
        </AutoComplete>
      ) : (
        <span>{value || "-"}</span>
      ),
  },
  {
    title: "Date Issued",
    dataIndex: "haz_issued",
    key: "haz_issued",
    align: "center",
    width: 200,
    render: (value, record) =>
      record.isEditing ? (
        <Input
          value={value}
          onChange={(e) =>
            record.handleChange("haz_issued", e.target.value, record.key)
          }
          placeholder="-"
        />
      ) : (
        <span>{value || "-"}</span>
      ),
  },
  {
    title: "Remarks",
    dataIndex: "ra6969_remarks",
    key: "ra6969_remarks",
    align: "center",
    render: (value, record) =>
      record.isEditing ? (
        <Input
          value={value}
          onChange={(e) =>
            record.handleChange("ra6969_remarks", e.target.value, record.key)
          }
          placeholder="-"
        />
      ) : (
        <span>{value || "-"}</span>
      ),
  },
];

const PCO_COLUMNS = [
  {
    title: "PCO No.",
    dataIndex: "pco_no",
    key: "pco_no",
    align: "center",
    width: 200,
    render: (value, record) =>
      record.isEditing ? (
        <Input
          value={value}
          onChange={(e) =>
            record.handleChange("pco_no", e.target.value, record.key)
          }
          placeholder="-"
        />
      ) : (
        <span>{value || "-"}</span>
      ),
  },
  {
    title: "Validity",
    dataIndex: "pco_validity",
    key: "pco_validity",
    align: "center",
    width: 200,
    render: (value, record) =>
      renderWithExpiryCheck(value, record, "pco_validity"),
  },
  {
    title: "Name",
    dataIndex: "pco_name",
    key: "pco_name",
    align: "center",
    width: 200,
    render: (value, record) =>
      record.isEditing ? (
        <Input
          value={value}
          onChange={(e) =>
            record.handleChange("pco_name", e.target.value, record.key)
          }
          placeholder="-"
        />
      ) : (
        <span>{value || "-"}</span>
      ),
  },
  {
    title: "Tel. No.",
    dataIndex: "pco_tel_no",
    key: "pco_tel_no",
    align: "center",
    width: 200,
    render: (value, record) =>
      record.isEditing ? (
        <Input
          value={value}
          onChange={(e) =>
            record.handleChange("pco_tel_no", e.target.value, record.key)
          }
          placeholder="-"
        />
      ) : (
        <span>{value || "-"}</span>
      ),
  },
  {
    title: "Remarks",
    dataIndex: "pco_remarks",
    key: "pco_remarks",
    align: "center",
    render: (value, record) =>
      record.isEditing ? (
        <Input
          value={value}
          onChange={(e) =>
            record.handleChange("pco_remarks", e.target.value, record.key)
          }
          placeholder="-"
        />
      ) : (
        <span>{value || "-"}</span>
      ),
  },
];

function splitMultiValue(str = "") {
  // Split by comma, semicolon, or newline, trim, and filter out empty
  return str
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function expandRowsFromRecord(record, keys, handler, isEditing) {
  // Find the field with the most values
  const splitFields = keys.map((k) => splitMultiValue(record?.[k]));
  const maxLen = Math.max(...splitFields.map((arr) => arr.length), 1);

  // Build rows, filling missing values with ""
  return Array.from({ length: maxLen }).map((_, idx) => {
    const row = { key: (idx + 1).toString(), isEditing, handleChange: handler };
    keys.forEach((k, i) => {
      row[k] = splitFields[i][idx] || "";
    });
    return row;
  });
}

function isExpired(dateStr) {
  if (!dateStr) return false;
  // Accepts YYYY-MM-DD, MM/DD/YYYY, or similar
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return d < today;
}

function renderWithExpiryCheck(value, record, field) {
  const expired =
    field === "pto_expiration" ||
    field === "wwdp_expiration" ||
    field === "pco_validity"
      ? isExpired(value)
      : false;
  const style = expired
    ? { background: "#ffcccc", color: "#a00", fontWeight: "bold" }
    : {};
  if (record.isEditing) {
    return (
      <Input
        value={value}
        onChange={(e) => record.handleChange(field, e.target.value, record.key)}
        placeholder="-"
        style={style}
      />
    );
  }
  return <span style={style}>{value || "-"}</span>;
}

const Permits = ({
  editedRecord,
  handleChange,
  onSaveChanges,
  isEditing,
  ra8749Array,
  onRa8749Change,
}) => {
  const [pd1586Data, setPd1586Data] = useState([]);
  const [ra8749Data, setRa8749Data] = useState([]);
  const [ra9275Data, setRa9275Data] = useState([]);
  const [ra6969Data, setRa6969Data] = useState([]);
  const [pcoData, setPcoData] = useState([]);

  useEffect(() => {
    if (editedRecord) {
      setPd1586Data(
        expandRowsFromRecord(
          editedRecord,
          [
            "ecc_cnc",
            "permit_process",
            "date_approved",
            "date_amended",
            "pd1586_remarks",
          ],
          handleFieldChangePD1586,
          isEditing
        )
      );
      setRa8749Data(
        expandRowsFromRecord(
          editedRecord,
          ["pto_code", "pto_issued", "pto_expiration", "ra8749_remarks"],
          handleFieldChangeRA8749,
          isEditing
        )
      );
      setRa9275Data(
        expandRowsFromRecord(
          editedRecord,
          ["wwdp_code", "wwdp_issued", "wwdp_expiration", "ra9275_remarks"],
          handleFieldChangeRA9275,
          isEditing
        )
      );
      setRa6969Data(
        expandRowsFromRecord(
          editedRecord,
          ["haz_id", "haz_process_source", "haz_issued", "ra6969_remarks"],
          handleFieldChangeRA6969,
          isEditing
        )
      );
      setPcoData(
        expandRowsFromRecord(
          editedRecord,
          ["pco_no", "pco_validity", "pco_name", "pco_tel_no", "pco_remarks"],
          handleFieldChangePCO,
          isEditing
        )
      );
    }
    // eslint-disable-next-line
  }, [editedRecord, isEditing]);

  // PD1586 handlers
  function handleFieldChangePD1586(field, value, key) {
    setPd1586Data((prev) =>
      prev.map((row) => (row.key === key ? { ...row, [field]: value } : row))
    );
    if (key === "1") handleChange(field, value);
  }

  function handleRemoveLastRowPD1586() {
    setPd1586Data((prev) =>
      prev.length > 1 ? prev.slice(0, prev.length - 1) : prev
    );
  }

  const handleAddNewDataPD1586 = () => {
    const newKey = (pd1586Data.length + 1).toString();
    setPd1586Data([
      ...pd1586Data,
      {
        key: newKey,
        isEditing: true,
        handleChange: handleFieldChangePD1586,
        ecc_cnc: "",
        permit_process: "",
        date_approved: "",
        date_amended: "",
        pd1586_remarks: "",
      },
    ]);
  };

  // RA8749 handlers
 function handleFieldChangeRA8749(field, value, key) {
  const updated = ra8749Array.map((row) =>
    row.key === key ? { ...row, [field]: value } : row
  );
  onRa8749Change(updated); // ⬅️ updated via lifted state
  if (key === "1") handleChange(field, value);
}

  function handleRemoveLastRowRA8749() {
    setRa8749Data((prev) =>
      prev.length > 1 ? prev.slice(0, prev.length - 1) : prev
    );
  }

  const handleAddNewDataRA8749 = () => {
    const newKey = (ra8749Data.length + 1).toString();
    setRa8749Data([
      ...ra8749Data,
      {
        key: newKey,
        isEditing: true,
        handleChange: handleFieldChangeRA8749,
        pto_code: "",
        pto_issued: "",
        pto_expiration: "",
        ra8749_remarks: "",
      },
    ]);
  };

  // RA9275 handlers
  function handleFieldChangeRA9275(field, value, key) {
    setRa9275Data((prev) =>
      prev.map((row) => (row.key === key ? { ...row, [field]: value } : row))
    );
    if (key === "1") handleChange(field, value);
  }

  function handleRemoveLastRowRA9275() {
    setRa9275Data((prev) =>
      prev.length > 1 ? prev.slice(0, prev.length - 1) : prev
    );
  }

  const handleAddNewDataRA9275 = () => {
    const newKey = (ra9275Data.length + 1).toString();
    setRa9275Data([
      ...ra9275Data,
      {
        key: newKey,
        isEditing: true,
        handleChange: handleFieldChangeRA9275,
        wwdp_code: "",
        wwdp_issued: "",
        wwdp_expiration: "",
      },
    ]);
  };

  // RA6969 handlers
  function handleFieldChangeRA6969(field, value, key) {
    setRa6969Data((prev) =>
      prev.map((row) => (row.key === key ? { ...row, [field]: value } : row))
    );
    if (key === "1") handleChange(field, value);
  }

  function handleRemoveLastRowRA6969() {
    setRa6969Data((prev) =>
      prev.length > 1 ? prev.slice(0, prev.length - 1) : prev
    );
  }

  const handleAddNewDataRA6969 = () => {
    const newKey = (ra6969Data.length + 1).toString();
    setRa6969Data([
      ...ra6969Data,
      {
        key: newKey,
        isEditing: true,
        handleChange: handleFieldChangeRA6969,
        haz_id: "",
        haz_process_source: "",
        haz_issued: "",
      },
    ]);
  };

  // PCO handlers
  function handleFieldChangePCO(field, value, key) {
    setPcoData((prev) =>
      prev.map((row) => (row.key === key ? { ...row, [field]: value } : row))
    );
    if (key === "1") handleChange(field, value);
  }

  function handleRemoveLastRowPCO() {
    setPcoData((prev) =>
      prev.length > 1 ? prev.slice(0, prev.length - 1) : prev
    );
  }

  const handleAddNewDataPCO = () => {
    const newKey = (pcoData.length + 1).toString();
    setPcoData([
      ...pcoData,
      {
        key: newKey,
        isEditing: true,
        handleChange: handleFieldChangePCO,
        pco_no: "",
        pco_validity: "",
        pco_name: "",
        pco_tel_no: "",
        pco_remarks: "",
      },
    ]);
  };

  useEffect(() => {
    if (typeof onRa8749Change === "function") {
      onRa8749Change(ra8749Data.filter((r) => !r.isAddRow)); // Remove dummy add-row
    }
  }, [ra8749Data]);
  

  const tableDataPD1586 = isEditing
    ? [...pd1586Data, { key: "add-row", isAddRow: true }]
    : pd1586Data;
  const tableDataRA8749 = isEditing
    ? [...ra8749Data, { key: "add-row", isAddRow: true }]
    : ra8749Data;
  const tableDataRA9275 = isEditing
    ? [...ra9275Data, { key: "add-row", isAddRow: true }]
    : ra9275Data;
  const tableDataRA6969 = isEditing
    ? [...ra6969Data, { key: "add-row", isAddRow: true }]
    : ra6969Data;
  const tableDataPCO = isEditing
    ? [...pcoData, { key: "add-row", isAddRow: true }]
    : pcoData;

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={24} md={24} lg={24}>
          <div className="card-head pd1586">PD1586</div>
          <Table
            columns={PD1586_COLUMNS}
            dataSource={tableDataPD1586}
            size="small"
            pagination={false}
            bordered
            showHeader={true}
            style={{ marginBottom: 24 }}
            rowKey="key"
            components={{
              body: {
                row: (props) => {
                  if (props["data-row-key"] === "add-row") {
                    return (
                      <tr>
                        <td
                          colSpan={PD1586_COLUMNS.length}
                          style={{ textAlign: "center" }}
                        >
                          <Button
                            type="primary"
                            onClick={handleAddNewDataPD1586}
                            style={{ marginRight: 8 }}
                            size="small"
                            className="add-new-data-btn"
                          >
                            Add New
                          </Button>
                          <Button
                            danger
                            type="primary"
                            onClick={handleRemoveLastRowPD1586}
                            disabled={pd1586Data.length <= 1}
                            size="small"
                            className="remove-row-data-btn"
                          >
                            Remove
                          </Button>
                        </td>
                      </tr>
                    );
                  }
                  return <tr {...props} />;
                },
              },
            }}
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={24} md={24} lg={24}>
          <div className="card-head ra8749">RA8749</div>
          <Table
            columns={RA8749_COLUMNS}
            dataSource={tableDataRA8749}
            size="small"
            pagination={false}
            bordered
            showHeader={true}
            style={{ marginBottom: 24 }}
            rowKey="key"
            components={{
              body: {
                row: (props) => {
                  if (props["data-row-key"] === "add-row") {
                    return (
                      <tr>
                        <td
                          colSpan={RA8749_COLUMNS.length}
                          style={{ textAlign: "center" }}
                        >
                          <Button
                            type="primary"
                            onClick={handleAddNewDataRA8749}
                            style={{ marginRight: 8 }}
                            size="small"
                            className="add-new-data-btn"
                          >
                            Add New
                          </Button>
                          <Button
                            danger
                            type="primary"
                            onClick={handleRemoveLastRowRA8749}
                            disabled={ra8749Data.length <= 1}
                            size="small"
                            className="remove-row-data-btn"
                          >
                            Remove
                          </Button>
                        </td>
                      </tr>
                    );
                  }
                  return <tr {...props} />;
                },
              },
            }}
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={24} md={24} lg={24}>
          <div className="card-head ra9275">RA9275</div>
          <Table
            columns={RA9275_COLUMNS}
            dataSource={tableDataRA9275}
            size="small"
            pagination={false}
            bordered
            showHeader={true}
            style={{ marginBottom: 24 }}
            rowKey="key"
            components={{
              body: {
                row: (props) => {
                  if (props["data-row-key"] === "add-row") {
                    return (
                      <tr>
                        <td
                          colSpan={RA9275_COLUMNS.length}
                          style={{ textAlign: "center" }}
                        >
                          <Button
                            type="primary"
                            onClick={handleAddNewDataRA9275}
                            style={{ marginRight: 8 }}
                            size="small"
                            className="add-new-data-btn"
                          >
                            Add New
                          </Button>
                          <Button
                            danger
                            type="primary"
                            onClick={handleRemoveLastRowRA9275}
                            disabled={ra9275Data.length <= 1}
                            size="small"
                            className="remove-row-data-btn"
                          >
                            Remove
                          </Button>
                        </td>
                      </tr>
                    );
                  }
                  return <tr {...props} />;
                },
              },
            }}
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={24} md={24} lg={24}>
          <div className="card-head ra6969">RA6969</div>
          <Table
            columns={RA6969_COLUMNS}
            dataSource={tableDataRA6969}
            size="small"
            pagination={false}
            bordered
            showHeader={true}
            style={{ marginBottom: 24 }}
            rowKey="key"
            components={{
              body: {
                row: (props) => {
                  if (props["data-row-key"] === "add-row") {
                    return (
                      <tr>
                        <td
                          colSpan={RA6969_COLUMNS.length}
                          style={{ textAlign: "center" }}
                        >
                          <Button
                            type="primary"
                            onClick={handleAddNewDataRA6969}
                            style={{ marginRight: 8 }}
                            size="small"
                            className="add-new-data-btn"
                          >
                            Add New
                          </Button>
                          <Button
                            danger
                            type="primary"
                            onClick={handleRemoveLastRowRA6969}
                            disabled={ra6969Data.length <= 1}
                            size="small"
                            className="remove-row-data-btn"
                          >
                            Remove
                          </Button>
                        </td>
                      </tr>
                    );
                  }
                  return <tr {...props} />;
                },
              },
            }}
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={24} md={24} lg={24}>
          <div className="card-head pco">PCO Accreditation</div>
          <Table
            columns={PCO_COLUMNS}
            dataSource={tableDataPCO}
            size="small"
            pagination={false}
            bordered
            showHeader={true}
            style={{ marginBottom: 24 }}
            rowKey="key"
            components={{
              body: {
                row: (props) => {
                  if (props["data-row-key"] === "add-row") {
                    return (
                      <tr>
                        <td
                          colSpan={PCO_COLUMNS.length}
                          style={{ textAlign: "center" }}
                        >
                          <Button
                            type="primary"
                            onClick={handleAddNewDataPCO}
                            style={{ marginRight: 8 }}
                            size="small"
                            className="add-new-data-btn"
                          >
                            Add New
                          </Button>
                          <Button
                            danger
                            type="primary"
                            onClick={handleRemoveLastRowPCO}
                            disabled={pcoData.length <= 1}
                            size="small"
                            className="remove-row-data-btn"
                          >
                            Remove
                          </Button>
                        </td>
                      </tr>
                    );
                  }
                  return <tr {...props} />;
                },
              },
            }}
          />
        </Col>
      </Row>
    </div>
  );
};

export default Permits;
