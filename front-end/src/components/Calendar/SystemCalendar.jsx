import React, { useState, useEffect, useMemo } from "react";
import {
  Calendar,
  Modal,
  Table,
  Typography,
  Dropdown,
  Menu,
  Button,
  Badge,
  Input,
  Tooltip,
  Pagination,
  Select as AntSelect,
} from "antd";
import { DownOutlined, SearchOutlined } from "@ant-design/icons";
import Swal from "sweetalert2";
import moment from "moment";
import {
  fetchMonitoredDates,
  fetchDailyNotices,
} from "../../api/calendarService";
import "./systemcalendar.css";

const parseDateString = (dateStrInput) => {
  if (!dateStrInput || typeof dateStrInput !== "string") {
    return null;
  }

  let dateStr = dateStrInput.trim();

  // Prioritized Check for YYYY-YYYY range
  const yearRangeMatch = dateStr.match(/^(\d{4})-(\d{4})$/);
  if (yearRangeMatch) {
    const endYear = parseInt(yearRangeMatch[2], 10);
    if (endYear >= 1900 && endYear < 2100) {
      return new Date(endYear, 11, 31); // December 31st of the end year
    }
    return null;
  }

  // Handle obvious non-date strings
  const nonDateKeywords = [
    "n/a",
    "pending",
    "approval",
    "ongoing",
    "application",
    "for approval",
    "verification",
    "unknown",
    "none",
    "---",
    "not applicable",
    "coa no",
    "ref no",
    "dp-r03",
    "fla-",
    "lexie's farm",
    "in-process",
    "app. no",
    "for verification",
    "new designated pco",
    "contact person",
  ];
  if (
    nonDateKeywords.some((keyword) => dateStr.toLowerCase().includes(keyword))
  ) {
    return null;
  }
  if (/^#+$/.test(dateStr)) return null;
  if (/^\d{1,2}\/\d{1,2}\/\-\d{4}$/.test(dateStr)) return null;

  // If multiple lines, take the first line
  const lines = dateStr.split(/[\n\r]/);
  dateStr = lines[0].trim();

  // Attempt direct parsing (handles YYYY-MM-DD, MM/DD/YYYY, "Month D, YYYY", "D-Month-YYYY")
  let d = new Date(dateStr);
  if (d instanceof Date && !isNaN(d)) {
    return d;
  }

  // Attempt to parse DD/MM/YYYY by rearranging to MM/DD/YYYY
  const dmYMatch = dateStr.match(/^(\d{1,2})[/\-\.](\d{1,2})[/\-\.](\d{4})$/);
  if (dmYMatch) {
    const day = parseInt(dmYMatch[1], 10);
    const month = parseInt(dmYMatch[2], 10);
    const year = parseInt(dmYMatch[3], 10);
    if (day > 12 && month <= 12 && year > 1900 && year < 2100) {
      d = new Date(`${month}/${day}/${year}`);
      if (d instanceof Date && !isNaN(d)) return d;
    }
  }

  // Handle cases like "Month. Day, YYYY" e.g. "Oct. 26, 2022" if direct parse failed
  const monthDotDayYearMatch = dateStr.match(
    /^([A-Za-z]{3,})\.?\s*(\d{1,2}),?\s*(\d{4})$/i
  );
  if (monthDotDayYearMatch) {
    const cleanedForParse = `${monthDotDayYearMatch[1]} ${monthDotDayYearMatch[2]} ${monthDotDayYearMatch[3]}`;
    d = new Date(cleanedForParse);
    if (d instanceof Date && !isNaN(d)) return d;
  }

  // Handle dates followed by extraneous text (e.g., "YYYY-MM-DD some_text" or "MM/DD/YYYY some_text")
  const dateFollowedByTextMatch = dateStr.match(
    /^(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/
  );
  if (dateFollowedByTextMatch) {
    d = new Date(dateFollowedByTextMatch[1]);
    if (d instanceof Date && !isNaN(d)) return d;
  }

  return null; // Could not parse
};

const isValidDate = (d) => d instanceof Date && !isNaN(d);

const isPermitExpired = (expiryDate, nowDate = new Date()) => {
  if (!isValidDate(expiryDate)) return false;
  // Compare date parts only: an item expiring "on" date X is not expired until date X+1.
  const todayDateOnly = new Date(
    nowDate.getFullYear(),
    nowDate.getMonth(),
    nowDate.getDate()
  );
  const expiryDateOnly = new Date(
    expiryDate.getFullYear(),
    expiryDate.getMonth(),
    expiryDate.getDate()
  );
  return todayDateOnly > expiryDateOnly;
};

const isPermitNearExpiry = (expiryDate, nowDate = new Date()) => {
  if (!isValidDate(expiryDate)) return false;
  const oneMonthBefore = new Date(expiryDate);
  oneMonthBefore.setMonth(oneMonthBefore.getMonth() - 1);

  const todayDateOnly = new Date(
    nowDate.getFullYear(),
    nowDate.getMonth(),
    nowDate.getDate()
  );
  const expiryDateOnly = new Date(
    expiryDate.getFullYear(),
    expiryDate.getMonth(),
    expiryDate.getDate()
  );

  // Near expiry if today is within the month leading up to expiry, inclusive, but not yet past.
  return (
    todayDateOnly >= oneMonthBefore &&
    todayDateOnly <= expiryDateOnly &&
    !(todayDateOnly > expiryDateOnly)
  );
};

const pcoLinks = {
  2022: "https://docs.google.com/spreadsheets/d/1gcXEZmt6i4Tb4-RjsX7nobSxyFVSX3Z3TMCMC-eW5Ck/edit?usp=sharing",
  2023: "https://docs.google.com/spreadsheets/d/1W9zH-i0g1u8Hdda-9QCiyhaXt4VlfE36rJA_X05c8WA/edit?usp=sharing",
  2024: "https://docs.google.com/spreadsheets/d/1k9FnHQgtLfkQUnyLEQr1O74ofZ82QsDalP83qsEmrEg/edit?usp=sharing",
  2025: "https://docs.google.com/spreadsheets/d/11ABWG1wiysjTWGdiPfhia9Z1htzdwx1g/edit?usp=sharing&ouid=109604379406534937129&rtpof=true&sd=true",
};

const getPCOLink = (pcoNo) => {
  const yearMatch = String(pcoNo).match(/\b(20\d{2})\b/);
  if (yearMatch && pcoLinks[yearMatch[1]]) {
    return pcoLinks[yearMatch[1]];
  }
  return null; // Return null if no matching year or link is found
};

const { Search } = Input;

const SystemCalendar = ({ theme }) => {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedNotices, setSelectedNotices] = useState([]);
  const [notices, setNotices] = useState([]);
  const [monitoredDates, setMonitoredDates] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [filteredData, setFilteredData] = useState([]); // This will hold the full filtered dataset
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const handlePermitClick = async ({
    e,
    permitName,
    permitValue,
    url,
    systemName,
    systemIdPattern,
  }) => {
    e.preventDefault();
    if (!permitValue) return;

    const trimmedPermitValue = permitValue.trim();
    const isSystemGenerated = systemIdPattern(trimmedPermitValue);

    const proceedToSystem = (showSuccessToast) => {
      window.open(url, "_blank", "noopener,noreferrer");
      navigator.clipboard
        .writeText(trimmedPermitValue)
        .then(() => {
          if (showSuccessToast) {
            Swal.fire({
              toast: true,
              position: "top-end",
              icon: "success",
              title: `${permitName} number copied!`,
              showConfirmButton: false,
              timer: 2000,
            });
          }
        })
        .catch(() => {
          // Fail silently as requested. The primary action (opening the link) succeeded.
        });
    };

    if (isSystemGenerated) {
      Swal.fire({
        title: `Go to ${systemName} Online System?`,
        html: `This will open ${systemName} Online System and attempt to copy the ${permitName} number:<br><b>${trimmedPermitValue}</b>`,
        icon: "info",
        showCancelButton: true,
        confirmButtonText: `Open ${systemName} Online System`,
        cancelButtonText: "Cancel",
      }).then((result) => {
        if (result.isConfirmed) {
          proceedToSystem(true);
        }
      });
    } else {
      // Manual number
      Swal.fire({
        title: `Manual ${permitName}`,
        html: `This ${permitName} number appears to be manually issued and may not be searchable in ${systemName} Online System.<br><b>${trimmedPermitValue}</b>`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: `Check ${systemName} Online System Anyway`,
        cancelButtonText: "Cancel",
      }).then((result) => {
        if (result.isConfirmed) {
          proceedToSystem(false); // Open link and try to copy, but don't show a success toast.
        }
      });
    }
  };

  const handleEccCncClick = (e, eccCncValue) => {
    if (!eccCncValue) return;
    const text = eccCncValue.toUpperCase();
    const isCnc = text.includes("CNC");

    handlePermitClick({
      e,
      permitName: isCnc ? "CNC" : "ECC",
      permitValue: eccCncValue,
      url: isCnc
        ? "https://cnconline.emb.gov.ph/live/Default.aspx"
        : "https://ecconline.emb.gov.ph/live/Account/Login.aspx",
      systemName: isCnc ? "CNC Online" : "ECC Online",
      systemIdPattern: (value) => value.toUpperCase().includes("OL"),
    });
  };

  const handlePCOClick = async (pcoNo) => {
    const pcoLink = getPCOLink(pcoNo);

    if (pcoLink) {
      // If a direct link is found, open it
      window.open(pcoLink, "_blank", "noopener,noreferrer");
    } else {
      // Otherwise, show a confirmation prompt
      const result = await Swal.fire({
        title: "PCO Status",
        text: "This PCO number is either on updating or being updated. Do you want to proceed to the master lists?",
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "Yes, proceed",
        cancelButtonText: "No, cancel",
      });

      if (result.isConfirmed) {
        // If user proceeds, show the list selection
        const inputOptions = Object.keys(pcoLinks).reduce((options, year) => {
          options[pcoLinks[year]] = `PCO Master List ${year}`;
          return options;
        }, {});

        const { value: url } = await Swal.fire({
          title: "Select a PCO Master List",
          input: "select",
          inputOptions,
          inputPlaceholder: "Select a list to check",
          showCancelButton: true,
          confirmButtonText: "Open List",
        });

        if (url) window.open(url, "_blank", "noopener,noreferrer");
      }
    }
  };

  useEffect(() => {
    const formatSortKey = (key) => {
      if (typeof key !== "string" || !key.includes("-")) {
        return key;
      }
      const [prefix, numberPart] = key.split("-");
      // Use parseInt to remove leading zeros, then convert back to string
      return `${prefix}-${parseInt(numberPart, 10)}`;
    };

    const loadCalendarData = async () => {
      try {
        // Fetch both sets of data concurrently for better performance
        const [monitoredDatesData, dailyNoticesData] = await Promise.all([
          fetchMonitoredDates(),
          fetchDailyNotices(),
        ]);
        // Apply formatting to sort_key for both datasets
        setMonitoredDates(
          monitoredDatesData.map((item) => ({
            ...item,
            sort_key: formatSortKey(item.sort_key),
          }))
        );
        setNotices(
          dailyNoticesData.map((item) => ({
            ...item,
            sort_key: formatSortKey(item.sort_key),
          }))
        );
      } catch (error) {
        // Errors are already logged in the service,
        // but you could add UI feedback here (e.g., a toast notification).
        console.error("Failed to load calendar data:", error);
      }
    };
    loadCalendarData();
  }, []);

  // Helper function to render IIS numbers as clickable links
  const renderIISLink = (iisNo) => {
    if (!iisNo) return null;
    const trimmedIisNo = iisNo.trim();
    return (
      <a
        href={`https://iis.emb.gov.ph/embis/dms/documents/tracker/?trn_no=${encodeURIComponent(
          trimmedIisNo
        )}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        {trimmedIisNo}
      </a>
    );
  };

  const handleSearch = (value) => {
    setSearchText(value);
    filterTableData(value);
  };

  const filterTableData = (value) => {
    const lowercasedValue = value.toLowerCase().trim();
    if (lowercasedValue === "") {
      setFilteredData(selectedNotices);
    } else {
      const filteredDataSource = selectedNotices.filter((item) =>
        Object.keys(item).some((key) =>
          item[key]?.toString().toLowerCase().includes(lowercasedValue)
        )
      );
      setFilteredData(filteredDataSource);
    }
    setCurrentPage(1); // Reset to first page on new search
  };

  const handlePageChange = (page, pageSize) => {
    // Pagination onChange provides both
    setCurrentPage(page);
  };

  const handlePageSizeChange = (value) => {
    setPageSize(value);
    setCurrentPage(1); // Reset to the first page when page size changes
  };
  // Utility function to darken a given color
  const darkenColor = (color, percent) => {
    const num = parseInt(color.slice(1), 16),
      amt = Math.round(2.55 * percent),
      R = (num >> 16) + amt,
      G = ((num >> 8) & 0x00ff) + amt,
      B = (num & 0x0000ff) + amt;

    return `#${(
      0x1000000 +
      (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
      (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
      (B < 255 ? (B < 1 ? 0 : B) : 255)
    )
      .toString(16)
      .slice(1)}`;
  };

  const getFontColorForBackground = (hexColor) => {
    if (!hexColor || hexColor === "transparent" || hexColor === null) {
      // Default font color for transparent background, depends on theme
      return theme === "dark" ? "#ffffff" : "#000000";
    }
    // Remove '#' if present
    const cleanHex = hexColor.startsWith("#") ? hexColor.slice(1) : hexColor;

    // Convert hex to RGB
    const r = parseInt(cleanHex.slice(0, 2), 16);
    const g = parseInt(cleanHex.slice(2, 4), 16);
    const b = parseInt(cleanHex.slice(4, 6), 16);

    // Calculate luminance (YIQ formula)
    const luminance = (r * 299 + g * 587 + b * 114) / 1000;
    return luminance > 150 ? "#000000" : "#ffffff"; // Threshold of 150 for good contrast
  };

  const sectionBackgroundColor = (section) => {
    switch (section) {
      case "PEMU_Aurora":
      case "PEMU_AURORA":
        return "#F0F3FF";

      case "PEMU_Bataan":
      case "PEMU_BATAAN":
        return "#FCE5BB"; // Biege. pero pag namonitor na, transparent

      case "PEMU_Bulacan":
      case "PEMU_BULACAN":
        return "#FCE5BB"; // Light purple

      case "PEMU_Nueva_Ecija":
      case "PEMU_NUEVA ECIJA":
      case "Pemu_Nueva_Ecija":
        return "#FFE225"; // Yellow

      case "PEMU_Pampanga":
      case "PEMU_PAMPANGA":
        return "#FFE225"; // Yellow

      case "PEMU_Tarlac":
      case "PEMU_TARLAC":
        return "#39C665"; // Green

      case "PEMU_Zambales":
      case "PEMU_ZAMBALES":
        return "#d1c4e9"; // Light lavender

      case "MBU":
      case "mbu":
        return "#FF9B3E"; // Light green

      case "TCHWMS":
      case "tchwms":
        return "#936DDF";

      case "AWECMES":
      case "awecmes":
        return "#c8e6c9";

      default:
        return "transparent"; // Default transparent background
    }
  };

  const measureTextWidth = (text, font = "14px Poppins") => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    context.font = font;
    return context.measureText(text).width;
  };

  const columns = [
    {
      title: "ID No.",
      dataIndex: "sort_key",
      key: "sort_key",
      width: 20,
      align: "center",
      onHeaderCell: () => ({ className: "table-header-center" }),
    },
    {
      title: "Industry Details",
      key: "industry_details",
      width: 100, // Adjusted width for combined content
      align: "left",
      render: (text, record) => (
        <div>
          <Typography.Text strong>{record.title}</Typography.Text>
          <br />
          <Typography.Text>{record.address}</Typography.Text>
        </div>
      ),
    },
    {
      title: "Industry Class",
      dataIndex: "industry_class",
      key: "industry_class",
      width: 80, // Explicit width
      align: "center",
    },
    {
      title: "Monitoring Date",
      key: "key_dates",
      width: 50,
      align: "left",
      render: (text, record) => {
        const dates = [];
        if (record.date_monitored) {
          dates.push(
            <div key="monitored">
              <strong>Monitored:</strong> {record.date_monitored}
            </div>
          );
        }
        if (record.date_routed) {
          dates.push(
            <div key="routed">
              <strong>Routed:</strong> {record.date_routed}
            </div>
          );
        }
        if (record.date_signed) {
          dates.push(
            <div key="signed">
              <strong>Signed:</strong> {record.date_signed}
            </div>
          );
        }
        return dates.length > 0 ? <div>{dates}</div> : null;
      },
    },
    {
      title: "IIS Transaction No.",
      key: "iis_transaction_no",
      align: "center",
      width: 50, // Adjusted width for combined content
      render: (text, record) => {
        const iis2024 = record.iis_no_2024;
        const iis2025 = record.iis_no_2025;
        const elements = [];

        if (iis2024) {
          elements.push(
            <div className="iis-label" key="iis2024">
              2024: {renderIISLink(iis2024)}
            </div>
          );
        }
        if (iis2025) {
          elements.push(
            <div className="iis-label" key="iis2025">
              2025: {renderIISLink(iis2025)}
            </div>
          );
        }

        if (elements.length === 0) {
          return null;
        }

        return <div>{elements}</div>;
      },
    },
    {
      title: "PISMU Tracking",
      dataIndex: "pismu_tracking",
      key: "pismu_tracking",
      width: 60,
      render: (text, record) => (
        <div>
          <div>{record.pismu_tracking}</div>
          {record.pismu_count_month && (
            <div style={{ fontSize: "0.85em", color: "#888" }}>
              ({record.pismu_count_month})
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Section Incharge",
      dataIndex: "section_incharged",
      key: "section_incharged",
      width: 50,
      align: "center",
      render: (text, record) => {
        // Ensure section_incharge is defined and not empty
        const sections = record.section_incharged
          ? record.section_incharged.split(",").map((section) => section.trim())
          : [];

        return (
          <div className="section-incharge-container">
            {sections.map((section, index) => {
              const textWidth = measureTextWidth(section, "10px Poppins"); // Match font-size from CSS
              const backgroundColor = sectionBackgroundColor(section); // Base background color

              const fontColor = getFontColorForBackground(backgroundColor); // Get contrasting font color

              // Determine tooltip color. Use a darker shade of the label's background.
              // If the label is transparent, the tooltip will use the default blue from CSS.
              const tooltipColor =
                backgroundColor !== "transparent"
                  ? darkenColor(backgroundColor, -40)
                  : undefined;

              return (
                <Tooltip
                  key={index}
                  className="tooltip-content-small"
                  title={
                    <div>
                      <div className="tooltip-header">
                        Section Incharge: {record.section_incharged || "N/A"}
                      </div>
                      <div className="tooltip-header">
                        FMR Section Incharge:{" "}
                        {record.fmr_section_incharged || "N/A"}
                      </div>
                      <div className="tooltip-header">Handler: {record.handler || "N/A"}</div>
                      <div className="tooltip-header">
                        Monitoring Schedule: {record.monitoring_sched || "N/A"}
                      </div>
                      <div className="tooltip-header">Inspection Type: {record.insp_type || "N/A"}</div>
                    </div>
                  }
                  color={tooltipColor}
                >
                  <div
                    className="industry-label"
                    style={{
                      backgroundColor: backgroundColor,
                      color: fontColor,
                      width: `${textWidth + 11}px`,
                    }}
                  >
                    {section}
                  </div>
                </Tooltip>
              );
            })}
          </div>
        );
      },
    },
    {
      title: "Remarks",
      dataIndex: "remarks",
      key: "remarks",
      width: 80,
      align: "center",
      render: (text, record) => {
        const remarksValue = record.remarks?.trim().toUpperCase(); // Ensure uppercase for comparison
        const iis2024 = record.iis_no_2024;
        const iis2025 = record.iis_no_2025;

        if (remarksValue === "FFM") {
          // If remarks is FFM
          return (
            <Tooltip
              title="For Further Monitoring"
              overlayClassName="tooltip-content-small"
            >
              <span>FFM</span>
            </Tooltip>
          );
        }

        if (remarksValue === "NOV") {
          // If remarks is NOV
          const hasLegalDetails =
            record.docket_no ||
            record.v_pd1586 ||
            record.v_ra8749 ||
            record.v_ra9275 ||
            record.v_ra6969_haz ||
            record.v_ra6969_tchem;

          let tooltipContent;
          if (hasLegalDetails) {
            tooltipContent = (
              <div className="tooltip-content-small">
                {record.docket_no && (
                  <div>
                    <strong>Docket No:</strong> {record.docket_no}
                  </div>
                )}
                {record.v_pd1586 && (
                  <div>
                    <strong>PD 1586:</strong> {record.v_pd1586}
                  </div>
                )}
                {record.v_ra8749 && (
                  <div>
                    <strong>RA 8749:</strong> {record.v_ra8749}
                  </div>
                )}
                {record.v_ra9275 && (
                  <div>
                    <strong>RA 9275:</strong> {record.v_ra9275}
                  </div>
                )}
                {record.v_ra6969_haz && (
                  <div>
                    <strong>RA 6969 (Haz):</strong> {record.v_ra6969_haz}
                  </div>
                )}
                {record.v_ra6969_tchem && (
                  <div>
                    <strong>RA 6969 (Chem):</strong> {record.v_ra6969_tchem}
                  </div>
                )}
              </div>
            );
          } else {
            // Fallback to IIS numbers if no legal details
            tooltipContent = (
              <div>
                {iis2024 || iis2025 ? (
                  <>
                    {iis2024 && (
                      <div className="iis-tooltip">
                        <strong>IIS 2024: </strong>
                        {renderIISLink(iis2024)}
                      </div>
                    )}
                    {iis2025 && (
                      <div className="iis-tooltip">
                        <strong>IIS 2025: </strong>
                        {renderIISLink(iis2025)}
                      </div>
                    )}
                  </>
                ) : (
                  <span>
                    No specific legal details or IIS numbers available.
                  </span>
                )}
              </div>
            );
          }
          return (
            <Tooltip
              title={tooltipContent}
              overlayClassName="tooltip-content-small"
            >
              <span>NOV</span>
            </Tooltip>
          );
        }

        // "Others" case: display the specific remark or a default message
        const displayText = record.remarks || "For Updating in Universe";
        const otherRemarksTooltipContent = (
          <div>
            {displayText}
            {(iis2024 || iis2025) && (
              <>
                <br />
                <strong>IIS Numbers:</strong>
                {iis2024 && (
                  <div className="iis-tooltip">
                    2024: {renderIISLink(iis2024)}
                  </div>
                )}
                {iis2025 && (
                  <div className="iis-tooltip">
                    2025: {renderIISLink(iis2025)}
                  </div>
                )}
              </>
            )}
          </div>
        );
        return (
          <Tooltip
            title={otherRemarksTooltipContent}
            overlayClassName="tooltip-content-small"
          >
            <span>{displayText}</span>
          </Tooltip>
        );
      },
    },
    {
      title: "Current Permits/Clearances",
      key: "permits",
      width: 80,
      align: "left",
      render: (text, record) => {
        const permits = [];

        if (record.ecc_cnc) {
          const values = String(record.ecc_cnc)
            .split("\n")
            .map((v) => v.trim())
            .filter(Boolean);
          permits.push(
            <div key="ecc_cnc" className="permit-row">
              <strong className="permit-label">ECC/CNC:</strong>
              <div>
                {values.map((value, index) => (
                  <div key={index}>
                    <a
                      href="#"
                      onClick={(e) => handleEccCncClick(e, value)}
                      className="pco-link"
                    >
                      {value}
                    </a>
                  </div>
                ))}
              </div>
            </div>
          );
        }

        if (record.pto_code) {
          const values = String(record.pto_code)
            .split("\n")
            .map((v) => v.trim())
            .filter(Boolean);
          permits.push(
            // PTO
            // Determine color based on expiry status
            (() => {
              const ptoIssuedDate = parseDateString(record.pto_issued);
              let ptoExpiryDate = null;
              if (isValidDate(ptoIssuedDate)) {
                ptoExpiryDate = new Date(ptoIssuedDate);
                ptoExpiryDate.setFullYear(ptoExpiryDate.getFullYear() + 2); // PTO valid for 2 years
              }

              let expiryStatusText = "";
              let color;
              if (!isValidDate(ptoExpiryDate)) {
                expiryStatusText = "N/A (For Updating in Universe)";
                color = theme === "dark" ? "#9e9e9e" : "#bdbdbd"; // Gray for N/A
              } else if (isPermitExpired(ptoExpiryDate)) {
                expiryStatusText = `Expired on ${ptoExpiryDate.toLocaleDateString()}`;
                color = theme === "dark" ? "#ff8a80" : "#e57373"; // Expired: Red
              } else if (isPermitNearExpiry(ptoExpiryDate)) {
                expiryStatusText = `Expires soon on ${ptoExpiryDate.toLocaleDateString()}`;
              } else {
                expiryStatusText = `Valid until ${ptoExpiryDate.toLocaleDateString()}`;
              }

              return (
                <div key="pto_code" className="permit-row">
                  <strong className="permit-label">PTO:</strong>
                  <div>
                    {values.map((value, index) => (
                      <div key={index}>
                        <Tooltip
                          title={
                            <div className="tooltip-content-small">
                              <strong>Status:</strong> {expiryStatusText}
                            </div>
                          }
                          overlayClassName="tooltip-content-small"
                        >
                          <a
                            href="#"
                            onClick={(e) =>
                              handlePermitClick({
                                e,
                                permitName: "PTO",
                                permitValue: value,
                                url: "https://opms.emb.gov.ph/manage/all/applications/",
                                systemName: "OPMS",
                                systemIdPattern: (v) =>
                                  v.toUpperCase().includes("OL"),
                              })
                            }
                            className="pco-link"
                            style={{ color: color }} // Apply color here
                          >
                            {value}
                          </a>
                        </Tooltip>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()
          );
        }

        if (record.wwdp_code) {
          const values = String(record.wwdp_code)
            .split("\n")
            .map((v) => v.trim())
            .filter(Boolean);
          permits.push(
            // WWDP
            // Determine color based on expiry status
            (() => {
              const wwdpIssuedDate = parseDateString(record.wwdp_issued);
              let wwdpExpiryDate = null;
              if (isValidDate(wwdpIssuedDate)) {
                wwdpExpiryDate = new Date(wwdpIssuedDate);
                wwdpExpiryDate.setFullYear(wwdpExpiryDate.getFullYear() + 1); // WWDP valid for 1 year
              }

              let expiryStatusText = "";
              let color;
              if (!isValidDate(wwdpExpiryDate)) {
                expiryStatusText = "N/A (Date not available)";
                color = theme === "dark" ? "#9e9e9e" : "#bdbdbd"; // Gray for N/A
              } else if (isPermitExpired(wwdpExpiryDate)) {
                expiryStatusText = `Expired on ${wwdpExpiryDate.toLocaleDateString()}`;
                color = theme === "dark" ? "#ff8a80" : "#e57373"; // Expired: Red
              } else if (isPermitNearExpiry(wwdpExpiryDate)) {
                expiryStatusText = `Expires soon on ${wwdpExpiryDate.toLocaleDateString()}`;
              } else {
                expiryStatusText = `Valid until ${wwdpExpiryDate.toLocaleDateString()}`;
              }
              return (
                <div key="wwdp_code" className="permit-row">
                  <strong className="permit-label">WWDP:</strong>
                  <div>
                    {values.map((value, index) => (
                      <div key={index}>
                        <Tooltip
                          title={
                            <div className="tooltip-content-small">
                              <strong>Status:</strong> {expiryStatusText}
                            </div>
                          }
                          overlayClassName="tooltip-content-small"
                        >
                          <a
                            href="#"
                            onClick={(e) =>
                              handlePermitClick({
                                e,
                                permitName: "WWDP",
                                permitValue: value,
                                url: "https://opms.emb.gov.ph/manage/all/applications/",
                                systemName: "OPMS",
                                systemIdPattern: (v) =>
                                  v.toUpperCase().includes("OL"),
                              })
                            }
                            className="pco-link"
                            style={{ color: color }} // Apply color here
                          >
                            {value}
                          </a>
                        </Tooltip>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()
          );
        }

        if (record.haz_id) {
          const values = String(record.haz_id)
            .split("\n")
            .map((v) => v.trim())
            .filter(Boolean);
          permits.push(
            // HAZ_ID (HWG ID) - No expiry logic requested for this, so keeping default color
            <div key="haz_id" className="permit-row">
              <strong className="permit-label">HWG ID:</strong>
              <div>
                {values.map((value, index) => (
                  <div key={index}>
                    <a
                      href="#"
                      onClick={(e) =>
                        handlePermitClick({
                          e,
                          permitName: "HWG ID",
                          permitValue: value,
                          url: "https://hwms.emb.gov.ph/application/all-applications",
                          systemName: "HWMS",
                          systemIdPattern: (v) =>
                            v.toUpperCase().includes("OL"),
                        })
                      }
                      className="pco-link"
                    >
                      {value}
                    </a>
                  </div>
                ))}
              </div>
            </div>
          );
        }

        if (record.pco_no) {
          const values = String(record.pco_no)
            .split("\n")
            .map((v) => v.trim())
            .filter(Boolean);
          permits.push(
            // PCO
            // Determine color based on expiry status
            (() => {
              const pcoValidityDate = parseDateString(record.pco_validity);
              let pcoExpiryDate = null;
              if (isValidDate(pcoValidityDate)) {
                pcoExpiryDate = pcoValidityDate; // PCO validity is the expiry date
              }

              let expiryStatusText = "";
              let color;
              if (!isValidDate(pcoExpiryDate)) {
                expiryStatusText = "N/A (Date not available)";
                color = theme === "dark" ? "#9e9e9e" : "#bdbdbd"; // Gray for N/A
              } else if (isPermitExpired(pcoExpiryDate)) {
                expiryStatusText = `Expired on ${pcoExpiryDate.toLocaleDateString()}`;
                color = theme === "dark" ? "#ff8a80" : "#e57373"; // Expired: Red
              } else if (isPermitNearExpiry(pcoExpiryDate)) {
                expiryStatusText = `Expires soon on ${pcoExpiryDate.toLocaleDateString()}`;
              } else {
                expiryStatusText = `Valid until ${pcoExpiryDate.toLocaleDateString()}`;
              }
              return (
                <div key="pco_no" className="permit-row">
                  <strong className="permit-label">PCO:</strong>
                  <div>
                    {values.map((value, index) => (
                      <div key={index}>
                        <Tooltip
                          title={
                            <div className="tooltip-content-small">
                              <strong>Status:</strong> {expiryStatusText}
                            </div>
                          }
                          overlayClassName="tooltip-content-small"
                        >
                          <a
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              handlePCOClick(value);
                            }}
                            className="pco-link"
                            style={{ color: color }} // Apply color here
                          >
                            {value}
                          </a>
                        </Tooltip>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()
          );
        }

        return permits.length > 0 ? <div>{permits}</div> : null;
      },
    },
  ];

  const onSelect = (date) => {
    const formattedDate = date.format("M/DD/YYYY");
    const dailyNotices = notices.filter(
      (notice) => notice.date_monitored === formattedDate
    );
    const monitoredTitle = monitoredDates.find(
      (item) => item.date_monitored === formattedDate
    )?.title;

    if (dailyNotices.length > 0 || monitoredTitle) {
      setSelectedDate(formattedDate);
      setSelectedNotices(dailyNotices);
      setFilteredData(dailyNotices); // Set filtered data for the selected date
      setIsModalVisible(true);
    }
  };

  const handleCancel = () => {
    setIsModalVisible(false);
    setSelectedDate("");
    setSelectedNotices([]);
    setSearchText(""); // Clear search text when modal is closed
    setFilteredData([]); // Clear filtered data
  };

  // Calculate data for the current page
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredData.slice(startIndex, endIndex);
  }, [filteredData, currentPage, pageSize]);

  const dateCellRender = (date) => {
    const formattedDate = date.format("M/DD/YYYY");
    let dailyNotices = notices.filter(
      (notice) => notice.date_monitored === formattedDate
    );
    const monitoredTitle = monitoredDates.find(
      (item) => item.date_monitored === formattedDate
    )?.title;
    const hasData = dailyNotices.length > 0 || monitoredTitle;

    // Sort notices to prioritize those with non-empty titles
    dailyNotices = dailyNotices.sort((a, b) => {
      if (a.title && !b.title) return -1;
      if (!a.title && b.title) return 1;
      return 0;
    });

    const displayNotices = dailyNotices.slice(0, 3); // Display only the first 2 notices

    return (
      <div className={hasData ? "clickable-date" : ""}>
        <ul className="events" style={{ padding: "0", margin: "0" }}>
          {displayNotices.length > 0 &&
            displayNotices.map((notice, index) => (
              <li key={index}>
                <Badge
                  status="success"
                  text={
                    <span style={{ fontSize: "11px" }}>{notice.title}</span>
                  }
                  className="event-title"
                />
              </li>
            ))}
          {dailyNotices.length > 1 && (
            <li
              className="see-more"
              style={{ fontSize: "9px", marginTop: "5px  " }}
            >
              See {dailyNotices.length - 1} more...
            </li>
          )}
        </ul>
      </div>
    );
  };

  return (
    <div
      className={`calendar-container ${
        theme === "dark" ? "theme-dark" : "theme-light"
      }`}
    >
      <h3 className="calendar-title">Monitoring Calendar</h3>
      <Calendar
        onSelect={onSelect}
        cellRender={dateCellRender}
        className="custom-calendar"
      />
      <Modal
        title={
          <div className="modal-title-container">
            <span>{`Monitored Industries as of ${selectedDate}`}</span>
            <span className="modal-title-count">
              Total Count: {selectedNotices.length}
            </span>
          </div>
        }
        open={isModalVisible}
        onCancel={handleCancel}
        footer={null}
        width={1000}
        className="calendar-modal"
        zIndex={1000}
        style={{ top: 40 }}
      >
        <div className="modal-controls-container">
          <Search
            placeholder="Search industries"
            onChange={(e) => handleSearch(e.target.value)}
            className="search-input-calendar"
            prefix={<SearchOutlined />}
            allowClear
            value={searchText}
          />
          <Pagination
            simple
            current={currentPage}
            pageSize={pageSize}
            total={filteredData.length}
            onChange={handlePageChange}
            showSizeChanger // Enable page size changer
            onShowSizeChange={(current, size) => handlePageSizeChange(size)} // Pass size to handler
            pageSizeOptions={["10", "20", "50", "100"]} // Options for page size
          />
        </div>
        <Table
          dataSource={paginatedData}
          columns={columns}
          pagination={false}
          scroll={{ x: 2200, y: 500 }} // Adjusted horizontal scroll width to fit all columns
          size="small"
          className="custom-table"
        />
      </Modal>
    </div>
  );
};

export default SystemCalendar;
