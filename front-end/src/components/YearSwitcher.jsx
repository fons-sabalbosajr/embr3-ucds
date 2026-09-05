import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dropdown, Tag, Modal } from "antd";
import { DownOutlined, DatabaseOutlined, CheckOutlined, AppstoreOutlined } from "@ant-design/icons";
import { useYear } from "../context/YearContext";
import { ROUTES } from "../config/routes";
import "./yearswitcher.css";

/**
 * Active-year indicator and switcher for the application header.
 * Lists only the containers the backend says this user may enter.
 */
const YearSwitcher = ({ theme }) => {
  const { activeYear, years, selectYear } = useYear();
  const [switching, setSwitching] = useState(false);
  const navigate = useNavigate();

  if (!activeYear) return null;

  const change = async (year) => {
    if (year === activeYear || switching) return;
    setSwitching(true);
    try {
      await selectYear(year);
      // Remount the app so every page refetches under the new container
      // instead of showing the previous year's rows.
      navigate(0);
    } catch (e) {
      Modal.error({
        title: "Cannot switch year",
        content:
          e?.response?.data?.error ||
          `You are not authorized to access the ${year} data container.`,
      });
      setSwitching(false);
    }
  };

  const items = [
    {
      key: "heading",
      label: <span className="yearswitcher-heading">Year container</span>,
      disabled: true,
    },
    ...years.map((y) => ({
      key: String(y.year),
      icon: y.year === activeYear ? <CheckOutlined /> : <DatabaseOutlined />,
      label: (
        <span className={y.year === activeYear ? "yearswitcher-item active" : "yearswitcher-item"}>
          {y.year} <span className="yearswitcher-item-sub">Data</span>
        </span>
      ),
      onClick: () => change(y.year),
    })),
    { type: "divider" },
    {
      key: "all",
      icon: <AppstoreOutlined />,
      label: "All year containers…",
      onClick: () => navigate(ROUTES.selectYear),
    },
  ];

  return (
    <Dropdown menu={{ items }} trigger={["click"]} disabled={switching}>
      <button
        type="button"
        className={`yearswitcher ${theme === "dark" ? "dark" : ""}`}
        aria-label={`Active year container ${activeYear}. Change year.`}
      >
        <Tag color="green" className="yearswitcher-tag">
          {activeYear} DATA
        </Tag>
        <DownOutlined className="yearswitcher-caret" />
      </button>
    </Dropdown>
  );
};

export default YearSwitcher;
