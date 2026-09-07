// useLogs.js
import { useState, useEffect } from 'react';

const useLogs = () => {
  const [logs, setLogs] = useState([]);

  const log = (message) => {
    console.log(message);
    setLogs((prevLogs) => [...prevLogs, message]);
  };

  useEffect(() => {
    return () => {
      setLogs([]);
    };
  }, []);

  return { log, logs };
};

export default useLogs;