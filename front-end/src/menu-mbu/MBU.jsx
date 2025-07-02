import React, { useEffect, useRef, useState } from "react";
import { Result, Avatar, Tooltip } from "antd";
import { io } from "socket.io-client";

const MBU = ({ currentUser }) => {
  const [mbuViewers, setMbuViewers] = useState([]);
  const socketRef = useRef(null);
  const canViewDataHistory = currentUser?.permissions?.[3];

  useEffect(() => {
    if (!currentUser?.username) return;

    if (!socketRef.current) {
      socketRef.current = io("http://10.14.77.107:8081", { withCredentials: true });
    }
    const socket = socketRef.current;

    const joinUserToMbu = () => {
      socket.emit("joinMbu", {
        user: {
          username: currentUser.username,
          avatar: currentUser.avatar || currentUser.avatarUrl,
          name: currentUser.name,
        },
      });
    };

    joinUserToMbu();

    const mbuViewersHandler = (updatedViewers) => {
      console.log("[MBU.jsx] Received mbuViewers update:", updatedViewers.map(u => u.username).join(', '));
      setMbuViewers(updatedViewers);
    };

    const handleConnect = () => {
      joinUserToMbu();
    };

    socket.on("mbuViewers", mbuViewersHandler);
    socket.on("connect", handleConnect);

    return () => {
      if (socketRef.current) {
        socketRef.current.emit("leaveMbu");
        socketRef.current.off("mbuViewers", mbuViewersHandler);
        socketRef.current.off("connect", handleConnect);
      }
    };
  }, [currentUser]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ margin: 0, marginRight: 12 }}>Manila Bay Pipeline</h3>
        {canViewDataHistory && mbuViewers.length > 0 && (
          <Avatar.Group
            max={{ count: 3 }}
            maxStyle={{ color: "#f56a00", backgroundColor: "#fde3cf", fontSize: 11 }}
            size={24}
          >
            {mbuViewers.map((user) => (
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
export default MBU;
