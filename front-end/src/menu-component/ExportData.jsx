import React, { useContext, useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import _ from "lodash";
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
  Tag,
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
import { DataContext } from "../menu-province/DataContext";
import "./exportdata.css";

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

const ExportData = () => {

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
  const [isLoading, setIsLoading] = useState(false);
  const { confirm } = Modal;

  const [rowsPTO, setRowsPTO] = useState([Date.now()]);
  const [rowsDP, setRowsDP] = useState([Date.now()]);
  const [rowsHAZ, setRowsHAZ] = useState([Date.now()]);
  const [rowsCHEM, setRowsCHEM] = useState(
    Array.from({ length: 5 }, (_, index) => index + 1)
  );
  const [showAllRowsCHEM, setShowAllRowsCHEM] = useState(false);
  const [rowsPCO, setRowsPCO] = useState([Date.now()]);

  const maxRows = 2;
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
  const [chemicalPermits, setchemicalPermits] = useState([]);
  const [handler, setHandler] = useState([]);
  const [rowsECC, setRowsECC] = useState([Date.now()]);



  const formatNumber = (number) => {
    return new Intl.NumberFormat("en-US").format(number);
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


  useEffect(() => {
    const filtered = filterData(data, searchTerm);
    setFilteredData(filtered);
  }, [data, searchTerm]);

  useEffect(() => {
    setTableLoading(loading);
  }, [loading]);

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
  ];

  return (
    <div className="header_panel">
    <div className="header-content">
      <h2>{`${capitalizedProvinceName} Universe of Firms and Industries`}</h2>
      <Button
        className="refresh-button"
        icon={<ReloadOutlined />}
        onClick={handleReload}
        loading={loading}
      ></Button>
      <Button type="primary" className="add-industry-button">
        Add Industry
      </Button>
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
  )
}

export default ExportData