import React, { useEffect, useRef, useState } from "react";
import { Result, Avatar, Tooltip } from "antd";
import { io } from "socket.io-client";

const ESWM = ({ currentUser }) => {
  const [eswmViewers, setEswmViewers] = useState([]);
  const socketRef = useRef(null);
  const canViewDataHistory = currentUser?.permissions?.[3];

  useEffect(() => {
    if (!currentUser?.username) return;

    if (!socketRef.current) {
      socketRef.current = io("http://localhost:8081", { withCredentials: true });
    }
    const socket = socketRef.current;

    const joinUserToEswm = () => {
      socket.emit("joinEswm", {
        user: {
          username: currentUser.username,
          avatar: currentUser.avatar || currentUser.avatarUrl,
          name: currentUser.name,
        },
      });
    };
    
    joinUserToEswm();

    const eswmViewersHandler = (updatedViewers) => {
      console.log("[ESWM.jsx] Received eswmViewers update:", updatedViewers.map(u => u.username).join(', '));
      setEswmViewers(updatedViewers);
    };

    const handleConnect = () => {
      joinUserToEswm();
    };

    socket.on("eswmViewers", eswmViewersHandler);
    socket.on("connect", handleConnect);

    return () => {
      if (socketRef.current) {
        socketRef.current.emit("leaveEswm");
        socketRef.current.off("eswmViewers", eswmViewersHandler);
        socketRef.current.off("connect", handleConnect);
      }
    };
  }, [currentUser]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ margin: 0, marginRight: 12 }}>ESWM Database</h3>
        {canViewDataHistory && eswmViewers.length > 0 && (
          <Avatar.Group
            max={{ count: 2 }}
            maxStyle={{
              color: "#f56a00",
              backgroundColor: "#fde3cf",
              fontSize: 11,
            }}
            size={24}
          >
            {eswmViewers.map((user) => (
              <Tooltip
                key={user.username}
                title={
                  <span style={{ fontSize: "10px" }}>
                    {`${user.username} is here`}
                  </span>
                }
              >
                <Avatar
                  src={user.avatar}
                  style={{ marginLeft: 2, verticalAlign: "middle" }}
                >
                  {!user.avatar && user.username
                    ? user.username[0].toUpperCase()
                    : ""}
                </Avatar>
              </Tooltip>
            ))}
          </Avatar.Group>
        )}
      </div>
      <Result
        status="404"
        title="404"
        subTitle="Sorry, the page you visited is under development."
      />
    </div>
  );
};

export default ESWM;