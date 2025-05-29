import React, { useEffect, useState } from "react";
import { Table, Input, Select } from "antd";
import axios from "axios";
import dayjs from "dayjs";

const { Search } = Input;
const { Option } = Select;

const dropdownFields = [
  "province",
  "industry_type",
  "industry_subtype",
  "industry_class",
  "waterbody",
  "wwtf_type",
  "monitoring_sched",
  "date_monitored",
  "date_routed",
  "date_signed",
  "pismu_tracking",
  "title_status",
  "pismu_count_month",
  "legal_officer",
  "nov_issued"
];

const getMonth = (dateStr) => {
  const d = dayjs(dateStr, ["M/D/YYYY", "YYYY-MM-DD"], true);
  return d.isValid() ? d.format("MMMM") : "";
};

const RecordsConfig = () => {
  const [data, setData] = useState([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({});
  const [dropdownOptions, setDropdownOptions] = useState({});

 const fetchData = async (page = 1, pageSize = 20, filterParams = {}) => {
  setLoading(true);
  try {
    const res = await axios.get("http://localhost:8081/api/ucds-data", {
      params: {
        page,
        pageSize,
        ...filterParams,
      },
    });

    // Remove leading zeros *after* the dash in sort_key
    const transformedData = res.data.data.map((item) => {
      let newSortKey = item.sort_key || "";
      if (newSortKey.includes("-")) {
        const [prefix, numPart] = newSortKey.split("-");
        newSortKey = `${prefix}-${parseInt(numPart, 10)}`; // e.g., AU-00005 → AU-5
      }
      return {
        ...item,
        sort_key: newSortKey,
      };
    });

    setData(transformedData);
    setTotal(res.data.total);
    setPagination({ current: page, pageSize });
  } catch (err) {
    console.error("Failed to fetch data", err);
  } finally {
    setLoading(false);
  }
};


  useEffect(() => {
    fetchData(pagination.current, pagination.pageSize, filters);
  }, [pagination.current, pagination.pageSize, filters]);

  const handleTableChange = (pagination) => {
    setPagination(pagination);
  };

  const handleSearch = (value) => {
    setFilters({ name: value });
  };

  const columns = [
    { title: "Sort Key", dataIndex: "sort_key", key: "sort_key" },
    { title: "Name", dataIndex: "name", key: "name" },
    { title: "Title", dataIndex: "title", key: "title" },
    {
      title: "Industry Type",
      dataIndex: "industry_type",
      key: "industry_type",
    },
    {
      title: "Industry Subtype",
      dataIndex: "industry_subtype",
      key: "industry_subtype",
    },
    {
      title: "Industry Class",
      dataIndex: "industry_class",
      key: "industry_class",
    },
    { title: "PSIC Code", dataIndex: "psic_code", key: "psic_code" },
    { title: "MBU Area", dataIndex: "mbu_area", key: "mbu_area" },
    { title: "Waterbody", dataIndex: "waterbody", key: "waterbody" },
    { title: "EMP Total", dataIndex: "emp_total", key: "emp_total" },
    { title: "WWTF Type", dataIndex: "wwtf_type", key: "wwtf_type" },
    { title: "BOD", dataIndex: "bod", key: "bod" },
    { title: "Longitude", dataIndex: "long", key: "long" },
    { title: "Latitude", dataIndex: "lat", key: "lat" },
    {
      title: "Congressional District",
      dataIndex: "cong_district",
      key: "cong_district",
    },
    { title: "Address", dataIndex: "address", key: "address" },
    { title: "Street", dataIndex: "street", key: "street" },
    { title: "Barangay", dataIndex: "brgy", key: "brgy" },
    { title: "City", dataIndex: "city", key: "city" },
    { title: "Province", dataIndex: "province", key: "province" },
    { title: "IIS No. 2024", dataIndex: "iis_no_2024", key: "iis_no_2024" },
    { title: "IIS No. 2025", dataIndex: "iis_no_2025", key: "iis_no_2025" },
    {
      title: "Section Incharged",
      dataIndex: "section_incharged",
      key: "section_incharged",
    },
    { title: "Handler", dataIndex: "handler", key: "handler" },
    {
      title: "Monitoring Schedule",
      dataIndex: "monitoring_sched",
      key: "monitoring_sched",
    },
    { title: "Inspection Type", dataIndex: "insp_type", key: "insp_type" },
    {
      title: "Date Monitored",
      dataIndex: "date_monitored",
      key: "date_monitored",
    },
    { title: "Date Routed", dataIndex: "date_routed", key: "date_routed" },
    { title: "Date Signed", dataIndex: "date_signed", key: "date_signed" },
    { title: "Days DMDS", dataIndex: "days_dmds", key: "days_dmds" },
    { title: "Days DRDS", dataIndex: "days_drds", key: "days_drds" },
    {
      title: "PISMU Tracking",
      dataIndex: "pismu_tracking",
      key: "pismu_tracking",
    },
    { title: "Title Status", dataIndex: "title_status", key: "title_status" },
    { title: "Remarks", dataIndex: "remarks", key: "remarks" },
    { title: "With NOV", dataIndex: "with_nov", key: "with_nov" },
    {
      title: "PISMU Count/Month",
      dataIndex: "pismu_count_month",
      key: "pismu_count_month",
    },
    // Grouped: ECC/CNC
    {
      title: "ECC/CNC",
      key: "ecc_group",
      render: (record) => (
        <>
          <div><strong>ECC/CNC:</strong> {record.ecc_cnc}</div>
          <div><strong>Process:</strong> {record.permit_process}</div>
          <div><strong>Amended:</strong> {record.date_amended}</div>
          <div><strong>Approved:</strong> {record.date_approved}</div>
        </>
      )
    },

    // Grouped: PTO
    {
      title: "PTO",
      key: "pto_group",
      render: (record) => (
        <>
          <div><strong>Code:</strong> {record.pto_code}</div>
          <div><strong>Issued:</strong> {record.pto_issued}</div>
          <div><strong>Expiry:</strong> {record.pto_expiration}</div>
        </>
      )
    },

    // Grouped: WWDP
    {
      title: "WWDP",
      key: "wwdp_group",
      render: (record) => (
        <>
          <div><strong>Code:</strong> {record.wwdp_code}</div>
          <div><strong>Issued:</strong> {record.wwdp_issued}</div>
          <div><strong>Expiry:</strong> {record.wwdp_expiration}</div>
        </>
      )
    },

    // Grouped: HWG ID
    {
      title: "HWG ID",
      key: "hwg_id_group",
      render: (record) => (
        <>
          <div><strong>ID:</strong> {record.haz_id}</div>
          <div><strong>Issued:</strong> {record.haz_issued}</div>
        </>
      )
    },

    // Grouped: PCO
    {
      title: "PCO",
      key: "pco_group",
      render: (record) => (
        <>
          <div><strong>No:</strong> {record.pco_no}</div>
          <div><strong>Name:</strong> {record.pco_name}</div>
          <div><strong>Validity:</strong> {record.pco_validity}</div>
        </>
      )
    },
    { title: "Docket No", dataIndex: "docket_no", key: "docket_no" },
    {
      title: "DENR PAB Case No",
      dataIndex: "denr_pab_case_no",
      key: "denr_pab_case_no",
    },
    { title: "NOV Issued", dataIndex: "nov_issued", key: "nov_issued" },
    { title: "PD1586", dataIndex: "v_pd1586", key: "v_pd1586" },
    { title: "RA9275", dataIndex: "v_ra9275", key: "v_ra9275" },
    { title: "RA8749", dataIndex: "v_ra8749", key: "v_ra8749" },
    { title: "RA6969 Haz", dataIndex: "v_ra6969_haz", key: "v_ra6969_haz" },
    {
      title: "RA6969 T-Chem",
      dataIndex: "v_ra6969_tchem",
      key: "v_ra6969_tchem",
    },
    {
      title: "TC Date Actual",
      dataIndex: "tc_date_actual",
      key: "tc_date_actual",
    },
    {
      title: "Legal Officer",
      dataIndex: "legal_officer",
      key: "legal_officer",
    },
    {
      title: "TC Compliance Link",
      dataIndex: "tc_compliance_link",
      key: "tc_compliance_link",
    },
    { title: "Position Paper", dataIndex: "pos_paper", key: "pos_paper" },
    { title: "Penalty Date", dataIndex: "penalty_date", key: "penalty_date" },
    { title: "Amount", dataIndex: "amount", key: "amount" },
    { title: "OR Number", dataIndex: "or_number", key: "or_number" },
    {
      title: "TC Commitment",
      dataIndex: "tc_commitment",
      key: "tc_commitment",
    },
    {
      title: "Other TC Remarks",
      dataIndex: "other_tc_remarks",
      key: "other_tc_remarks",
    },
    {
      title: "Resolution Issued",
      dataIndex: "resolution_issued",
      key: "resolution_issued",
    },
    { title: "Order Issued", dataIndex: "order_issued", key: "order_issued" },
    { title: "Order Status", dataIndex: "order_status", key: "order_status" },
  ];

  return (
    <div style={{ padding: 20 }}>
      <Search
        placeholder="Search by Name"
        onSearch={handleSearch}
        enterButton
        style={{ width: 300, marginBottom: 16 }}
      />

      <Table
        dataSource={data}
        columns={columns}
        rowKey={(record) => record._id}
        pagination={{ ...pagination, total }}
        loading={loading}
        onChange={handleTableChange}
        scroll={{ x: 3000, y: 600 }}
        bordered
        size="small"
      />
    </div>
  );
};

export default RecordsConfig;
