import React, { useState, useEffect } from "react";
import axios from "axios";
import { Table, Spin, Alert, Empty, notification } from "antd";
import moment from "moment";
import "./reportdrafts.css";

const ReportDrafts = () => {
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentUser, setCurrentUser] = useState(null); // State for the current user


  const fetchCurrentUser = async () => {
    try {
      const response = await axios.get("https://embr3-ucds.onrender.com/current-user", {
        withCredentials: true,
      });
      setCurrentUser(response.data);
    } catch (err) {
      setError("Error fetching user information: " + err.message);
    }
  };
  


  const fetchWithRetry = async (url, options, retries = 3, delay = 1000) => {
    try {
      const response = await axios.get(url, options);
      return response;
    } catch (error) {
      if (retries === 0) {
        throw error;
      }
      // Wait for a specified delay before retrying
      await new Promise(res => setTimeout(res, delay));
      return fetchWithRetry(url, options, retries - 1, delay * 2); // Exponential backoff
    }
  };
  


  const fetchDraftReports = async () => {
    try {
      const response = await fetchWithRetry(
        "https://embr3-ucds.onrender.com/api/draft-report",
        { withCredentials: true }
      );

      if (!Array.isArray(response.data)) {
        throw new Error("Unexpected response format");
      }

      const filteredData = response.data.filter((draft) =>
        currentUser ? draft.user.name === currentUser.name : true
      );

      const formattedData = filteredData.map((draft) => {
        return {
          reportId: draft._id,
          userName: draft.user?.name || "Unknown User",
          dateCreated: draft.date
            ? moment(draft.date).format("MMMM D, YYYY h:mm A")
            : "Unknown Date",
          title: draft.reportInfo?.title || "No Title Available",
          eccCnc: draft.reportInfo?.ecc_cnc || "No ECC/CNC Available",
          address: draft.reportInfo?.address || "No Address Available",
          fileName: draft.fileName || "No filename available",
          pdfUrl: draft.pdfUrl
            ? `https://embr3-ucds.onrender.com/api/files/${draft.fileName}`
            : "No URL Available",
        };
      });

      setDrafts(formattedData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    fetchCurrentUser(); // Fetch the current user when the component mounts
  }, []);

  useEffect(() => {
    if (currentUser) {
      fetchDraftReports(); // Fetch draft reports only after user information is available
    }
  }, [currentUser]);


    useEffect(() => {
    const intervalId = setInterval(() => {
      if (currentUser) {
        fetchDraftReports(); // Refresh reports every 15 seconds if user information is available
      }
    }, 15000);
    return () => clearInterval(intervalId);
  }, [currentUser]);


  const columns = [
    {
      title: "Date Created/User",
      dataIndex: "dateCreated",
      key: "dateCreated",
      align: "left",
      render: (text, record) => (
        <div>
          <div>{moment(record.dateCreated).format("MMMM D, YYYY h:mm A")}</div>
          <div>{record.userName}</div>
        </div>
      ),
    },
    {
      title: "Title",
      dataIndex: "title",
      key: "title",
      align: "left",
    },
    {
      title: "Address",
      dataIndex: "address",
      key: "address",
      align: "left",
    },
    {
      title: "Draft File Name",
      dataIndex: "fileName",
      key: "fileName",
      align: "left",
      render: (fileName, record) => {
        const handleClick = (event) => {
          event.preventDefault(); // Prevent default link behavior
          
          // Show notification
          notification.info({
            message: "File Downloaded",
            description: `The file "${fileName}" has been downloaded. Please check the "Downloads Folder."`,
            placement: "topRight",
          });
        };
  
        return (
          <a
            href={record.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleClick}
          >
            {fileName}
          </a>
        );
      },
    }
  ];
  

  if (loading) {
    return <Spin size="large" />;
  }

  if (error) {
    return <Alert message="Error" description={error} type="error" />;
  }

  if (drafts.length === 0) {
    return <Empty description="No draft reports available" />;
  }

  return (
    <div>
      <div className="report-title">
        <h3>Report Logs</h3>
        <p>
          Ensure that the data is up-to-date before proceeding with report
          generation. Please update any outdated data as necessary.
        </p>
      </div>

      <Table columns={columns} dataSource={drafts} rowKey="reportId" />
    </div>
  );
};

export default ReportDrafts;
