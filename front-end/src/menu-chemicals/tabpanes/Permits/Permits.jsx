import React, { useState, useEffect } from "react";
import {
  Row,
  Col,
  Card,
  Input,
  ConfigProvider,
  AutoComplete,
  Table,
  Button,
  Form,
  Popconfirm,
} from "antd";
import {
  FileProtectOutlined,
  SafetyCertificateOutlined,
  ExperimentOutlined,
  IdcardOutlined,
  EditOutlined,
  SaveOutlined,
  CloseOutlined,
} from "@ant-design/icons";
import "./permits.css";

const { TextArea } = Input;

const Permits = ({ record, isEditing, handleChange }) => {
  if (!record) return null;

  // Chemical Permits Table State
  const chemCodes = (record.chem_permit_code || "")
    .split("\n")
    .map((v) => v.trim())
    .filter(Boolean);
  const chemIssued = (record.chem_issued || "")
    .split("\n")
    .map((v) => v.trim());
  const chemExp = (record.chem_expiration || "")
    .split("\n")
    .map((v) => v.trim());

  const [editingKey, setEditingKey] = useState("");

  const [chemData, setChemData] = useState(
    chemCodes.map((code, idx) => ({
      key: idx,
      code,
      issued: chemIssued[idx] || "",
      expiration: chemExp[idx] || "",
    }))
  );

  const [form] = Form.useForm();

  useEffect(() => {
    setChemData(
      chemCodes.map((code, idx) => ({
        key: idx,
        code,
        issued: chemIssued[idx] || "",
        expiration: chemExp[idx] || "",
      }))
    );
    setEditingKey("");
  }, [record]);

  const isRowEditing = (row) => row.key === editingKey;

  const edit = (row) => {
    form.setFieldsValue({
      code: "",
      issued: "",
      expiration: "",
      ...row,
    });
    setEditingKey(row.key);
  };

  const cancel = () => {
    setEditingKey("");
  };

  const save = async (key) => {
    try {
      const row = await form.validateFields();
      const newData = [...chemData];
      const index = newData.findIndex((item) => key === item.key);
      if (index > -1) {
        newData[index] = { ...newData[index], ...row };
        setChemData(newData);
        setEditingKey("");
        if (isEditing && handleChange) {
          const codes = newData.map((item) => item.code).join("\n");
          const issued = newData.map((item) => item.issued).join("\n");
          const expiration = newData.map((item) => item.expiration).join("\n");
          handleChange("chem_permit_code", codes);
          handleChange("chem_issued", issued);
          handleChange("chem_expiration", expiration);
        }
      }
    } catch (errInfo) {
      // Validation failed
    }
  };

  const chemColumns = [
    {
      title: "Chemical Permit Code",
      dataIndex: "code",
      key: "code",
      align: "center",
      width: 200,
      editable: true,
    },
    {
      title: "Issued",
      dataIndex: "issued",
      key: "issued",
      align: "center",
      width: 120,
      editable: true,
    },
    {
      title: "Expiration",
      dataIndex: "expiration",
      key: "expiration",
      align: "center",
      width: 120,
      editable: true,
    },
    {
      title: "Action",
      key: "action",
      align: "center",
      width: 80,
      render: (_, rec) => {
        const editable = isRowEditing(rec);
        return isEditing ? (
          editable ? (
            <span>
              <Button
                icon={<SaveOutlined />}
                type="primary"
                style={{ marginRight: 8, padding: 0 }}
                onClick={() => save(rec.key)}
              />
              <Popconfirm title="Cancel changes?" onConfirm={cancel}>
                <Button
                  icon={<CloseOutlined />}
                  type="primary"
                  danger
                  style={{ padding: 0 }}
                />
              </Popconfirm>
            </span>
          ) : (
            <Button
              icon={<EditOutlined />}
              type="primary"
              disabled={editingKey !== ""}
              onClick={() => edit(rec)}
              style={{ padding: 0 }}
            />
          )
        ) : null;
      },
    },
  ];

  const mergedChemColumns = chemColumns.map((col) => {
    if (!col.editable) return col;
    return {
      ...col,
      onCell: (row) => ({
        record: row,
        inputType: "text",
        dataIndex: col.dataIndex,
        title: col.title,
        editing: isRowEditing(row),
      }),
    };
  });

  // Editable cell for chemical permits
  const EditableCell = ({
    editing,
    dataIndex,
    title,
    inputType,
    record,
    index,
    children,
    ...restProps
  }) => (
    <td {...restProps}>
      {editing ? (
        <Form.Item
          name={dataIndex}
          style={{ margin: 0 }}
          rules={[
            {
              required: false,
              message: `Please Input ${title}!`,
            },
          ]}
        >
          <Input size="small" />
        </Form.Item>
      ) : (
        children
      )}
    </td>
  );

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card
            title={
              <div className="card-title pd1586">
                PD1586
              </div>
            }
            size="small"
            headStyle={{ padding: 0 }}
          >
            <Row gutter={[8, 8]} className="permit-row">
              <Col span={6}>
                <label className="permit-label">ECC/CNC Code:</label>
              </Col>
              
              <Col span={12}>
                <Input
                  className="permit-input"
                  value={record.ecc_cnc || ""}
                  readOnly={!isEditing}
                  placeholder="ECC Reference No."
                  onChange={
                    isEditing && handleChange
                      ? (e) => handleChange("ecc_cnc", e.target.value)
                      : undefined
                  }
                />
              </Col>
            </Row>

            <Row gutter={[8, 8]} className="permit-row">
              <Col span={6}>
                <label className="permit-label">Process Source:</label>
              </Col>
              <Col span={12}>
                <ConfigProvider
                  theme={{
                    components: {
                      AutoComplete: {
                        optionFontSize: 10,
                        colorTextPlaceholder: "#555",
                        fontSize: "12px",
                        boxShadow: "none",
                      },
                    },
                  }}
                >
                  <AutoComplete
                    className="permit-input"
                    style={{
                      width: "100%",
                    }}
                    dropdownStyle={{
                      boxShadow: "none",
                      fontSize: "10px",
                    }}
                    options={[
                      { value: "ECC Manual" },
                      { value: "ECC Online" },
                      { value: "ECC EMB CO" },
                      { value: "CNC Manual" },
                      { value: "CNC Online" },
                    ]}
                    value={record.permit_process || ""}
                    onChange={
                      isEditing && handleChange
                        ? (v) => handleChange("permit_process", v)
                        : undefined
                    }
                    allowClear={true}
                    readOnly={!isEditing}
                  >
                    <Input
                      placeholder="Select ECC Process Permit Type"
                      readOnly={!isEditing}
                      className="permit-input"
                    />
                  </AutoComplete>
                </ConfigProvider>
              </Col>
            </Row>

            <Row gutter={[8, 8]} className="permit-row">
              <Col span={6}>
                <label className="permit-label">Date Approved:</label>
              </Col>
              <Col span={12}>
                <Input
                  className="permit-input"
                  value={record.date_approved || ""}
                  readOnly={!isEditing}
                  placeholder="ECC Date Approved"
                  onChange={
                    isEditing && handleChange
                      ? (e) => handleChange("date_approved", e.target.value)
                      : undefined
                  }
                />
              </Col>
            </Row>

            <Row gutter={[8, 8]}>
              <Col span={6}>
                <label className="permit-label">Date Amended:</label>
              </Col>
              <Col span={12}>
                <Input
                  className="permit-input"
                  value={record.date_amended || ""}
                  readOnly={!isEditing}
                  placeholder="ECC Date Amended"
                  onChange={
                    isEditing && handleChange
                      ? (e) => handleChange("date_amended", e.target.value)
                      : undefined
                  }
                />
              </Col>
            </Row>
          </Card>
        </Col>



        <Col xs={24} md={12}>
          <Card
            title={
              <div className="card-title ra8749">
                RA8749
              </div>
            }
            size="small"
            headStyle={{ padding: 0 }}
          >
            <Row gutter={[8, 8]} className="permit-row">
              <Col span={6}>
                <label className="permit-label">PTO Code:</label>
              </Col>
              
              <Col span={12}>
                <TextArea
                rows={1}
                  className="permit-input"
                  value={record.pto_code || ""}
                  readOnly={!isEditing}
                  placeholder="ECC Reference No."
                  onChange={
                    isEditing && handleChange
                      ? (e) => handleChange("pto_code", e.target.value)
                      : undefined
                  }
                />
              </Col>
            </Row>

            <Row gutter={[8, 8]} className="permit-row">
              <Col span={6}>
                <label className="permit-label">Date Issued:</label>
              </Col>
              <Col span={12}>
                <TextArea
                rows={1}
                  className="permit-input"
                  value={record.pto_issued || ""}
                  readOnly={!isEditing}
                  placeholder="date issued"
                  onChange={
                    isEditing && handleChange
                      ? (e) => handleChange("pto_issued", e.target.value)
                      : undefined
                  }
                />
              </Col>
            </Row>

            <Row gutter={[8, 8]}>
              <Col span={6}>
                <label className="permit-label">Date of Expiration:</label>
              </Col>
              <Col span={12}>
                <TextArea
                rows={1}
                  className="permit-input"
                  value={record.pto_expiration || ""}
                  readOnly={!isEditing}
                  placeholder="ECC Date Approved"
                  onChange={
                    isEditing && handleChange
                      ? (e) => handleChange("pto_expiration", e.target.value)
                      : undefined
                  }
                />
              </Col>
            </Row>

            <Row gutter={[8, 8]}>
              <Col span={6}>
                
              </Col>
              <Col span={12}>
               
              </Col>
            </Row>
          </Card>
        </Col>


       
        <Col xs={24} md={12}>
          <Card
            title={
              <div className="card-title ra9275">
                RA8749
              </div>
            }
            size="small"
            headStyle={{ padding: 0 }}
          >
            <Row gutter={[8, 8]} className="permit-row">
              <Col span={6}>
                <label className="permit-label">WWDP Code:</label>
              </Col>
              
              <Col span={12}>
                <TextArea
                rows={2}
                  className="permit-input"
                  value={record.wwdp_code || ""}
                  readOnly={!isEditing}
                  placeholder="WWDP Reference No."
                  onChange={
                    isEditing && handleChange
                      ? (e) => handleChange("wwdp_code", e.target.value)
                      : undefined
                  }
                />
              </Col>
            </Row>

            <Row gutter={[8, 8]} className="permit-row">
              <Col span={6}>
                <label className="permit-label">Date Issued:</label>
              </Col>
              <Col span={12}>
                <Input
                  className="permit-input"
                  value={record.wwdp_issued || ""}
                  readOnly={!isEditing}
                  placeholder="date issued"
                  onChange={
                    isEditing && handleChange
                      ? (e) => handleChange("wwdp_issued", e.target.value)
                      : undefined
                  }
                />
              </Col>
            </Row>

            <Row gutter={[8, 8]}>
              <Col span={6}>
                <label className="permit-label">Date of Expiration:</label>
              </Col>
              <Col span={12}>
                <Input
                  className="permit-input"
                  value={record.wwdp_expiration || ""}
                  readOnly={!isEditing}
                  placeholder="date of expiration"
                  onChange={
                    isEditing && handleChange
                      ? (e) => handleChange("wwdp_expiration", e.target.value)
                      : undefined
                  }
                />
              </Col>
            </Row>

            <Row gutter={[8, 8]}>
              <Col span={6}>
                
              </Col>
              <Col span={12}>
               
              </Col>
            </Row>
          </Card>
        </Col>


        <Col xs={24} md={12}>
          <Card
            title={
              <div className="card-title ra6969">
                <IdcardOutlined style={{ color: "#415e20" }} /> RA6969 (HWG ID)
              </div>
            }
            size="small"
            headStyle={{ padding: 0 }}
            className="ra6969-card"
          >
            <Row gutter={[8, 8]}>
              <Col span={24}>
                <label className="permit-label">HWG ID Code:</label>
                <Input
                  className="permit-input"
                  value={record.haz_id || ""}
                  size="small"
                  readOnly={!isEditing}
                  placeholder="HWG ID Code"
                  onChange={
                    isEditing && handleChange
                      ? (e) => handleChange("haz_id", e.target.value)
                      : undefined
                  }
                />
              </Col>
              <Col span={24}>
                <label className="permit-label">HWG ID Date Issued:</label>
                <Input
                  className="permit-input"
                  value={record.haz_id_issued || ""}
                  size="small"
                  readOnly={!isEditing}
                  placeholder="HWG ID Date Issued"
                  onChange={
                    isEditing && handleChange
                      ? (e) => handleChange("haz_id_issued", e.target.value)
                      : undefined
                  }
                />
              </Col>
            </Row>
          </Card>
        </Col>


        {/* Third Row: PCO */}
        <Col xs={24}>
          <Card
            title={
              <div className="card-title pco">
                <IdcardOutlined style={{ color: "#242726" }} /> PCO
              </div>
            }
            size="small"
            headStyle={{ padding: 0 }}
            className="pco-card"
          >
            <Row gutter={[8, 8]}>
              <Col span={6}>
                <label className="permit-label">PCO Code:</label>
                <Input
                  className="permit-input"
                  value={record.pco_code || ""}
                  size="small"
                  readOnly={!isEditing}
                  placeholder="PCO Code"
                  onChange={
                    isEditing && handleChange
                      ? (e) => handleChange("pco_code", e.target.value)
                      : undefined
                  }
                />
              </Col>
              <Col span={6}>
                <label className="permit-label">PCO Name:</label>
                <Input
                  className="permit-input"
                  value={record.pco_name || ""}
                  size="small"
                  readOnly={!isEditing}
                  placeholder="PCO Name"
                  onChange={
                    isEditing && handleChange
                      ? (e) => handleChange("pco_name", e.target.value)
                      : undefined
                  }
                />
              </Col>
              <Col span={6}>
                <label className="permit-label">Contact:</label>
                <Input
                  className="permit-input"
                  value={record.pco_tel_no || ""}
                  size="small"
                  readOnly={!isEditing}
                  placeholder="Contact"
                  onChange={
                    isEditing && handleChange
                      ? (e) => handleChange("pco_tel_no", e.target.value)
                      : undefined
                  }
                />
              </Col>
              <Col span={6}>
                <label className="permit-label">Validity Date:</label>
                <Input
                  className="permit-input"
                  value={record.pco_validity || ""}
                  size="small"
                  readOnly={!isEditing}
                  placeholder="Validity Date"
                  onChange={
                    isEditing && handleChange
                      ? (e) => handleChange("pco_validity", e.target.value)
                      : undefined
                  }
                />
              </Col>
            </Row>
          </Card>
        </Col>



        {/* Chemical Permits Table */}
        <Col xs={24}>
          <Card
            title={<div className="card-title chem">Chemical Permits</div>}
            size="small"
            headStyle={{ padding: 0 }}
            className="chem-card"
            style={{ marginTop: 16 }}
          >
            <Form form={form} component={false}>
              <Table
                components={{
                  body: {
                    cell: EditableCell,
                  },
                }}
                columns={mergedChemColumns}
                dataSource={chemData}
                size="small"
                pagination={false}
                bordered
                rowKey="key"
              />
            </Form>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Permits;
