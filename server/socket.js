const { Server } = require("socket.io");

// In-memory store for online users per province
const provinceViewers = {}; // { provinceName: [ { userId, username, avatar } ] }

function setupSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: "http://localhost:5173", // Adjust as needed
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    // When a user enters a province
    socket.on("joinProvince", ({ province, user }) => {
      socket.province = province;
      socket.user = user;

      if (!provinceViewers[province]) provinceViewers[province] = [];
      // Prevent duplicates
      if (!provinceViewers[province].some(u => u.userId === user.userId)) {
        provinceViewers[province].push(user);
      }
      io.emit("provinceViewers", provinceViewers);
    });

    // When a user leaves a province or disconnects
    function leaveProvince() {
      const { province, user } = socket;
      if (province && user && provinceViewers[province]) {
        provinceViewers[province] = provinceViewers[province].filter(
          (u) => u.userId !== user.userId
        );
        io.emit("provinceViewers", provinceViewers);
      }
    }

    socket.on("leaveProvince", leaveProvince);
    socket.on("disconnect", leaveProvince);
  });
}

module.exports = setupSocket;