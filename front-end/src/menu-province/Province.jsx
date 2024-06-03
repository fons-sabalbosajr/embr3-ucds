//#region "imports"
import React, { useContext, useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import {
  Table,
  Input,
  Tooltip,
  Button,
  Modal,
  Progress,
  Select,
  Pagination,
  Tabs,
  Row,
  Col,
  Checkbox,
  Typography,
  Card,
  DatePicker,
  Space,
  Spin,
  TimePicker,
  notification,
} from "antd";
import {
  SearchOutlined,
  EyeOutlined,
  ExclamationCircleOutlined,
  DeleteOutlined,
  PlusOutlined,
  MinusOutlined,
  ReloadOutlined, // Add the reload icon
} from "@ant-design/icons";
import { DataContext } from "./DataContext";
import "./province.css";

import TextArea from "antd/es/input/TextArea";
import IndustryTypeAutoComplete from "../components/IndustryType";
import IndustrySubTypeAutoComplete from "../components/IndustrySubType";
import IndustryClassAutoComplete from "../components/IndustryClass";
import InspectionTypeAutoComplete from "../components/InspectionType";
import InspectorsAutoComplete from "../components/Inspectors";
import MonthAutoComplete from "../components/Month";
import PermitSourceAutoComplete from "../components/PermitSource";
import ReportTypeAutoComplete from "../components/ReportType";
import SectionInChargeAutoComplete from "../components/SectionInCharge";
import R3MapAutoComplete from "../components/R3Map";
import moment from "moment";
import styled from "styled-components";
import InspectorTCCompliance from "../components/InspectorTCCompliance";

// Utility function to capitalize the first letter of a string
const capitalizeFirstLetter = (str) => {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

const normalizeAndSplit = (str) => {
  return str
    .replace(/_/g, ' ') // Replace underscores with spaces
    .replace(/\s+/g, ' ') // Replace multiple spaces with a single space
    .split(/(?<!,\s)[\n,]/) // Split by new lines and commas
    .map((s, i, arr) => {
      if (i < arr.length - 1 && arr[i + 1] && arr[i + 1].trim().startsWith(',')) {
        return s.trim() + ', ';
      }
      return s.trim();
    }) // Trim each string and add ", " if the next element starts with a comma
    .filter(s => s); // Remove empty strings
};

//#endregion

const { Option } = Select;
const { TabPane } = Tabs;
const { Paragraph } = Typography;
const BoldTab = styled.span`
  font-weight: 600;
  font-size: 16px;
`;

const Province = ({ theme }) => {
  const { provinceName } = useParams();
  const { data, loading, error, currentProvince, setCurrentProvince } =
    useContext(DataContext);
  const { fetchData } = useContext(DataContext);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const capitalizedProvinceName = capitalizeFirstLetter(provinceName);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [originalRecord, setOriginalRecord] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [shouldRefreshTable, setShouldRefreshTable] = useState(false);
  const [filteredData, setFilteredData] = useState([]);
  const [tableLoading, setTableLoading] = useState(false);
  const { confirm } = Modal;

 
  const [rowsPTO, setRowsPTO] = useState([Date.now()]);
  const [rowsDP, setRowsDP] = useState([Date.now()]);
  const [rowsHAZ, setRowsHAZ] = useState([Date.now()]);
  const [rowsCHEM, setRowsCHEM] = useState(
    Array.from({ length: 5 }, (_, index) => index + 1)
  );
  const [showAllRowsCHEM, setShowAllRowsCHEM] = useState(false);
  const [rowsPCO, setRowsPCO] = useState([Date.now()]);

  const maxRows = 3;
  const maxRowsECC = 3;
  const maxRowsPTO = 5;
  const maxRowsDP = 5;
  const maxRowsHAZ = 5;
  const maxRowsCHEM = 100;
  const maxRowsPCO = 5;
  const dateFormat = "MM/DD/YYYY";
  const timeFormat = "h:mm A";

  const [rows, setRows] = useState([]);
  const [sectionInCharge, setSectionInCharge] = useState([]);
  const [handler, setHandler] = useState([]);
  const [rowsECC, setRowsECC] = useState([Date.now()]);

  useEffect(() => {
    if (selectedRecord && isEditing) {
      const sectionInChargeData = normalizeAndSplit(selectedRecord.section_incharge);
      const handlerData = normalizeAndSplit(selectedRecord.handler);
      

      setRows(sectionInChargeData.map((_, index) => ({ key: index })));
      setSectionInCharge(sectionInChargeData);
      //setRowsECC(selectedRecord.ecc_cnc.map((_, index) => ({ key: index })));
      setHandler(handlerData);
    }
  }, [selectedRecord, isEditing]);

  const handleSectionInChargeChange = (index, value) => {
    const newSectionInCharge = [...sectionInCharge];
    newSectionInCharge[index] = value;
    setSectionInCharge(newSectionInCharge);
  };

  const handleHandlerChange = (index, value) => {
    const newHandler = [...handler];
    newHandler[index] = value;
    setHandler(newHandler);
  };

  const handleAddRowsec = () => {
    setRows([...rows, { key: rows.length }]);
    setSectionInCharge([...sectionInCharge, ""]);
    setHandler([...handler, ""]);
  };

  const handleRemoveRowsec = (index) => {
    const newRows = rows.filter((_, i) => i !== index);
    const newSectionInCharge = sectionInCharge.filter((_, i) => i !== index);
    const newHandler = handler.filter((_, i) => i !== index);

    setRows(newRows);
    setSectionInCharge(newSectionInCharge);
    setHandler(newHandler);
  };
  
  const formatNumber = (number) => {
    return new Intl.NumberFormat("en-US").format(number);
  };

 
//#region initialDate================================================================
  const initialDateMonitored = selectedRecord?.date_monitored
    ? moment(selectedRecord.date_monitored, dateFormat)
    : null;

  const initialDateRouted = selectedRecord?.date_routed
    ? moment(selectedRecord.date_routed, dateFormat)
    : null;

  const initialDateSigned = selectedRecord?.date_signed
    ? moment(selectedRecord.date_signed, dateFormat)
    : null;

  const initialDateApprovedECC = selectedRecord?.date_approved
    ? moment(selectedRecord.date_approved, dateFormat)
    : null;

  const initialDateAmendECC = selectedRecord?.date_amend
    ? moment(selectedRecord.date_amend, dateFormat)
    : null;

  const DateIssuedPTO = selectedRecord?.pto_issued
    ? moment(selectedRecord.pto_issued, dateFormat)
    : null;

  const DateExpPTO = selectedRecord?.pto_expiration
    ? moment(selectedRecord.pto_expiration, dateFormat)
    : null;

  const DateIssuedWWDP = selectedRecord?.wwdp_issued
    ? moment(selectedRecord.wwdp_issued, dateFormat)
    : null;
  const DateExpWWDP = selectedRecord?.wwdp_expiration
    ? moment(selectedRecord.wwdp_expiration, dateFormat)
    : null;

  const DateIssuedHW = selectedRecord?.haz_issued
    ? moment(selectedRecord.haz_issued, dateFormat)
    : null;

  const DateExpTSD = selectedRecord?.tsd_expiration
    ? moment(selectedRecord.tsd_expiration, dateFormat)
    : null;

  const DateExpTP = selectedRecord?.tp_trc_expiration
    ? moment(selectedRecord.tp_trc_expiration, dateFormat)
    : null;

  const DateIssuedChem = selectedRecord?.chem_permit_issued
    ? moment(selectedRecord.chem_permit_issued, dateFormat)
    : null;

  const DateExpChem = selectedRecord?.chem_permit_exp
    ? moment(selectedRecord.chem_permit_exp, dateFormat)
    : null;

  const DateForwardedLegal = selectedRecord?.date_forwarded
    ? moment(selectedRecord.date_forwarded, dateFormat)
    : null;

  const DateValPCO = selectedRecord?.pco_validity
    ? moment(selectedRecord.pco_validity, dateFormat)
    : null;

  const DateApprovedChiefLegal = selectedRecord?.date_approved_clegal
    ? moment(selectedRecord.date_approved_clegal, dateFormat)
    : null;

  const DateNOVRelease = selectedRecord?.nov_released
    ? moment(selectedRecord.nov_released, dateFormat)
    : null;

  const DateTCShed = selectedRecord?.tc_date_sched
    ? moment(selectedRecord.tc_date_sched, dateFormat)
    : null;

  const DateTCActual = selectedRecord?.tc_date_actual
    ? moment(selectedRecord.tc_date_actual, dateFormat)
    : null;

  const DateTCTime = selectedRecord?.time
    ? moment(selectedRecord.time, timeFormat)
    : null;

  const DatePenalty = selectedRecord?.penalty
    ? moment(selectedRecord.penalty, dateFormat)
    : null;
//#endregion


  const handleAddRowECC = () => {
    if (rowsECC.length < maxRowsECC) {
      setRowsECC([...rowsECC, Date.now()]);
    }
  };

  const handleRemoveRowECC = () => {
    if (rowsECC.length > 1) {
      setRowsECC(rowsECC.slice(0, -1));
    }
  };

  const handleAddRowPTO = () => {
    if (rowsPTO.length < maxRowsPTO) {
      setRowsPTO([...rowsPTO, Date.now()]);
    }
  };

  const handleRemoveRowPTO = () => {
    if (rowsPTO.length > 1) {
      setRowsPTO(rowsPTO.slice(0, -1));
    }
  };

  const handleAddRowDP = () => {
    if (rowsDP.length < maxRowsDP) {
      setRowsDP([...rowsDP, Date.now()]);
    }
  };

  const handleRemoveRowDP = () => {
    if (rowsDP.length > 1) {
      setRowsDP(rowsDP.slice(0, -1));
    }
  };

  const handleAddRowHAZ = () => {
    if (rowsHAZ.length < maxRowsHAZ) {
      setRowsHAZ([...rowsHAZ, Date.now()]);
    }
  };

  const handleRemoveRowHAZ = () => {
    if (rowsHAZ.length > 1) {
      setRowsHAZ(rowsHAZ.slice(0, -1));
    }
  };

  const handleAddRowCHEM = () => {
    if (rowsCHEM.length < maxRowsCHEM) {
      setRowsCHEM([...rowsCHEM, rowsCHEM.length + 1]);
    }
  };

  const handleRemoveRowCHEM = () => {
    if (rowsCHEM.length > 1) {
      setRowsCHEM(rowsCHEM.slice(0, -1));
    }
  };

  const handleAddRowPCO = () => {
    if (rowsPCO.length < maxRowsPCO) {
      setRowsPCO([...rowsPCO, rowsPCO.length + 1]);
    }
  };

  const handleRemoveRowPCO = () => {
    if (rowsPCO.length > 1) {
      setRowsPCO(rowsPCO.slice(0, -1));
    }
  };

  useEffect(() => {
    if (provinceName) {
      setCurrentProvince(provinceName);
    }
  }, [provinceName]);

  useEffect(() => {
    if (shouldRefreshTable) {
      fetchData(provinceName);
      setShouldRefreshTable(false);
    }
  }, [shouldRefreshTable, fetchData, provinceName]);

  const filterData = (data, searchTerm) => {
    return data.filter((item) =>
      Object.values(item).some(
        (value) =>
          typeof value === "string" &&
          value.toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
  };

  useEffect(() => {
    const filtered = filterData(data, searchTerm);
    setFilteredData(filtered);
  }, [data, searchTerm]);

  useEffect(() => {
    setTableLoading(loading);
  }, [loading]);

  const showModal = (record) => {
    setSelectedRecord(record);
    setOriginalRecord(record);
    setIsEditing(false);
    setModalVisible(true);
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setSelectedRecord(null);
    setIsEditing(false);
    //setShouldRefreshTable(true); // Trigger table refresh
  };

  const handleCancel = () => {
    setSelectedRecord(originalRecord);
    setIsEditing(false); // Exit edit mode
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSave = async () => {
    try {
      const response = await axios.put(
        `http://localhost:8081/api/update-data/${selectedRecord.id_no}` ||
        `https://embr3-ucds.onrender.com/api/update-data/${selectedRecord.id_no}`,
        selectedRecord
      );

      if (response.status === 200) {
        console.log("Data updated successfully:", response.data);
        setIsEditing(false);
        setOriginalRecord(selectedRecord);
        setShouldRefreshTable(true);
        await fetchData(provinceName);

        notification.success({
          message: "Success",
          description: "Data updated successfully.",
          duration: 3,
        });

        setTimeout(() => {
          setCurrentProvince(currentProvince);
        }, 1000);
      } else {
        console.error(
          "Failed to update data. Unexpected response status:",
          response.status
        );
        notification.warning({
          message: "Warning",
          description: "Failed to update data. Please reload the browser.",
          duration: 3,
        });
      }
    } catch (error) {
      console.error("Error updating data:", error);
      notification.error({
        message: "Error",
        description: "Failed to update data. Please try again.",
        duration: 3,
      });
    }
  };

  const handleChange = (field, value) => {
    setSelectedRecord((prevRecord) => ({
      ...prevRecord,
      [field]: value,
    }));
  };

  const handleReload = async () => {
    try {
      // Set table loading to true
      setTableLoading(true);

      // Fetch data again
      await fetchData(provinceName);

      // Filter the data
      const filtered = filterData(data, searchTerm);
      setFilteredData(filtered);
    } catch (error) {
      // Handle errors
      console.error("Error reloading data:", error);
    } finally {
      // Reset table loading state
      setTableLoading(false);
    }
  };

  const showCancelPrompt = () => {
    confirm({
      title: "Are you sure you want to cancel editing?",
      icon: <ExclamationCircleOutlined />,
      content: "Any unsaved changes will be lost.",
      okText: "Yes, Cancel",
      okType: "primary",
      cancelText: "No, Keep Editing",
      //transitionName: 'zoom',
      onOk() {
        handleCancel();
      },
      onCancel() {
        //console.log("Keep editing");
      },
    });
  };

  const columns = [
    {
      title: "ID No.",
      dataIndex: "id_no",
      key: "id_no",
      width: 100,
    },
    {
      title: "Industry Details",
      key: "industryDetails",
      render: (text, record) => (
        <>
          <strong>{record.title}</strong>
          <br />
          Proponent Name: <i>{record.name}</i>
          <br />
          Address: {record.address}
          <br />
          ECC/CNC Ref. No.:{" "}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault(); // Prevent default anchor behavior
              showModal(record); // Open the modal
            }}
          >
            {record.ecc_cnc}
          </a>
        </>
      ),
      align: "left",
    },
    {
      title: "Industry Classification",
      key: "industry_class",
      render: (text, record) => <>{record.industry_class}</>,
      align: "left",
    },
    {
      title: "Remarks/Recommendations",
      key: "remarks_recommendations",
      render: (text, record) => <>{record.remarks_recommendations}</>,
      align: "left",
    },
    {
      title: "Actions",
      key: "actions",
      render: (text, record) => (
        <Tooltip title="View Details">
          <Button
            icon={<EyeOutlined />}
            onClick={() => showModal(record)}
            type="primary"
          />
        </Tooltip>
      ),
    },
  ];

  return (
    <div>
      {error ? (
        <Card className="error-card">
          {" "}
          <strong>Oops... Something went wrong!</strong>
          <p>Try to reload the data again.</p>
          <Button type="primary" onClick={handleReload} loading={loading}>
            Reload
          </Button>
        </Card>
      ) : (
        <div>
          <Modal
            visible={modalVisible}
            title={
              <div className="modal-title-container">
                {" "}
                <span className="title-left">
                  Record ID: {selectedRecord?.id_no || "Unknown"}
                </span>
                <span>{selectedRecord?.title || ""}</span>
                <span className="title-right">
                  {selectedRecord?.ecc_cnc || ""}
                </span>
              </div>
            }
            onCancel={handleCloseModal}
            footer={[
              isEditing ? (
                <Button
                  key="cancel"
                  onClick={isEditing ? showCancelPrompt : handleCancel}
                >
                  {isEditing ? "Cancel" : "Close"}
                </Button>
              ) : (
                <Button key="close" type="primary" onClick={handleCloseModal}>
                  Close
                </Button>
              ),
              !isEditing ? (
                <Button key="edit" onClick={handleEdit}>
                  Edit
                </Button>
              ) : null,
              isEditing ? (
                <Button key="save" type="primary" onClick={handleSave}>
                  Save
                </Button>
              ) : null,
            ]}
            width={1300}
          >
            {selectedRecord ? (
              <Tabs defaultActiveKey="1" className="tab-font">
                {/* GENERAL INFORMATION */}
                <TabPane tab={<BoldTab>General Information</BoldTab>} key="1">
                  <Row gutter={[16, 16]}>
                    <Col xs={24} sm={24} md={12} lg={12} className="modalcol">
                      <Paragraph>
                        {" "}
                        <strong>Project Title:</strong>
                        <TextArea
                          className="poppins-textarea"
                          value={selectedRecord?.title || ""}
                          style={isEditing ? {} : { color: "#aaa" }}
                          disabled={!isEditing}
                          onChange={(e) =>
                            handleChange("title", e.target.value)
                          }
                          placeholder="no data"
                        />
                      </Paragraph>
                      <Paragraph>
                        <strong>Proponent Name:</strong>
                        <TextArea
                          className="poppins-textarea"
                          value={selectedRecord?.name || ""}
                          style={isEditing ? {} : { color: "#aaa" }}
                          disabled={!isEditing}
                          onChange={(e) => handleChange("name", e.target.value)}
                          placeholder="no data"
                        />
                      </Paragraph>
                      <Row gutter={[16, 16]}>
                        <Col
                          xs={24} // Full width on extra-small screens
                          sm={24} // Full width on small screens
                          md={12} // Half width on medium screens
                          lg={12}
                        >
                          <Paragraph>
                            <strong>Industry Classification</strong>
                            <IndustryClassAutoComplete
                              value={selectedRecord?.industry_class || ""}
                              disabled={!isEditing}
                              onChange={(value) =>
                                handleChange("industry_class", value)
                              }
                              style={{ width: "100%" }}
                            />
                          </Paragraph>
                        </Col>
                        <Col
                          xs={24} // Full width on extra-small screens
                          sm={24} // Full width on small screens
                          md={12} // Half width on medium screens
                          lg={12}
                          className="modalcol"
                        >
                          <Paragraph>
                            <strong>PSIC Code:</strong>
                            <Input
                              className="poppins-textarea"
                              value={selectedRecord?.psic_code || ""}
                              style={isEditing ? {} : { color: "#aaa" }}
                              disabled={!isEditing}
                              onChange={(e) =>
                                handleChange("psic_code", e.target.value)
                              }
                              placeholder="no data"
                            />
                          </Paragraph>
                        </Col>
                      </Row>
                      <Paragraph>
                        <strong>Industry Type:</strong> <br />
                        <IndustryTypeAutoComplete
                          value={selectedRecord?.industry_type || ""}
                          disabled={!isEditing}
                          onChange={(value) =>
                            handleChange("industry_type", value)
                          }
                        />
                      </Paragraph>

                      <Paragraph>
                        <strong>Industry Sub-Type:</strong>
                        <IndustrySubTypeAutoComplete
                          value={selectedRecord?.industry_subtype || ""}
                          disabled={!isEditing}
                          onChange={(value) =>
                            handleChange("industry_subtype", value)
                          }
                        />
                      </Paragraph>
                      <Paragraph>
                        <strong>Specific Project Type:</strong>
                        <Input
                          className="poppins-textarea"
                          value={selectedRecord?.proj_type || ""}
                          style={isEditing ? {} : { color: "#aaa" }}
                          disabled={!isEditing}
                          onChange={(e) =>
                            handleChange("proj_type", e.target.value)
                          }
                          placeholder="no data"
                        />
                      </Paragraph>
                    </Col>
                    <Col
                      xs={24} // Full width on extra-small screens
                      sm={24} // Full width on small screens
                      md={12} // Half width on medium screens
                      lg={12}
                    >
                      <Paragraph>
                        <strong>Complete Address:</strong>
                        <TextArea
                          className="poppins-textarea"
                          value={selectedRecord?.address || ""}
                          style={isEditing ? {} : { color: "#aaa" }}
                          disabled={!isEditing}
                          onChange={(e) =>
                            handleChange("address", e.target.value)
                          }
                          placeholder="no data"
                        />
                      </Paragraph>
                      <Paragraph>
                        <strong>Street:</strong>
                        <TextArea
                          className="poppins-textarea"
                          value={selectedRecord?.street || ""}
                          style={isEditing ? {} : { color: "#aaa" }}
                          disabled={!isEditing}
                          onChange={(e) =>
                            handleChange("street", e.target.value)
                          }
                          placeholder="no data"
                        />
                      </Paragraph>
                      <Paragraph>
                        <strong>Barangay:</strong>
                        <Input
                          className="poppins-textarea"
                          value={selectedRecord?.brgy || ""}
                          style={isEditing ? {} : { color: "#aaa" }}
                          disabled={!isEditing}
                          onChange={(e) => handleChange("brgy", e.target.value)}
                          placeholder="no data"
                        />
                      </Paragraph>
                      <Paragraph>
                        <strong>City/Municipality:</strong>
                        <Input
                          className="poppins-textarea"
                          value={selectedRecord?.city || ""}
                          style={isEditing ? {} : { color: "#aaa" }}
                          disabled={!isEditing}
                          onChange={(e) => handleChange("city", e.target.value)}
                          placeholder="no data"
                        />
                      </Paragraph>
                      <Paragraph>
                        <strong>Province:</strong> <br />
                        <Input
                          className="poppins-textarea"
                          value={selectedRecord?.province || ""}
                          style={isEditing ? {} : { color: "#aaa" }}
                          disabled={!isEditing}
                          onChange={(e) =>
                            handleChange("province", e.target.value)
                          }
                          placeholder="no data"
                        />
                      </Paragraph>
                    </Col>
                  </Row>
                </TabPane>

                {/* FOCAL PERSON */}
                <TabPane
                  tab={<BoldTab>Concerned Unit/Focal Person</BoldTab>}
                  key="2"
                >
                  <Row gutter={[16, 16]}>
                    <Col
                      xs={24} // Full width on extra-small screens
                      sm={24} // Full width on small screens
                      md={12} // Half width on medium screens
                      lg={12}
                    >
                      <Paragraph>
                        <strong>Number of Employees:</strong>
                        <Input
                          className="poppins-textarea"
                          value={selectedRecord?.emp_no_total || ""}
                          style={isEditing ? {} : { color: "#aaa" }}
                          disabled={!isEditing}
                          onChange={(e) =>
                            handleChange("emp_no_total", e.target.value)
                          }
                          placeholder="no data"
                        />
                      </Paragraph>

                      <Paragraph>
                        <strong>Bio-Oxygen Demand (kg/day)</strong>
                        <Input
                          className="poppins-textarea"
                          value={selectedRecord?.bod || ""}
                          style={isEditing ? {} : { color: "#aaa" }}
                          disabled={!isEditing}
                          onChange={(e) => handleChange("bod", e.target.value)}
                          placeholder="no data"
                        />
                      </Paragraph>

                      {rows.map((row, index) => (
                        <Row gutter={[16, 16]} key={row.key}>
                          <Col xs={24} sm={24} md={9} lg={9}>
                            <Paragraph>
                              <strong>Section/Unit In-Charged</strong>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  marginBottom: "8px",
                                }}
                              >
                                <SectionInChargeAutoComplete
                                  style={isEditing ? {} : { color: "#aaa" }}
                                  value={sectionInCharge[index] || ""}
                                  disabled={!isEditing}
                                  onChange={(value) =>
                                    handleSectionInChargeChange(index, value)
                                  }
                                />
                              </div>
                            </Paragraph>
                          </Col>
                          <Col xs={24} sm={24} md={9} lg={9}>
                            <Paragraph>
                              <strong>Inspector/Handler</strong> <br />
                              <InspectorsAutoComplete
                                style={isEditing ? {} : { color: "#aaa" }}
                                value={handler[index] || ""}
                                disabled={!isEditing}
                                onChange={(value) =>
                                  handleHandlerChange(index, value)
                                }
                              />
                            </Paragraph>
                          </Col>
                        </Row>
                      ))}
                      <Row gutter={[16, 16]}>
                        <Col
                          xs={24}
                          sm={24}
                          md={24}
                          lg={24}
                          style={{
                            textAlign: "left",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "flex-start",
                          }}
                        >
                          <Tooltip title="Add New In-charge">
                            <Button
                              type="primary"
                              icon={<PlusOutlined />}
                              onClick={handleAddRowsec}
                              className="btn-add"
                              disabled={rows.length >= maxRows}
                            />
                          </Tooltip>
                          {rows.length > 1 && (
                            <Tooltip title="Remove">
                              <Button
                                type="primary"
                                danger
                                icon={<MinusOutlined />}
                                onClick={() => handleRemoveRowsec(rows.length - 1)}
                                className="btn-remove"
                                style={{ marginLeft: "8px" }}
                              />
                            </Tooltip>
                          )}
                          {rows.length >= maxRows && (
                            <span className="text-warning">
                              Maximum number of sections reached ({maxRows})
                              only.
                              <br />
                              Please ask for your supervisor for assistance
                            </span>
                          )}
                        </Col>
                      </Row>

                      <Row gutter={[16, 16]}>
                        <Col
                          xs={24} // Full width on extra-small screens
                          sm={24} // Full width on small screens
                          md={12} // Half width on medium screens
                          lg={12}
                        >
                          <Paragraph>
                            <strong>Schedule of Monitoring</strong> <br />
                            <MonthAutoComplete
                              value={selectedRecord?.monitoring_sched || ""}
                              disabled={!isEditing}
                              onChange={(value) =>
                                handleChange("monitoring_sched", value)
                              }
                            />
                          </Paragraph>
                        </Col>
                      </Row>
                    </Col>

                    <Col
                      xs={24} // Full width on extra-small screens
                      sm={24} // Full width on small screens
                      md={12} // Half width on medium screens
                      lg={12}
                    >
                      <Paragraph>
                        <strong>IIS No.:</strong>
                        <Input
                          className="poppins-textarea"
                          value={selectedRecord?.iis_no || ""}
                          style={isEditing ? {} : { color: "#aaa" }}
                          disabled={!isEditing}
                          onChange={(e) =>
                            handleChange("iis_no", e.target.value)
                          }
                          placeholder="no data"
                        />
                      </Paragraph>

                      <Row gutter={[16, 16]}>
                        <Col
                          xs={24} // Full width on extra-small screens
                          sm={24} // Full width on small screens
                          md={12} // Half width on medium screens
                          lg={12}
                        >
                          <Paragraph>
                            <strong>Type of Inspection:</strong>
                            <InspectionTypeAutoComplete
                              style={isEditing ? {} : { color: "#aaa" }}
                              value={selectedRecord?.insp_type || ""}
                              disabled={!isEditing}
                              onChange={(value) =>
                                handleChange("insp_type", value)
                              }
                            />
                          </Paragraph>
                        </Col>
                        <Col
                          xs={24} // Full width on extra-small screens
                          sm={24} // Full width on small screens
                          md={12} // Half width on medium screens
                          lg={12}
                        >
                          <Paragraph>
                            <strong>Type of Report Submitted:</strong>
                            <ReportTypeAutoComplete
                              style={isEditing ? {} : { color: "#aaa" }}
                              value={selectedRecord?.report_type || ""}
                              disabled={!isEditing}
                              onChange={(value) =>
                                handleChange("report_type", value)
                              }
                            />
                          </Paragraph>
                        </Col>
                      </Row>

                      <Row gutter={[16, 16]}>
                        <Col
                          xs={24} // Full width on extra-small screens
                          sm={24} // Full width on small screens
                          md={8} // Half width on medium screens
                          lg={8}
                        >
                          <Paragraph>
                            <strong>Date Monitored:</strong>
                            <DatePicker
                              value={initialDateMonitored} // Set the initial value from the selected record
                              format={dateFormat} // Define the desired date format
                              disabled={!isEditing} // Disable if not in editing mode
                              onChange={(date, dateString) => {
                                handleChange("date_monitored", dateString);
                              }}
                              placeholder="Select date" // Placeholder for the date picker
                              style={{ width: "100%" }}
                            />
                          </Paragraph>
                        </Col>
                        <Col
                          xs={24} // Full width on extra-small screens
                          sm={24} // Full width on small screens
                          md={8} // Half width on medium screens
                          lg={8}
                        >
                          <Paragraph>
                            <strong>Date Routed (IIS):</strong>
                            <DatePicker
                              value={initialDateRouted} // Set the initial value from the selected record
                              format={dateFormat} // Define the desired date format
                              disabled={!isEditing} // Disable if not in editing mode
                              onChange={(date, dateString) => {
                                handleChange("date_routed", dateString);
                              }}
                              placeholder="Select date" // Placeholder for the date picker
                              style={{ width: "100%" }}
                            />
                          </Paragraph>
                        </Col>
                        <Col
                          xs={24} // Full width on extra-small screens
                          sm={24} // Full width on small screens
                          md={8} // Half width on medium screens
                          lg={8}
                        >
                          <Paragraph>
                            <span className="label_container">
                              <strong className="label_title">
                                Date Signed:
                              </strong>
                              <p className="label">
                                (forwarded to focal person)
                              </p>
                            </span>
                            <DatePicker
                              value={initialDateSigned} // Set the initial value from the selected record
                              format={dateFormat} // Define the desired date format
                              disabled={!isEditing} // Disable if not in editing mode
                              onChange={(date, dateString) => {
                                handleChange("date_signed", dateString);
                              }}
                              placeholder="Select date" // Placeholder for the date picker
                              style={{ width: "100%" }}
                            />
                          </Paragraph>
                        </Col>
                      </Row>

                      <Card
                        style={{
                          width: 600,
                          marginTop: 5,
                          marginBottom: 5,
                          padding: 5,
                        }}
                        size="small"
                      >
                        <strong>PLANNING UNIT</strong>
                        <Row gutter={[16, 16]}>
                          <Col
                            xs={24} // Full width on extra-small screens
                            sm={24} // Full width on small screens
                            md={12} // Half width on medium screens
                            lg={12}
                          >
                            <Paragraph>
                              <span className="label_container">
                                <strong className="label_title">
                                  Total No. of Days:
                                </strong>
                                <p className="label">
                                  (Date Monitored VS Date Submitted)
                                </p>
                              </span>
                              <Input
                                className="poppins-textarea"
                                value={selectedRecord?.days_dmds || ""}
                                style={isEditing ? {} : { color: "#aaa" }}
                                disabled={!isEditing}
                                onChange={(e) =>
                                  handleChange("days_dmds", e.target.value)
                                }
                                placeholder="no data"
                              />
                            </Paragraph>
                          </Col>
                          <Col
                            xs={24} // Full width on extra-small screens
                            sm={24} // Full width on small screens
                            md={12} // Half width on medium screens
                            lg={12}
                          >
                            <Paragraph>
                              <span className="label_container">
                                <strong className="label_title">
                                  Total No. of Days:
                                </strong>
                                <p className="label">
                                  (Date Submitted VS Date Signed)
                                </p>
                              </span>
                              <Input
                                className="poppins-textarea"
                                value={selectedRecord?.days_dsdrs || ""}
                                style={isEditing ? {} : { color: "#aaa" }}
                                disabled={!isEditing}
                                onChange={(e) =>
                                  handleChange("days_dsdrs", e.target.value)
                                }
                                placeholder="no data"
                              />
                            </Paragraph>
                          </Col>
                        </Row>
                        <Paragraph>
                          <strong>Remarks/Recommendations:</strong> <br />
                          <TextArea
                            className="poppins-textarea"
                            value={
                              selectedRecord?.remarks_recommendations || ""
                            }
                            style={isEditing ? {} : { color: "#aaa" }}
                            disabled={!isEditing}
                            onChange={(e) =>
                              handleChange(
                                "remarks_recommendations",
                                e.target.value
                              )
                            }
                            placeholder="no data"
                            rows={5}
                          />
                        </Paragraph>
                        <Paragraph>
                          <strong>
                            Tracking of Reports (Received by Planning Unit):{" "}
                          </strong>{" "}
                          <br />
                          <Checkbox
                            checked={selectedRecord?.pismu_tracking === "✔"} // Check if '✓'
                            disabled={!isEditing} // Only editable in edit mode
                            onChange={(e) =>
                              handleChange(
                                "pismu_tracking	",
                                e.target.checked ? "✔" : ""
                              )
                            }
                            style={{ fontSize: "15px" }}
                          >
                            {selectedRecord?.pismu_tracking === "✔"
                              ? "Yes"
                              : "No"}
                          </Checkbox>
                        </Paragraph>
                      </Card>
                    </Col>
                  </Row>
                </TabPane>

                {/* CPD */}
                <TabPane
                  tab={<BoldTab>Clearances and Permits</BoldTab>}
                  key="3"
                >
                  <Row gutter={[16, 16]}>
                    <Col
                      xs={24}
                      sm={24}
                      md={12}
                      lg={12}
                    >
                      <Card
                        style={{
                          width: 600,
                          marginBottom: 20,
                          padding: 5,
                        }}
                        size="small"
                        title={
                          <div
                            style={{
                              display: "flex",
                            }}
                          >
                            <Checkbox
                              checked={selectedRecord?.pd1586 === "REQUIRED"} // Check if '✓'
                              disabled={!isEditing} // Only editable in edit mode
                              onChange={(e) =>
                                handleChange(
                                  "pd1586",
                                  e.target.checked ? "REQUIRED" : ""
                                )
                              }
                              style={{ fontSize: "15px" }}
                            >
                              <strong>PD1586</strong>
                            </Checkbox>
                            <div className="add-remove-container">
                              <Tooltip title="Add New Permit">
                                <Button
                                  type="primary"
                                  icon={<PlusOutlined />}
                                  onClick={handleAddRowECC}
                                  disabled={rowsECC.length >= maxRowsECC}
                                  style={{ marginRight: 8 }}
                                />
                              </Tooltip>
                              <Tooltip title="Remove">
                                <Button
                                  type="primary"
                                  danger
                                  icon={<MinusOutlined />}
                                  onClick={handleRemoveRowECC}
                                  disabled={rowsECC.length <= 1}
                                />
                              </Tooltip>
                            </div>
                          </div>
                        }
                      >
                        <Row gutter={[16, 16]}>
                          <Col xs={24} sm={24} md={12} lg={12}>
                            <Paragraph>
                              <strong className="label_title">
                                ECC/CNC Reference No.
                              </strong>
                              {rowsECC.map((key, index) => (
                                <div key={key} style={{ marginBottom: "10px" }}>
                                  <Input
                                    className="poppins-textarea"
                                    value={selectedRecord?.ecc_cnc}
                                    style={isEditing ? {} : { color: "#aaa" }}
                                    disabled={!isEditing}
                                    onChange={(e) =>
                                      handleChange("ecc_cnc", e.target.value)
                                    }
                                    placeholder="ECC/CNC Reference No."
                                  />
                                </div>
                              ))}
                            </Paragraph>
                          </Col>
                          <Col xs={24} sm={24} md={12} lg={12}>
                            <Paragraph>
                              <strong className="label_title">
                                Permit Process Source
                              </strong>
                              {rowsECC.map((key, index) => (
                                <div key={key} style={{ marginBottom: "10px" }}>
                                  <PermitSourceAutoComplete
                                    value={selectedRecord?.permit_process}
                                    disabled={!isEditing}
                                    onChange={(e) =>
                                      handleChange(
                                        "permit_process",
                                        e.target.value
                                      )
                                    }
                                  />
                                </div>
                              ))}
                            </Paragraph>
                          </Col>
                        </Row>
                        <Row gutter={[16, 16]}>
                          <Col xs={24} sm={24} md={12} lg={12}>
                            <Paragraph>
                              <strong className="label_title">
                                Date Approved
                              </strong>
                              {rowsECC.map((key, index) => (
                                <div key={key} style={{ marginBottom: "10px" }}>
                                  <DatePicker
                                    value={initialDateApprovedECC} // Set the initial value from the selected record
                                    format={dateFormat} // Define the desired date format
                                    disabled={!isEditing} // Disable if not in editing mode
                                    onChange={(date, dateString) => {
                                      handleChange("date_approved", dateString);
                                    }}
                                    placeholder="Select date" // Placeholder for the date picker
                                    style={{ width: "100%" }}
                                  />
                                </div>
                              ))}
                            </Paragraph>
                          </Col>
                          <Col xs={24} sm={24} md={12} lg={12}>
                            <Paragraph>
                              <strong className="label_title">
                                Date Amended
                              </strong>
                              {rowsECC.map((key, index) => (
                                <div key={key} style={{ marginBottom: "10px" }}>
                                  <DatePicker
                                    value={initialDateAmendECC} // Set the initial value from the selected record
                                    format={dateFormat} // Define the desired date format
                                    disabled={!isEditing} // Disable if not in editing mode
                                    onChange={(date, dateString) => {
                                      handleChange("date_amend", dateString);
                                    }}
                                    placeholder="Select date" // Placeholder for the date picker
                                    style={{ width: "100%" }}
                                  />
                                </div>
                              ))}
                            </Paragraph>
                          </Col>
                        </Row>
                        {rowsECC.length >= maxRowsECC && (
                          <div
                            style={{
                              color: "red",
                              textAlign: "center",
                              marginTop: "10px",
                            }}
                          >
                            Maximum number of sets reached ({maxRowsECC})
                            permits only. You cannot add more sets.
                          </div>
                        )}
                      </Card>

                      <Card
                        style={{
                          width: 600,
                          marginBottom: 20,
                          padding: 5,
                        }}
                        size="small"
                        title={
                          <div
                            style={{
                              display: "flex",
                            }}
                          >
                            <Checkbox
                              checked={selectedRecord?.ra8749 === "REQUIRED"} // Check if '✓'
                              disabled={!isEditing} // Only editable in edit mode
                              onChange={(e) =>
                                handleChange(
                                  "ra8749",
                                  e.target.checked ? "REQUIRED" : ""
                                )
                              }
                              style={{ fontSize: "15px" }}
                            >
                              <strong>RA8749</strong>
                            </Checkbox>
                            <div className="add-remove-container">
                              <Tooltip title="Add New Permit">
                                <Button
                                  type="primary"
                                  icon={<PlusOutlined />}
                                  onClick={handleAddRowPTO}
                                  disabled={rowsPTO.length >= maxRowsPTO}
                                  style={{ marginRight: 8 }}
                                />
                              </Tooltip>
                              <Tooltip title="Remove">
                                <Button
                                  type="primary"
                                  danger
                                  icon={<MinusOutlined />}
                                  onClick={handleRemoveRowPTO}
                                  disabled={rowsPTO.length <= 1}
                                />
                              </Tooltip>
                            </div>
                          </div>
                        }
                      >
                        <Row gutter={[16, 16]}>
                          <Col xs={24} sm={24} md={12} lg={12}>
                            <Paragraph>
                              <strong className="label_title">PTO Code</strong>
                              {rowsPTO.map((key, index) => (
                                <div key={key} style={{ marginBottom: "10px" }}>
                                  <Input
                                    className="poppins-textarea"
                                    value={selectedRecord?.pto_code}
                                    style={isEditing ? {} : { color: "#aaa" }}
                                    disabled={!isEditing}
                                    onChange={(e) =>
                                      handleChange("pto_code", e.target.value)
                                    }
                                    placeholder="PTO Code"
                                  />
                                </div>
                              ))}
                            </Paragraph>
                          </Col>
                        </Row>
                        <Row gutter={[16, 16]}>
                          <Col xs={24} sm={24} md={12} lg={12}>
                            <Paragraph>
                              <strong className="label_title">
                                Date Issued
                              </strong>
                              {rowsPTO.map((key, index) => (
                                <div key={key} style={{ marginBottom: "10px" }}>
                                  <DatePicker
                                    value={DateIssuedPTO} // Set the initial value from the selected record
                                    format={dateFormat} // Define the desired date format
                                    disabled={!isEditing} // Disable if not in editing mode
                                    onChange={(date, dateString) => {
                                      handleChange("pto_issued", dateString);
                                    }}
                                    placeholder="Select date" // Placeholder for the date picker
                                    style={{ width: "100%" }}
                                  />
                                </div>
                              ))}
                            </Paragraph>
                          </Col>
                          <Col xs={24} sm={24} md={12} lg={12}>
                            <Paragraph>
                              <strong className="label_title">
                                Date of Expiration
                              </strong>
                              {rowsPTO.map((key, index) => (
                                <div key={key} style={{ marginBottom: "10px" }}>
                                  <DatePicker
                                    value={DateExpPTO} // Set the initial value from the selected record
                                    format={dateFormat} // Define the desired date format
                                    disabled={!isEditing} // Disable if not in editing mode
                                    onChange={(date, dateString) => {
                                      handleChange(
                                        "pto_expiration",
                                        dateString
                                      );
                                    }}
                                    placeholder="Select date" // Placeholder for the date picker
                                    style={{ width: "100%" }}
                                  />
                                </div>
                              ))}
                            </Paragraph>
                          </Col>
                        </Row>
                        {rowsPTO.length >= maxRowsPTO && (
                          <div
                            style={{
                              color: "red",
                              textAlign: "center",
                              marginTop: "10px",
                            }}
                          >
                            Maximum number of sets reached ({maxRowsPTO})
                            permits only. You cannot add more sets.
                          </div>
                        )}
                      </Card>

                      <Card
                        style={{
                          width: 600,
                          marginBottom: 20,
                          padding: 5,
                        }}
                        size="small"
                        title={
                          <div
                            style={{
                              display: "flex",
                            }}
                          >
                            <Checkbox
                              checked={selectedRecord?.ra9275 === "REQUIRED"} // Check if '✓'
                              disabled={!isEditing} // Only editable in edit mode
                              onChange={(e) =>
                                handleChange(
                                  "ra9275",
                                  e.target.checked ? "REQUIRED" : ""
                                )
                              }
                              style={{ fontSize: "15px" }}
                            >
                              <strong>RA9275</strong>
                            </Checkbox>
                            <div className="add-remove-container">
                              <Tooltip title="Add New Permit">
                                <Button
                                  type="primary"
                                  icon={<PlusOutlined />}
                                  onClick={handleAddRowDP}
                                  disabled={rowsDP.length >= maxRowsDP}
                                  style={{ marginRight: 8 }}
                                />
                              </Tooltip>
                              <Tooltip title="Remove">
                                <Button
                                  type="primary"
                                  danger
                                  icon={<MinusOutlined />}
                                  onClick={handleRemoveRowDP}
                                  disabled={rowsDP.length <= 1}
                                />
                              </Tooltip>
                            </div>
                          </div>
                        }
                      >
                        <Row gutter={[16, 16]}>
                          <Col xs={24} sm={24} md={12} lg={12}>
                            <Paragraph>
                              <strong className="label_title">WWDP Code</strong>
                              {rowsDP.map((key, index) => (
                                <div key={key} style={{ marginBottom: "10px" }}>
                                  <Input
                                    className="poppins-textarea"
                                    value={selectedRecord?.wwdp_code}
                                    style={isEditing ? {} : { color: "#aaa" }}
                                    disabled={!isEditing}
                                    onChange={(e) =>
                                      handleChange("wwdp_code", e.target.value)
                                    }
                                    placeholder="WWDP Code"
                                  />
                                </div>
                              ))}
                            </Paragraph>
                          </Col>
                        </Row>
                        <Row gutter={[16, 16]}>
                          <Col xs={24} sm={24} md={12} lg={12}>
                            <Paragraph>
                              <strong className="label_title">
                                Date Issued
                              </strong>
                              {rowsDP.map((key, index) => (
                                <div key={key} style={{ marginBottom: "10px" }}>
                                  <DatePicker
                                    value={DateIssuedWWDP} // Set the initial value from the selected record
                                    format={dateFormat} // Define the desired date format
                                    disabled={!isEditing} // Disable if not in editing mode
                                    onChange={(date, dateString) => {
                                      handleChange("wwdp_issued", dateString);
                                    }}
                                    placeholder="Select date" // Placeholder for the date picker
                                    style={{ width: "100%" }}
                                  />
                                </div>
                              ))}
                            </Paragraph>
                          </Col>
                          <Col xs={24} sm={24} md={12} lg={12}>
                            <Paragraph>
                              <strong className="label_title">
                                Date of Expiration
                              </strong>
                              {rowsDP.map((key, index) => (
                                <div key={key} style={{ marginBottom: "10px" }}>
                                  <DatePicker
                                    value={DateExpWWDP} // Set the initial value from the selected record
                                    format={dateFormat} // Define the desired date format
                                    disabled={!isEditing} // Disable if not in editing mode
                                    onChange={(date, dateString) => {
                                      handleChange(
                                        "wwdp_expiration",
                                        dateString
                                      );
                                    }}
                                    placeholder="Select date" // Placeholder for the date picker
                                    style={{ width: "100%" }}
                                  />
                                </div>
                              ))}
                            </Paragraph>
                          </Col>
                        </Row>
                        {rowsDP.length >= maxRowsDP && (
                          <div
                            style={{
                              color: "red",
                              textAlign: "center",
                              marginTop: "10px",
                            }}
                          >
                            Maximum number of sets reached ({maxRowsDP}) permits
                            only. You cannot add more sets.
                          </div>
                        )}
                      </Card>

                      <Card
                        style={{
                          width: 600,
                          marginBottom: 20,
                          padding: 5,
                        }}
                        size="small"
                        title={
                          <div
                            style={{
                              display: "flex",
                            }}
                          >
                            <Checkbox
                              checked={selectedRecord?.ra6969 === "REQUIRED"} // Check if '✓'
                              disabled={!isEditing} // Only editable in edit mode
                              onChange={(e) =>
                                handleChange(
                                  "ra6969",
                                  e.target.checked ? "REQUIRED" : ""
                                )
                              }
                              style={{ fontSize: "15px" }}
                            >
                              <strong>RA6969</strong>
                            </Checkbox>
                            <div className="add-remove-container">
                              <Tooltip title="Add New Permit">
                                <Button
                                  type="primary"
                                  icon={<PlusOutlined />}
                                  onClick={handleAddRowHAZ}
                                  disabled={rowsHAZ.length >= maxRowsHAZ}
                                  style={{ marginRight: 8 }}
                                />
                              </Tooltip>
                              <Tooltip title="Remove">
                                <Button
                                  type="primary"
                                  danger
                                  icon={<MinusOutlined />}
                                  onClick={handleRemoveRowHAZ}
                                  disabled={rowsHAZ.length <= 1}
                                />
                              </Tooltip>
                            </div>
                          </div>
                        }
                      >
                        <Row gutter={[16, 16]}>
                          <Col xs={24} sm={24} md={12} lg={12}>
                            <Paragraph>
                              <strong className="label_title">
                                Haz-waste ID
                              </strong>
                              {rowsHAZ.map((key, index) => (
                                <div key={key} style={{ marginBottom: "10px" }}>
                                  <Input
                                    className="poppins-textarea"
                                    value={selectedRecord?.haz_id}
                                    style={isEditing ? {} : { color: "#aaa" }}
                                    disabled={!isEditing}
                                    onChange={(e) =>
                                      handleChange("haz_id", e.target.value)
                                    }
                                    placeholder="Haz-waste ID"
                                  />
                                </div>
                              ))}
                            </Paragraph>
                          </Col>
                          <Col xs={24} sm={24} md={12} lg={12}>
                            <Paragraph>
                              <strong className="label_title">
                                Date Issued
                              </strong>
                              {rowsHAZ.map((key, index) => (
                                <div key={key} style={{ marginBottom: "10px" }}>
                                  <DatePicker
                                    value={DateIssuedHW} // Set the initial value from the selected record
                                    format={dateFormat} // Define the desired date format
                                    disabled={!isEditing} // Disable if not in editing mode
                                    onChange={(date, dateString) => {
                                      handleChange("haz_issued", dateString);
                                    }}
                                    placeholder="Select date" // Placeholder for the date picker
                                    style={{ width: "100%" }}
                                  />
                                </div>
                              ))}
                            </Paragraph>
                          </Col>
                        </Row>
                        {rowsHAZ.length >= maxRowsHAZ && (
                          <div
                            style={{
                              color: "red",
                              textAlign: "center",
                              marginTop: "10px",
                            }}
                          >
                            Maximum number of sets reached ({maxRowsHAZ})
                            permits only. You cannot add more sets.
                          </div>
                        )}
                      </Card>
                    </Col>

                    <Col
                      xs={24} // Full width on extra-small screens
                      sm={24} // Full width on small screens
                      md={12} // Half width on medium screens
                      lg={12}
                    >
                      <Card
                        style={{
                          width: 600,
                          //marginTop: 5,
                          marginBottom: 5,
                          padding: 5,
                        }}
                        size="small"
                      >
                        <Checkbox
                          checked={selectedRecord?.tsd === "REQUIRED"} // Check if '✓'
                          disabled={!isEditing} // Only editable in edit mode
                          onChange={(e) =>
                            handleChange(
                              "tsd",
                              e.target.checked ? "REQUIRED" : ""
                            )
                          }
                          style={{ fontSize: "15px" }}
                        >
                          {selectedRecord?.tsd === "REQUIRED" ? "" : ""}
                          <strong>TSD Permit</strong>
                        </Checkbox>
                        <Row gutter={[16, 16]}>
                          <Col
                            xs={24} // Full width on extra-small screens
                            sm={24} // Full width on small screens
                            md={12} // Half width on medium screens
                            lg={12}
                          >
                            <Paragraph>
                              <strong className="label_title">
                                TSD Reference Code
                              </strong>
                              <Input
                                className="poppins-textarea"
                                value={selectedRecord?.tsd_ref_no}
                                style={isEditing ? {} : { color: "#aaa" }}
                                disabled={!isEditing}
                                onChange={(e) =>
                                  handleChange("tsd_ref_no", e.target.value)
                                }
                                placeholder="TSD Ref No."
                              />
                            </Paragraph>
                          </Col>
                          <Col
                            xs={24} // Full width on extra-small screens
                            sm={24} // Full width on small screens
                            md={12} // Half width on medium screens
                            lg={12}
                          >
                            <Paragraph>
                              <strong className="label_title">
                                TSD Date of Expiration
                              </strong>

                              <DatePicker
                                value={DateExpTSD} // Set the initial value from the selected record
                                format={dateFormat} // Define the desired date format
                                disabled={!isEditing} // Disable if not in editing mode
                                onChange={(date, dateString) => {
                                  handleChange("tsd_expiration", dateString);
                                }}
                                placeholder="Select date" // Placeholder for the date picker
                                style={{ width: "100%" }}
                              />
                            </Paragraph>
                          </Col>
                        </Row>
                      </Card>

                      <Card
                        style={{
                          width: 600,
                          marginTop: 20,
                          marginBottom: 20,
                          padding: 5,
                        }}
                        size="small"
                      >
                        <Checkbox
                          checked={selectedRecord?.tp_trc === "REQUIRED"} // Check if '✓'
                          disabled={!isEditing} // Only editable in edit mode
                          onChange={(e) =>
                            handleChange(
                              "tp_trc",
                              e.target.checked ? "REQUIRED" : ""
                            )
                          }
                          style={{ fontSize: "15px" }}
                        >
                          {selectedRecord?.tp_trc === "REQUIRED" ? "" : ""}
                          <strong>TP/TRC Permit</strong>
                        </Checkbox>
                        <Row gutter={[16, 16]}>
                          <Col
                            xs={24} // Full width on extra-small screens
                            sm={24} // Full width on small screens
                            md={12} // Half width on medium screens
                            lg={12}
                          >
                            <Paragraph>
                              <strong className="label_title">
                                TP/TRC Reference Code
                              </strong>
                              <Input
                                className="poppins-textarea"
                                value={selectedRecord?.tp_trc_ref_no}
                                style={isEditing ? {} : { color: "#aaa" }}
                                disabled={!isEditing}
                                onChange={(e) =>
                                  handleChange("tp_trc_ref_no", e.target.value)
                                }
                                placeholder="TP/TRC Ref No."
                              />
                            </Paragraph>
                          </Col>
                          <Col
                            xs={24} // Full width on extra-small screens
                            sm={24} // Full width on small screens
                            md={12} // Half width on medium screens
                            lg={12}
                          >
                            <Paragraph>
                              <strong className="label_title">
                                TP/TRC Date of Expiration:
                              </strong>

                              <DatePicker
                                value={DateExpTP} // Set the initial value from the selected record
                                format={dateFormat} // Define the desired date format
                                disabled={!isEditing} // Disable if not in editing mode
                                onChange={(date, dateString) => {
                                  handleChange("tp_trc_expiration", dateString);
                                }}
                                placeholder="Select date" // Placeholder for the date picker
                                style={{ width: "100%" }}
                              />
                            </Paragraph>
                          </Col>
                        </Row>
                      </Card>

                      <Card
                        style={{
                          width: 600,
                          marginBottom: 20,
                          padding: 5,
                        }}
                        size="small"
                        title={
                          <div
                            style={{
                              display: "flex",
                            }}
                          >
                            <Checkbox
                              checked={
                                selectedRecord?.chemical_permit === "REQUIRED"
                              } // Check if '✓'
                              disabled={!isEditing} // Only editable in edit mode
                              onChange={(e) =>
                                handleChange(
                                  "chemical_permit",
                                  e.target.checked ? "REQUIRED" : ""
                                )
                              }
                              style={{ fontSize: "15px" }}
                            >
                              <strong>Chemical Permits</strong>
                            </Checkbox>
                            <div className="add-remove-container-chem">
                              <Tooltip title="Add New Permit">
                                <Button
                                  type="primary"
                                  icon={<PlusOutlined />}
                                  onClick={handleAddRowCHEM}
                                  disabled={rowsCHEM.length >= maxRowsCHEM}
                                  style={{ marginRight: 8 }}
                                />
                              </Tooltip>
                              <Tooltip title="Remove">
                                <Button
                                  type="primary"
                                  danger
                                  icon={<MinusOutlined />}
                                  onClick={handleRemoveRowCHEM}
                                  disabled={rowsCHEM.length <= 1}
                                />
                              </Tooltip>
                            </div>
                          </div>
                        }
                      >
                        <Row gutter={[16, 16]}>
                          <Col xs={24} sm={24} md={3} lg={3}>
                            <strong className="label_title">Type</strong>
                          </Col>
                          <Col xs={24} sm={24} md={3} lg={3}>
                            <strong className="label_title">Element</strong>
                          </Col>
                          <Col xs={24} sm={24} md={6} lg={6}>
                            <strong className="label_title">Ref. Code</strong>
                          </Col>
                          <Col xs={24} sm={24} md={6} lg={6}>
                            <strong className="label_title">Date Issued</strong>
                          </Col>
                          <Col xs={24} sm={24} md={5} lg={5}>
                            <strong className="label_title">Valid until</strong>
                          </Col>
                        </Row>

                        {/* Render first five rows and additional rows conditionally */}
                        {rowsCHEM.map((key, index) => (
                          <div
                            key={key}
                            style={{
                              display:
                                showAllRowsCHEM || index < 5 ? "block" : "none",
                            }}
                          >
                            <Row gutter={[16, 16]}>
                              <Col xs={24} sm={24} md={3} lg={3}>
                                <Paragraph>
                                  <div
                                    key={key}
                                    style={{ marginBottom: "5px" }}
                                  >
                                    <Input
                                      className="poppins-textarea"
                                      value={
                                        selectedRecord?.chemical_permit_type
                                      }
                                      style={isEditing ? {} : { color: "#aaa" }}
                                      disabled={!isEditing}
                                      onChange={(e) =>
                                        handleChange(
                                          "chemical_permit_type",
                                          e.target.value
                                        )
                                      }
                                      placeholder="Permit SubType"
                                    />
                                  </div>
                                </Paragraph>
                              </Col>
                              <Col xs={24} sm={24} md={3} lg={3}>
                                <div key={key} style={{ marginBottom: "10px" }}>
                                  <Input
                                    className="poppins-textarea"
                                    value={
                                      selectedRecord?.chemical_permit_subtype
                                    }
                                    style={isEditing ? {} : { color: "#aaa" }}
                                    disabled={!isEditing}
                                    onChange={(e) =>
                                      handleChange(
                                        "chemical_permit_subtype",
                                        e.target.value
                                      )
                                    }
                                    placeholder="..."
                                  />
                                </div>
                              </Col>
                              <Col xs={24} sm={24} md={6} lg={6}>
                                <div key={key} style={{ marginBottom: "10px" }}>
                                  <Input
                                    className="poppins-textarea"
                                    value={
                                      selectedRecord?.chemical_permit_subtype
                                    }
                                    style={isEditing ? {} : { color: "#aaa" }}
                                    disabled={!isEditing}
                                    onChange={(e) =>
                                      handleChange(
                                        "chemical_permit_subtype",
                                        e.target.value
                                      )
                                    }
                                    placeholder="ref code"
                                  />
                                </div>
                              </Col>
                              <Col xs={24} sm={24} md={6} lg={6}>
                                <div key={key} style={{ marginBottom: "10px" }}>
                                  <DatePicker
                                    value={DateIssuedChem} // Set the initial value from the selected record
                                    format={dateFormat} // Define the desired date format
                                    disabled={!isEditing} // Disable if not in editing mode
                                    onChange={(date, dateString) => {
                                      handleChange(
                                        "chem_permit_issued",
                                        dateString
                                      );
                                    }}
                                    placeholder="Select date" // Placeholder for the date picker
                                    style={{ width: "100%" }}
                                  />
                                </div>
                              </Col>
                              <Col xs={24} sm={24} md={6} lg={6}>
                                <div key={key} style={{ marginBottom: "10px" }}>
                                  <DatePicker
                                    value={DateExpChem} // Set the initial value from the selected record
                                    format={dateFormat} // Define the desired date format
                                    disabled={!isEditing} // Disable if not in editing mode
                                    onChange={(date, dateString) => {
                                      handleChange(
                                        "chem_permit_exp",
                                        dateString
                                      );
                                    }}
                                    placeholder="Select date" // Placeholder for the date picker
                                    style={{ width: "100%" }}
                                  />
                                </div>
                              </Col>
                            </Row>
                            {index === 4 && !showAllRowsCHEM && (
                              <div className="gradient-more"></div>
                            )}
                          </div>
                        ))}

                        {/* Show All / Hide Additional Rows Button */}
                        {rowsCHEM.length > 4 && (
                          <div
                            style={{ textAlign: "center", marginTop: "10px" }}
                          >
                            <Button
                              type="primary"
                              onClick={() =>
                                setShowAllRowsCHEM(!showAllRowsCHEM)
                              }
                            >
                              {showAllRowsCHEM
                                ? "Hide Other Permits"
                                : "Show All Chemical Permits"}
                            </Button>
                          </div>
                        )}
                      </Card>

                      <Card
                        style={{
                          width: 600,
                          marginBottom: 20,
                          padding: 5,
                        }}
                        size="small"
                        title={
                          <div
                            style={{
                              display: "flex",
                            }}
                          >
                            <Checkbox
                              checked={selectedRecord?.pco === "REQUIRED"} // Check if '✓'
                              disabled={!isEditing} // Only editable in edit mode
                              onChange={(e) =>
                                handleChange(
                                  "pco",
                                  e.target.checked ? "REQUIRED" : ""
                                )
                              }
                              style={{ fontSize: "15px" }}
                            >
                              <strong>PCO Accreditation</strong>
                            </Checkbox>
                            <div className="add-remove-container-pco">
                              <Tooltip title="Add New Permit">
                                <Button
                                  type="primary"
                                  icon={<PlusOutlined />}
                                  onClick={handleAddRowPCO}
                                  disabled={rowsPCO.length >= maxRowsPCO}
                                  style={{ marginRight: 8 }}
                                />
                              </Tooltip>
                              <Tooltip title="Remove">
                                <Button
                                  type="primary"
                                  danger
                                  icon={<MinusOutlined />}
                                  onClick={handleRemoveRowPCO}
                                  disabled={rowsPCO.length <= 1}
                                />
                              </Tooltip>
                            </div>
                          </div>
                        }
                      >
                        <Row gutter={[16, 16]}>
                          <Col xs={24} sm={24} md={12} lg={12}>
                            <Paragraph>
                              <strong className="label_title">
                                Certificate of Accreditation No.
                              </strong>
                              {rowsPCO.map((key, index) => (
                                <div key={key} style={{ marginBottom: "10px" }}>
                                  <Input
                                    className="poppins-textarea"
                                    value={selectedRecord?.pco_no}
                                    style={isEditing ? {} : { color: "#aaa" }}
                                    disabled={!isEditing}
                                    onChange={(e) =>
                                      handleChange("pco_no", e.target.value)
                                    }
                                    placeholder="PCO No"
                                  />
                                </div>
                              ))}
                            </Paragraph>
                          </Col>
                          <Col xs={24} sm={24} md={12} lg={12}>
                            <Paragraph>
                              <strong className="label_title">
                                PCO Validity Date
                              </strong>
                              {rowsPCO.map((key, index) => (
                                <div key={key} style={{ marginBottom: "10px" }}>
                                  <DatePicker
                                    value={DateValPCO} // Set the initial value from the selected record
                                    format={dateFormat} // Define the desired date format
                                    disabled={!isEditing} // Disable if not in editing mode
                                    onChange={(date, dateString) => {
                                      handleChange("pco_validity", dateString);
                                    }}
                                    placeholder="Select date" // Placeholder for the date picker
                                    style={{ width: "100%" }}
                                  />
                                </div>
                              ))}
                            </Paragraph>
                          </Col>
                        </Row>
                        <Row gutter={[16, 16]}>
                          <Col xs={24} sm={24} md={12} lg={12}>
                            <Paragraph>
                              <strong className="label_title">PCO Name</strong>
                              {rowsPCO.map((key, index) => (
                                <div key={key} style={{ marginBottom: "10px" }}>
                                  <Input
                                    className="poppins-textarea"
                                    value={selectedRecord?.pco_name}
                                    style={isEditing ? {} : { color: "#aaa" }}
                                    disabled={!isEditing}
                                    onChange={(e) =>
                                      handleChange("pco_name", e.target.value)
                                    }
                                    placeholder="PCO Name"
                                  />
                                </div>
                              ))}
                            </Paragraph>
                          </Col>
                          <Col xs={24} sm={24} md={12} lg={12}>
                            <Paragraph>
                              <strong className="label_title">
                                PCO Contact No.
                              </strong>
                              {rowsPCO.map((key, index) => (
                                <div key={key} style={{ marginBottom: "10px" }}>
                                  <Input
                                    className="poppins-textarea"
                                    value={selectedRecord?.pco_tel_no}
                                    style={isEditing ? {} : { color: "#aaa" }}
                                    disabled={!isEditing}
                                    onChange={(e) =>
                                      handleChange("pco_tel_no", e.target.value)
                                    }
                                    placeholder="PCO Contact"
                                  />
                                </div>
                              ))}
                            </Paragraph>
                          </Col>
                        </Row>
                        {rowsPCO.length >= maxRowsPCO && (
                          <div
                            style={{
                              color: "red",
                              textAlign: "center",
                              marginTop: "10px",
                            }}
                          >
                            Maximum number of sets reached ({maxRowsPCO})
                            permits only. You cannot add more sets.
                          </div>
                        )}
                      </Card>
                    </Col>
                  </Row>
                </TabPane>

                {/* LEGAL SERVICES UNIT */}
                <TabPane tab={<BoldTab>Legal Services Unit</BoldTab>} key="4">
                  <Row gutter={[16, 16]}>
                    <Col
                      xs={24} // Full width on extra-small screens
                      sm={24} // Full width on small screens
                      md={12} // Half width on medium screens
                      lg={12}
                    >
                      <Card
                        style={{
                          width: 600,
                          //marginTop: 20,
                          marginBottom: 20,
                          padding: 5,
                        }}
                        size="small"
                      >
                        <Row gutter={[16, 16]}>
                          <Col
                            xs={24} // Full width on extra-small screens
                            sm={24} // Full width on small screens
                            md={12} // Half width on medium screens
                            lg={12}
                          >
                            <Paragraph>
                              <strong className="label_title">
                                Docket No.:
                              </strong>

                              <Input
                                className="poppins-textarea"
                                value={selectedRecord?.docket_no || ""}
                                style={isEditing ? {} : { color: "#aaa" }}
                                disabled={!isEditing}
                                onChange={(e) =>
                                  handleChange("docket_no", e.target.value)
                                }
                                placeholder="no data"
                              />
                            </Paragraph>
                          </Col>
                          <Col
                            xs={24} // Full width on extra-small screens
                            sm={24} // Full width on small screens
                            md={12} // Half width on medium screens
                            lg={12}
                          >
                            <Paragraph>
                              <strong className="label_title">
                                DENR PAB Case No.:
                              </strong>
                              <Input
                                className="poppins-textarea"
                                value={selectedRecord?.denr_pab_case_no || ""}
                                style={isEditing ? {} : { color: "#aaa" }}
                                disabled={!isEditing}
                                onChange={(e) =>
                                  handleChange(
                                    "denr_pab_case_no",
                                    e.target.value
                                  )
                                }
                                placeholder="no data"
                              />
                            </Paragraph>
                          </Col>
                        </Row>
                        <Row gutter={[16, 16]}>
                          <Col
                            xs={24} // Full width on extra-small screens
                            sm={24} // Full width on small screens
                            md={12} // Half width on medium screens
                            lg={12}
                          >
                            <Paragraph>
                              <strong className="label_title">
                                Date Forwarded to Legal Staff:
                              </strong>

                              <DatePicker
                                value={DateForwardedLegal} // Set the initial value from the selected record
                                format={dateFormat} // Define the desired date format
                                disabled={!isEditing} // Disable if not in editing mode
                                onChange={(date, dateString) => {
                                  handleChange("date_forwarded", dateString);
                                }}
                                placeholder="Select date" // Placeholder for the date picker
                                style={{ width: "100%" }}
                              />
                            </Paragraph>
                          </Col>
                          <Col
                            xs={24} // Full width on extra-small screens
                            sm={24} // Full width on small screens
                            md={12} // Half width on medium screens
                            lg={12}
                          >
                            <Paragraph>
                              <span className="label_container">
                                <strong className="label_title">
                                  Total No. of Days:
                                </strong>
                                <p className="label">
                                  (Date forwarded to staff vs. date approved)
                                </p>
                              </span>
                              <Input
                                className="poppins-textarea"
                                value={selectedRecord?.days_dfda || ""}
                                style={isEditing ? {} : { color: "#aaa" }}
                                disabled={!isEditing}
                                onChange={(e) =>
                                  handleChange("days_dfda", e.target.value)
                                }
                                placeholder="no data"
                              />
                            </Paragraph>
                          </Col>
                        </Row>
                        <Row gutter={[16, 16]}>
                          <Col
                            xs={24} // Full width on extra-small screens
                            sm={24} // Full width on small screens
                            md={12} // Half width on medium screens
                            lg={12}
                          >
                            <Paragraph>
                              <strong className="label_title">
                                Date Approved by Chief Legal:
                              </strong>

                              <DatePicker
                                value={DateApprovedChiefLegal} // Set the initial value from the selected record
                                format={dateFormat} // Define the desired date format
                                disabled={!isEditing} // Disable if not in editing mode
                                onChange={(date, dateString) => {
                                  handleChange("date_approved_clegal", dateString);
                                }}
                                placeholder="Select date" // Placeholder for the date picker
                                style={{ width: "100%" }}
                              />
                            </Paragraph>
                          </Col>
                        </Row>
                        <Row gutter={[16, 16]}>
                          <Col
                            xs={24} // Full width on extra-small screens
                            sm={24} // Full width on small screens
                            md={12} // Half width on medium screens
                            lg={12}
                          >
                            <Paragraph>
                              <strong className="label_title">
                                NOV Date Release:
                              </strong>

                              <DatePicker
                                value={DateNOVRelease} // Set the initial value from the selected record
                                format={dateFormat} // Define the desired date format
                                disabled={!isEditing} // Disable if not in editing mode
                                onChange={(date, dateString) => {
                                  handleChange("nov_released", dateString);
                                }}
                                placeholder="Select date" // Placeholder for the date picker
                                style={{ width: "100%" }}
                              />
                            </Paragraph>
                          </Col>
                          <Col
                            xs={24} // Full width on extra-small screens
                            sm={24} // Full width on small screens
                            md={12} // Half width on medium screens
                            lg={12}
                          >
                            <Paragraph>
                              <strong className="label_title">
                                Service Mode:
                              </strong>

                              <Input
                                className="poppins-textarea"
                                value={selectedRecord?.service_mode || ""}
                                style={isEditing ? {} : { color: "#aaa" }}
                                disabled={!isEditing}
                                onChange={(e) =>
                                  handleChange("service_mode", e.target.value)
                                }
                                placeholder="no data"
                              />
                            </Paragraph>
                          </Col>
                        </Row>
                      </Card>

                      <Card
                        style={{
                          width: 600,
                          marginTop: 20,
                          marginBottom: 20,
                          padding: 5,
                        }}
                        size="small"
                      >
                        <strong>VIOLATION/S</strong>
                        <Row gutter={[16, 16]}>
                          <Col
                            xs={24} // Full width on extra-small screens
                            sm={24} // Full width on small screens
                            md={24} // Half width on medium screens
                            lg={24}
                          >
                            <Paragraph>
                              {" "}
                              <strong>PD1586:</strong>
                              <br />{" "}
                              <TextArea
                                className="poppins-textarea"
                                value={selectedRecord?.v_pd1586 || ""}
                                style={isEditing ? {} : { color: "#aaa" }}
                                disabled={!isEditing}
                                onChange={(e) =>
                                  handleChange("v_pd1586", e.target.value)
                                }
                                placeholder="no data"
                                rows={3}
                              />
                            </Paragraph>
                          </Col>
                        </Row>
                        <Row gutter={[16, 16]}>
                          <Col
                            xs={24} // Full width on extra-small screens
                            sm={24} // Full width on small screens
                            md={24} // Half width on medium screens
                            lg={24}
                          >
                            <Paragraph>
                              {" "}
                              <strong>RA9275:</strong>
                              <br />{" "}
                              <TextArea
                                className="poppins-textarea"
                                value={selectedRecord?.v_ra9275 || ""}
                                style={isEditing ? {} : { color: "#aaa" }}
                                disabled={!isEditing}
                                onChange={(e) =>
                                  handleChange("v_ra9275", e.target.value)
                                }
                                placeholder="no data"
                                rows={3}
                              />
                            </Paragraph>
                          </Col>
                        </Row>
                        <Row gutter={[16, 16]}>
                          <Col
                            xs={24} // Full width on extra-small screens
                            sm={24} // Full width on small screens
                            md={24} // Half width on medium screens
                            lg={24}
                          >
                            <Paragraph>
                              {" "}
                              <strong>RA8749:</strong>
                              <br />{" "}
                              <TextArea
                                className="poppins-textarea"
                                value={selectedRecord?.v_ra8749 || ""}
                                style={isEditing ? {} : { color: "#aaa" }}
                                disabled={!isEditing}
                                onChange={(e) =>
                                  handleChange("v_ra8749", e.target.value)
                                }
                                placeholder="no data"
                                rows={3}
                              />
                            </Paragraph>
                          </Col>
                        </Row>
                        <Row gutter={[16, 16]}>
                          <Col
                            xs={24} // Full width on extra-small screens
                            sm={24} // Full width on small screens
                            md={24} // Half width on medium screens
                            lg={24}
                          >
                            <Paragraph>
                              {" "}
                              <strong>HAZWASTE:</strong>
                              <br />{" "}
                              <TextArea
                                className="poppins-textarea"
                                value={selectedRecord?.v_haz || ""}
                                style={isEditing ? {} : { color: "#aaa" }}
                                disabled={!isEditing}
                                onChange={(e) =>
                                  handleChange("v_haz", e.target.value)
                                }
                                placeholder="no data"
                                rows={3}
                              />
                            </Paragraph>
                          </Col>
                        </Row>
                        <Row gutter={[16, 16]}>
                          <Col
                            xs={24} // Full width on extra-small screens
                            sm={24} // Full width on small screens
                            md={24} // Half width on medium screens
                            lg={24}
                          >
                            <Paragraph>
                              {" "}
                              <strong>TOXIC CHEM:</strong>
                              <br />{" "}
                              <TextArea
                                className="poppins-textarea"
                                value={selectedRecord?.v_tchem || ""}
                                style={isEditing ? {} : { color: "#aaa" }}
                                disabled={!isEditing}
                                onChange={(e) =>
                                  handleChange("v_tchem", e.target.value)
                                }
                                placeholder="no data"
                                rows={3}
                              />
                            </Paragraph>
                          </Col>
                        </Row>
                      </Card>
                    </Col>

                    <Col
                      xs={24} // Full width on extra-small screens
                      sm={24} // Full width on small screens
                      md={12} // Half width on medium screens
                      lg={12}
                    >
                      <Card
                        style={{
                          width: 600,
                          //marginTop: 5,
                          marginBottom: 5,
                          padding: 5,
                        }}
                        size="small"
                      >
                        <strong>Technical Conference</strong>
                        <Row gutter={[16, 16]}>
                          <Col
                            xs={24} // Full width on extra-small screens
                            sm={24} // Full width on small screens
                            md={12} // Half width on medium screens
                            lg={12}
                          >
                            <Paragraph>
                              <strong className="label_title">
                                TC Date Scheduled:
                              </strong>
                              <DatePicker
                                value={DateTCShed} // Set the initial value from the selected record
                                format={dateFormat} // Define the desired date format
                                disabled={!isEditing} // Disable if not in editing mode
                                onChange={(date, dateString) => {
                                  handleChange("tc_date_sched", dateString);
                                }}
                                placeholder="Select date" // Placeholder for the date picker
                                style={{ width: "100%" }}
                              />
                            </Paragraph>
                          </Col>
                          <Col
                            xs={24} // Full width on extra-small screens
                            sm={24} // Full width on small screens
                            md={12} // Half width on medium screens
                            lg={12}
                          >
                            <Paragraph>
                              <strong className="label_title">
                                TC Date Actual:
                              </strong>
                              <DatePicker
                                value={DateTCActual} // Set the initial value from the selected record
                                format={dateFormat} // Define the desired date format
                                disabled={!isEditing} // Disable if not in editing mode
                                onChange={(date, dateString) => {
                                  handleChange("tc_date_actual", dateString);
                                }}
                                placeholder="Select date" // Placeholder for the date picker
                                style={{ width: "100%" }}
                              />
                            </Paragraph>
                          </Col>
                        </Row>

                        <Row gutter={[16, 16]}>
                          <Col
                            xs={24} // Full width on extra-small screens
                            sm={24} // Full width on small screens
                            md={12} // Half width on medium screens
                            lg={12}
                          >
                            <Paragraph>
                              <strong className="label_title">Time:</strong>
                              <TimePicker
                                value={
                                  DateTCTime
                                    ? moment(DateTCTime, timeFormat)
                                    : null
                                } // Convert string to moment object
                                format={timeFormat} // Use 12-hour format with AM/PM
                                disabled={!isEditing} // Disable when not editing
                                onChange={(date, dateString) =>
                                  handleChange("time", dateString)
                                } // Handle time change
                                placeholder="Select time" // Placeholder text
                                style={{ width: "100%" }} // Optional: Set to 100% width
                              />
                            </Paragraph>
                          </Col>
                          <Col
                            xs={24} // Full width on extra-small screens
                            sm={24} // Full width on small screens
                            md={12} // Half width on medium screens
                            lg={12}
                          >
                            <Paragraph>
                              <strong className="label_title">
                                Legal Officer:
                              </strong>
                              <Input
                                className="poppins-textarea"
                                value={selectedRecord?.legal_officer || ""}
                                style={isEditing ? {} : { color: "#aaa" }}
                                disabled={!isEditing}
                                onChange={(e) =>
                                  handleChange("legal_officer", e.target.value)
                                }
                                placeholder="no data"
                              />
                            </Paragraph>
                          </Col>
                        </Row>

                        <Row gutter={[16, 16]}>
                          <Col
                            xs={24} // Full width on extra-small screens
                            sm={24} // Full width on small screens
                            md={24} // Half width on medium screens
                            lg={24}
                          >
                            <Paragraph>
                              <strong className="label_title">
                                T.C. Commitment/Deadline of Compliance
                              </strong>
                              &nbsp; <i>(Paste Link Here)</i>
                              <Input
                                className="poppins-textarea"
                                value={selectedRecord?.tc_commitment || ""}
                                style={isEditing ? {} : { color: "#aaa" }}
                                disabled={!isEditing}
                                onChange={(e) =>
                                  handleChange("tc_commitment", e.target.value)
                                }
                                placeholder="no data"
                              />
                            </Paragraph>
                          </Col>
                        </Row>
                      </Card>

                      <Card
                        style={{
                          width: 600,
                          marginTop: 20,
                          marginBottom: 5,
                          padding: 5,
                        }}
                        size="small"
                      >
                        <strong>FOR INSPECTOR</strong>
                        <Row gutter={[16, 16]}>
                          <Col
                            xs={24} // Full width on extra-small screens
                            sm={24} // Full width on small screens
                            md={24} // Half width on medium screens
                            lg={24}
                          >
                            <Paragraph>
                              <strong className="label_title">
                                Compliance with TC Commitment/Order
                              </strong>
                              &nbsp; <i>(Paste Link Here)</i>
                              <InspectorTCCompliance
                                value={
                                  selectedRecord?.tc_order_compliance || ""
                                }
                                disabled={!isEditing}
                                onChange={(e) =>
                                  handleChange(
                                    "tc_order_compliance",
                                    e.target.value
                                  )
                                }
                              />
                            </Paragraph>
                          </Col>
                        </Row>

                        <Row gutter={[16, 16]}>
                          <Col
                            xs={24} // Full width on extra-small screens
                            sm={24} // Full width on small screens
                            md={24} // Half width on medium screens
                            lg={24}
                          >
                            <Paragraph>
                              <strong>Remarks:</strong>
                              <br />{" "}
                              <TextArea
                                className="poppins-textarea"
                                value={selectedRecord?.remarks || ""}
                                style={isEditing ? {} : { color: "#aaa" }}
                                disabled={!isEditing}
                                onChange={(e) =>
                                  handleChange("remarks", e.target.value)
                                }
                                placeholder="no data"
                                rows={3}
                              />
                            </Paragraph>
                          </Col>
                        </Row>
                      </Card>

                      <Card
                        style={{
                          width: 600,
                          marginTop: 20,
                          marginBottom: 5,
                          padding: 5,
                        }}
                        size="small"
                      >
                        <strong>For Order/Resolution</strong>
                        <Row gutter={[16, 16]}>
                          <Col
                            xs={24} // Full width on extra-small screens
                            sm={24} // Full width on small screens
                            md={24} // Half width on medium screens
                            lg={24}
                          >
                            <Paragraph>
                              <strong className="label_title">
                                Issued Position Paper
                              </strong>
                              &nbsp; <i>(Paste Link Here)</i>
                              <TextArea
                                className="poppins-textarea"
                                value={selectedRecord?.pos_paper || ""}
                                style={isEditing ? {} : { color: "#aaa" }}
                                disabled={!isEditing}
                                onChange={(e) =>
                                  handleChange("pos_paper", e.target.value)
                                }
                                placeholder="no data"
                                rows={2}
                              />
                            </Paragraph>
                          </Col>
                        </Row>

                        <Row gutter={[16, 16]}>
                          <Col
                            xs={24} // Full width on extra-small screens
                            sm={24} // Full width on small screens
                            md={24} // Half width on medium screens
                            lg={24}
                          >
                            <Paragraph>
                              <strong className="label_title">
                                Issued Resolution
                              </strong>
                              &nbsp; <i>(Paste Link Here)</i>
                              <TextArea
                                className="poppins-textarea"
                                value={selectedRecord?.resolution || ""}
                                style={isEditing ? {} : { color: "#aaa" }}
                                disabled={!isEditing}
                                onChange={(e) =>
                                  handleChange("pos_paper", e.target.value)
                                }
                                placeholder="no data"
                                rows={2}
                              />
                            </Paragraph>
                          </Col>
                        </Row>

                        <Row gutter={[16, 16]}>
                          <Col
                            xs={24} // Full width on extra-small screens
                            sm={24} // Full width on small screens
                            md={24} // Half width on medium screens
                            lg={24}
                          >
                            <Paragraph>
                              <strong className="label_title">
                                Issued Order
                              </strong>
                              &nbsp; <i>(Paste Link Here)</i>
                              <TextArea
                                className="poppins-textarea"
                                value={selectedRecord?.order || ""}
                                style={isEditing ? {} : { color: "#aaa" }}
                                disabled={!isEditing}
                                onChange={(e) =>
                                  handleChange("pos_paper", e.target.value)
                                }
                                placeholder="no data"
                                rows={2}
                              />
                            </Paragraph>
                          </Col>
                        </Row>

                        <Row gutter={[16, 16]}>
                          <Col
                            xs={24} // Full width on extra-small screens
                            sm={24} // Full width on small screens
                            md={12} // Half width on medium screens
                            lg={12}
                          >
                            <Paragraph>
                              <strong className="label_title">
                                Date Payment of Penalty:
                              </strong>
                              <DatePicker
                                value={DatePenalty} // Set the initial value from the selected record
                                format={dateFormat} // Define the desired date format
                                disabled={!isEditing} // Disable if not in editing mode
                                onChange={(date, dateString) => {
                                  handleChange("penalty", dateString);
                                }}
                                placeholder="Select date" // Placeholder for the date picker
                                style={{ width: "100%" }}
                              />
                            </Paragraph>
                          </Col>
                        </Row>

                        <Row gutter={[16, 16]}>
                          <Col
                            xs={24} // Full width on extra-small screens
                            sm={24} // Full width on small screens
                            md={12} // Half width on medium screens
                            lg={12}
                          >
                            <Paragraph>
                              <strong className="label_title">Amount:</strong>
                              <Input
                                className="poppins-textarea"
                                value={selectedRecord?.amount || ""}
                                style={isEditing ? {} : { color: "#aaa" }}
                                disabled={!isEditing}
                                onChange={(e) =>
                                  handleChange("amount", e.target.value)
                                }
                                placeholder="no data"
                              />
                            </Paragraph>
                          </Col>
                          <Col
                            xs={24} // Full width on extra-small screens
                            sm={24} // Full width on small screens
                            md={12} // Half width on medium screens
                            lg={12}
                          >
                            <Paragraph>
                              <strong className="label_title">
                                Official Receipt (OR) Number:
                              </strong>
                              <Input
                                className="poppins-textarea"
                                value={selectedRecord?.or_number || ""}
                                style={isEditing ? {} : { color: "#aaa" }}
                                disabled={!isEditing}
                                onChange={(e) =>
                                  handleChange("or_number", e.target.value)
                                }
                                placeholder="no data"
                              />
                            </Paragraph>
                          </Col>
                        </Row>

                        <Row gutter={[16, 16]}>
                          <Col
                            xs={24} // Full width on extra-small screens
                            sm={24} // Full width on small screens
                            md={24} // Half width on medium screens
                            lg={24}
                          >
                            <Paragraph>
                              <strong>Order Status:</strong>
                              <br />{" "}
                              <TextArea
                                className="poppins-textarea"
                                value={selectedRecord?.order_status || ""}
                                style={isEditing ? {} : { color: "#aaa" }}
                                disabled={!isEditing}
                                onChange={(e) =>
                                  handleChange("order_status", e.target.value)
                                }
                                placeholder="no data"
                                rows={3}
                              />
                            </Paragraph>
                          </Col>
                        </Row>
                      </Card>
                    </Col>
                  </Row>
                </TabPane>

                {/* MANILA BAY */}
                <TabPane tab={<BoldTab>Manila Bay Unit</BoldTab>} key="5">
                  <Row gutter={[16, 16]}>
                    <Col
                      xs={24} // Full width on extra-small screens
                      sm={24} // Full width on small screens
                      md={12} // Half width on medium screens
                      lg={12}
                      className="modalcol"
                    >
                      <Row gutter={[16, 16]}>
                        <Col span={23}>
                          {/* Embed Google Maps with the fetched coordinates */}
                          <R3MapAutoComplete
                            latitude={selectedRecord?.lat || ""}
                            longitude={selectedRecord?.long || ""}
                          />
                        </Col>
                      </Row>
                    </Col>
                    <Col
                      xs={24} // Full width on extra-small screens
                      sm={24} // Full width on small screens
                      md={12} // Half width on medium screens
                      lg={12}
                    >
                      <Row gutter={[16, 16]}>
                        <Col
                          xs={24} // Full width on extra-small screens
                          sm={24} // Full width on small screens
                          md={12} // Half width on medium screens
                          lg={12}
                          className="modalcol"
                        >
                          <Paragraph>
                            <strong>Latitude:</strong>
                            <Input
                              className="poppins-textarea"
                              value={selectedRecord?.lat || ""}
                              style={isEditing ? {} : { color: "#aaa" }}
                              disabled={!isEditing}
                              onChange={(e) =>
                                handleChange("lat", e.target.value)
                              }
                              placeholder="no data"
                            />
                          </Paragraph>
                        </Col>
                      </Row>

                      <Row gutter={[16, 16]}>
                        <Col
                          xs={24} // Full width on extra-small screens
                          sm={24} // Full width on small screens
                          md={12} // Half width on medium screens
                          lg={12}
                          className="modalcol"
                        >
                          {" "}
                          <Paragraph>
                            <strong>Longitude:</strong>
                            <Input
                              className="poppins-textarea"
                              value={selectedRecord?.long || ""}
                              style={isEditing ? {} : { color: "#aaa" }}
                              disabled={!isEditing}
                              onChange={(e) =>
                                handleChange("long", e.target.value)
                              }
                              placeholder="no data"
                            />
                          </Paragraph>
                        </Col>
                      </Row>
                      <Row gutter={[16, 16]}>
                        <Col
                          xs={24} // Full width on extra-small screens
                          sm={24} // Full width on small screens
                          md={24} // Half width on medium screens
                          lg={24}
                          className="modalcol"
                        >
                          {" "}
                          <Paragraph>
                            <strong>Complete Address:</strong>
                            <TextArea
                              className="poppins-textarea"
                              value={selectedRecord?.address || ""}
                              style={isEditing ? {} : { color: "#aaa" }}
                              disabled={!isEditing}
                              onChange={(e) =>
                                handleChange("address", e.target.value)
                              }
                              placeholder="no data"
                            />
                          </Paragraph>
                        </Col>
                      </Row>
                      <Row gutter={[16, 16]}>
                        <Col
                          xs={24} // Full width on extra-small screens
                          sm={24} // Full width on small screens
                          md={24} // Half width on medium screens
                          lg={24}
                          className="modalcol"
                        >
                          {" "}
                          <Paragraph>
                            <strong>Receiving Waterbody/River System:</strong>
                            <Input
                              className="poppins-textarea"
                              value={selectedRecord?.waterbody || ""}
                              style={isEditing ? {} : { color: "#aaa" }}
                              disabled={!isEditing}
                              onChange={(e) =>
                                handleChange("waterbody", e.target.value)
                              }
                              placeholder="no data"
                            />
                          </Paragraph>
                        </Col>
                      </Row>
                      <Row gutter={[16, 16]}>
                        <Col
                          xs={24} // Full width on extra-small screens
                          sm={24} // Full width on small screens
                          md={12} // Half width on medium screens
                          lg={12}
                          className="modalcol"
                        >
                          {" "}
                          <Paragraph>
                            <strong>Street:</strong>
                            <TextArea
                              className="poppins-textarea"
                              value={selectedRecord?.street || ""}
                              style={isEditing ? {} : { color: "#aaa" }}
                              disabled={!isEditing}
                              onChange={(e) =>
                                handleChange("street", e.target.value)
                              }
                              placeholder="no data"
                              rows={1}
                            />
                          </Paragraph>
                        </Col>
                        <Col
                          xs={24} // Full width on extra-small screens
                          sm={24} // Full width on small screens
                          md={12} // Half width on medium screens
                          lg={12}
                        >
                          <Paragraph>
                            <strong>Within Manila Bay Area: </strong> <br />
                            <Checkbox
                              checked={selectedRecord?.mbu_area === "✔"} // Check if '✓'
                              disabled={!isEditing} // Only editable in edit mode
                              onChange={(e) =>
                                handleChange(
                                  "mbu_area",
                                  e.target.checked ? "✔" : ""
                                )
                              }
                              style={{ fontSize: "15px" }}
                            >
                              {selectedRecord?.mbu_area === "✔" ? "Yes" : "No"}
                            </Checkbox>
                          </Paragraph>
                        </Col>
                      </Row>
                      <Row gutter={[16, 16]}>
                        <Col
                          xs={24} // Full width on extra-small screens
                          sm={24} // Full width on small screens
                          md={12} // Half width on medium screens
                          lg={12}
                          className="modalcol"
                        >
                          {" "}
                          <Paragraph>
                            <strong>Barangay:</strong>
                            <Input
                              className="poppins-textarea"
                              value={selectedRecord?.brgy || ""}
                              style={isEditing ? {} : { color: "#aaa" }}
                              disabled={!isEditing}
                              onChange={(e) =>
                                handleChange("brgy", e.target.value)
                              }
                              placeholder="no data"
                            />
                          </Paragraph>
                        </Col>
                        <Col
                          xs={24} // Full width on extra-small screens
                          sm={24} // Full width on small screens
                          md={12} // Half width on medium screens
                          lg={12}
                        >
                          <Paragraph>
                            <strong>For Request: Priority Industry: </strong>{" "}
                            <br />
                            <Checkbox
                              checked={selectedRecord?.mbu_priority === "✔"} // Check if '✓'
                              disabled={!isEditing} // Only editable in edit mode
                              onChange={(e) =>
                                handleChange(
                                  "mbu_priority",
                                  e.target.checked ? "✔" : ""
                                )
                              }
                              style={{ fontSize: "15px" }}
                            >
                              {selectedRecord?.mbu_priority === "✔"
                                ? "Yes"
                                : "No"}
                            </Checkbox>
                          </Paragraph>
                        </Col>
                      </Row>
                      <Row gutter={[16, 16]}>
                        <Col
                          xs={24} // Full width on extra-small screens
                          sm={24} // Full width on small screens
                          md={12} // Half width on medium screens
                          lg={12}
                          className="modalcol"
                        >
                          {" "}
                          <Paragraph>
                            <strong>City/Municipality:</strong>
                            <Input
                              className="poppins-textarea"
                              value={selectedRecord?.city || ""}
                              style={isEditing ? {} : { color: "#aaa" }}
                              disabled={!isEditing}
                              onChange={(e) =>
                                handleChange("city", e.target.value)
                              }
                              placeholder="no data"
                            />
                          </Paragraph>
                        </Col>
                        <Col
                          xs={24} // Full width on extra-small screens
                          sm={24} // Full width on small screens
                          md={12} // Half width on medium screens
                          lg={12}
                        >
                          <Paragraph>
                            <strong>MBU Survey: </strong> <br />
                            <Checkbox
                              checked={selectedRecord?.mbu_survey === "✔"} // Check if '✓'
                              disabled={!isEditing} // Only editable in edit mode
                              onChange={(e) =>
                                handleChange(
                                  "mbu_survey",
                                  e.target.checked ? "✔" : ""
                                )
                              }
                              style={{ fontSize: "15px" }}
                            >
                              {selectedRecord?.mbu_survey === "✔"
                                ? "Yes"
                                : "No"}
                            </Checkbox>
                          </Paragraph>
                        </Col>
                      </Row>
                      <Row gutter={[16, 16]}>
                        <Col
                          xs={24} // Full width on extra-small screens
                          sm={24} // Full width on small screens
                          md={12} // Half width on medium screens
                          lg={12}
                          className="modalcol"
                        >
                          {" "}
                          <Paragraph>
                            <strong>Province:</strong> <br />
                            <Input
                              className="poppins-textarea"
                              value={selectedRecord?.province || ""}
                              style={isEditing ? {} : { color: "#aaa" }}
                              disabled={!isEditing}
                              onChange={(e) =>
                                handleChange("province", e.target.value)
                              }
                              placeholder="no data"
                            />
                          </Paragraph>
                        </Col>
                        <Col
                          xs={24} // Full width on extra-small screens
                          sm={24} // Full width on small screens
                          md={12} // Half width on medium screens
                          lg={12}
                        >
                          <Paragraph>
                            <strong>For Request: Survey(MBU) </strong> <br />
                            <Checkbox
                              checked={
                                selectedRecord?.mbu_survey_request === "✔"
                              } // Check if '✓'
                              disabled={!isEditing} // Only editable in edit mode
                              onChange={(e) =>
                                handleChange(
                                  "mbu_survey_request",
                                  e.target.checked ? "✔" : ""
                                )
                              }
                              style={{ fontSize: "15px" }}
                            >
                              {selectedRecord?.mbu_survey_request === "✔"
                                ? "Yes"
                                : "No"}
                            </Checkbox>
                          </Paragraph>
                        </Col>
                      </Row>
                      <Row gutter={[16, 16]}>
                        <Col
                          xs={24} // Full width on extra-small screens
                          sm={24} // Full width on small screens
                          md={12} // Half width on medium screens
                          lg={12}
                        >
                          <Paragraph>
                            <strong>Congressional District:</strong>
                            <Input
                              className="poppins-textarea"
                              value={selectedRecord?.cong_district || ""}
                              style={isEditing ? {} : { color: "#aaa" }}
                              disabled={!isEditing}
                              onChange={(e) =>
                                handleChange("cong_district", e.target.value)
                              }
                              placeholder="no data"
                            />
                          </Paragraph>
                        </Col>
                        <Col
                          xs={24} // Full width on extra-small screens
                          sm={24} // Full width on small screens
                          md={12} // Half width on medium screens
                          lg={12}
                        >
                          <Paragraph>
                            <strong>For DP Universe</strong> <br />
                            <Checkbox
                              checked={selectedRecord?.dp_universe === "✔"} // Check if '✓'
                              disabled={!isEditing} // Only editable in edit mode
                              onChange={(e) =>
                                handleChange(
                                  "dp_universe",
                                  e.target.checked ? "✔" : ""
                                )
                              }
                              style={{ fontSize: "15px" }}
                            >
                              {selectedRecord?.dp_universe === "✔"
                                ? "Yes"
                                : "No"}
                            </Checkbox>
                          </Paragraph>
                        </Col>
                      </Row>
                    </Col>
                  </Row>
                </TabPane>
              </Tabs>
            ) : (
              <div>No Record Selected</div>
            )}
          </Modal>
          <div className={`header-panel ${theme}`}>
            <div className="header-content">
              <h2>{`${capitalizedProvinceName} Universe of Firms and Industries`}</h2>
              <Button
                className="refresh-button"
                icon={<ReloadOutlined />}
                onClick={handleReload}
                loading={loading}
              ></Button>
              <Button className="add-industry-button">Add Industry</Button>
            </div>

            <div className="search-pagination-container">
              <div className="total-rows">
                <strong>
                  Industry Count: {formatNumber(filteredData.length)}
                </strong>
              </div>
              <div className="search-input">
                <Input
                  placeholder="Search..."
                  prefix={<SearchOutlined />}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  disabled={loading} // Disable while loading
                />
              </div>

              <div className="pagination-controls">
                <div className="pagination-dropdown">
                  <label>Show:&nbsp;</label>
                  <Select
                    defaultValue={itemsPerPage}
                    onChange={(value) => setItemsPerPage(Number(value))}
                    disabled={loading} // Disable while loading
                  >
                    <Option value={10}>10</Option>
                    <Option value={50}>50</Option>
                    <Option value={100}>100</Option>
                  </Select>
                  <label>&nbsp;entries</label>
                </div>
              </div>

              <div className="pagination">
                {loading ? (
                  <Spin size="small" /> // Spin animation during loading
                ) : (
                  <Pagination
                    simple
                    current={currentPage}
                    total={filteredData.length}
                    pageSize={itemsPerPage}
                    showSizeChanger={false}
                    onChange={(page) => setCurrentPage(page)}
                  />
                )}
              </div>
            </div>

            <div style={{ position: "relative", padding: "5px" }}>
              {loading ? (
                <Spin tip="Processing Universe Data..." size="large">
                  {<strong className="loading_title">...</strong>}
                </Spin>
              ) : (
                <Spin spinning={tableLoading}>
                  <Table
                    columns={columns}
                    dataSource={filteredData}
                    rowKey={(record) => record.id_no}
                    pagination={{
                      current: currentPage,
                      total: filteredData.length,
                      pageSize: itemsPerPage,
                      onChange: (page) => setCurrentPage(page),
                    }}
                  />
                </Spin>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Province;
