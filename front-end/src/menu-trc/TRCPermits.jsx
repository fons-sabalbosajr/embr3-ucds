import React, { useEffect, useRef, useState } from "react";
import { Result, Avatar, Tooltip } from "antd";
import { io } from "socket.io-client";
import { SOCKET_URL } from "../config/api";

const TRCPermits = ({ currentUser }) => {
  const [trcViewers, setTrcViewers] = useState([]);
  const socketRef = useRef(null);
  const canViewDataHistory = currentUser?.capabilities?.canViewDataHistory === true;

  useEffect(() => {
    if (!currentUser?.username) return;

    if (!socketRef.current) {
      socketRef.current = io(SOCKET_URL, { withCredentials: true });
    }
    const socket = socketRef.current;

    const joinUserToTrc = () => {
      socket.emit("joinTrc", {
        user: {
          username: currentUser.username,
          avatar: currentUser.avatar || currentUser.avatarUrl,
          name: currentUser.name,
        },
      });
    };

    joinUserToTrc();

    const trcViewersHandler = (updatedViewers) => {
      // console.log("[TRCPermits.jsx] Received trcViewers update:", updatedViewers.map(u => u.username).join(', '));
      setTrcViewers(updatedViewers);
    };

    const handleConnect = () => {
      joinUserToTrc();
    };

    socket.on("trcViewers", trcViewersHandler);
    socket.on("connect", handleConnect);

    return () => {
      if (socketRef.current) {
        socketRef.current.emit("leaveTrc");
        socketRef.current.off("trcViewers", trcViewersHandler);
        socketRef.current.off("connect", handleConnect);
      }
    };
  }, [currentUser]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ margin: 0, marginRight: 12 }}>TRC Permits</h3>
        {canViewDataHistory && trcViewers.length > 0 && (
          <Avatar.Group
            max={{ count: 3 }}
            maxStyle={{ color: "#f56a00", backgroundColor: "#fde3cf", fontSize: 11 }}
            size={24}
          >
            {trcViewers.map((user) => (
              <Tooltip key={user.username} title={<span style={{ fontSize: "10px" }}>{`${user.username} is here`}</span>}>
                <Avatar src={user.avatar} style={{ marginLeft: 2, verticalAlign: "middle" }}>
                  {!user.avatar && user.username ? user.username[0].toUpperCase() : ""}
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

export default TRCPermits;