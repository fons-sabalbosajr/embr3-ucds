const { Server } = require('socket.io');

// In-memory store for online users per province
let provinceViewers = {}; // Changed to let if you plan to reassign; if not, const is fine.
const mbuViewers = [];

// Generic manager for array-based viewer lists
function createViewerManager(viewersArray, viewersEventName, socketUserKey, logPrefix) {
  const join = (socket, io, { user }) => {
    if (!user || typeof user.username !== 'string') {
      // console.error(`[Socket ${socket.id}] join${logPrefix}: Invalid user object or username missing. User:`, user);
      return;
    }
    socket[socketUserKey] = { ...user }; // Store a copy

    // Filter out the old version of the user, then add the new one
    const otherViewers = viewersArray.filter(u => u.username !== socket[socketUserKey].username);
    viewersArray.length = 0; // Clear current array
    viewersArray.push(...otherViewers, socket[socketUserKey]); // Add others back, then the current user

    io.emit(viewersEventName, viewersArray);
    // console.log(`[Socket ${socket.id}] User ${socket[socketUserKey].username} joined ${logPrefix}. Viewers:`, viewersArray.map(u => u.username).join(', ') || 'empty');
  };

  const leave = (socket, io, reason = "unknown") => {
    if (socket[socketUserKey] && typeof socket[socketUserKey].username === 'string') {
      const usernameToRemove = socket[socketUserKey].username;
      // console.log(`[Socket ${socket.id}] leave${logPrefix} (reason: ${reason}): Attempting to remove user: ${usernameToRemove}`);
      const initialLength = viewersArray.length;
      const updatedViewers = viewersArray.filter(u => u.username !== usernameToRemove);

      if (updatedViewers.length < initialLength) {
        viewersArray.length = 0;
        viewersArray.push(...updatedViewers);
      }
      io.emit(viewersEventName, viewersArray);
      // console.log(`[Socket ${socket.id}] leave${logPrefix}: ${viewersEventName} AFTER removal attempt:`, viewersArray.map(u => u.username).join(', ') || 'empty');
      socket[socketUserKey] = null; // Clear the user from socket instance for this room
    }
  };
  return { join, leave };
}

function setupSocket(server, allowedOrigins) { // Accept allowedOrigins as a parameter
  const io = new Server(server, {
    cors: {
      origin: allowedOrigins, // Use the passed allowedOrigins array
      credentials: true,
    },
  });

  const mbuManager = createViewerManager(mbuViewers, "mbuViewers", "mbuUser", "MBU");

  io.on("connection", (socket) => {
    // console.log(`[Socket ${socket.id}] connected.`);

    socket.on("joinProvince", ({ province, user }) => {
      if (!province || !user || !user.username) {
        // console.error(`[Socket ${socket.id}] joinProvince: Invalid province or user object received. Province: ${province}, User:`, user);
        return;
      }
      socket.province = province;
      socket.user = { ...user }; // Store a copy

      if (!provinceViewers[province]) provinceViewers[province] = [];
      // Only remove previous entries with the same userId
      provinceViewers[province] = provinceViewers[province].filter(
        (u) => u.username !== socket.user.username
      );
      provinceViewers[province].push(socket.user);
      io.emit("provinceViewers", provinceViewers);
      // console.log(
      //   `[Socket ${socket.id}] User ${socket.user.username} joined province ${province}. Current viewers for ${province}:`,
      //   provinceViewers[province].map(u => u.username).join(', ')
      // );
    });

    socket.on("joinMbu", (payload) => mbuManager.join(socket, io, payload));

    function leaveProvince(reason = "unknown") {
      const { province, user } = socket;
      if (province && user && user.username && provinceViewers[province]) { // Added user.username check
        const usernameToRemove = user.username;
        // console.log(`[Socket ${socket.id}] leaveProvince (reason: ${reason}): Attempting to remove ${usernameToRemove} from ${province}.`);
        // console.log(`[Socket ${socket.id}] provinceViewers['${province}'] BEFORE removal:`, (provinceViewers[province] || []).map(u => u.username).join(', ') || 'empty');

        const initialLength = provinceViewers[province].length;
        provinceViewers[province] = provinceViewers[province].filter(
          (u) => u.username !== usernameToRemove
        );

        if (provinceViewers[province].length < initialLength) {
            // console.log(`[Socket ${socket.id}] Successfully removed ${usernameToRemove} from province ${province}.`);
        } else {
            // console.log(`[Socket ${socket.id}] Did NOT find user ${usernameToRemove} in province ${province}. socket.user was:`, user);
        }
        io.emit("provinceViewers", provinceViewers);
        // console.log(
        //   `[Socket ${socket.id}] leaveProvince: User ${usernameToRemove} left province ${province}. Viewers for ${province}:`,
        //   (provinceViewers[province] || []).map(u => u.username).join(', ') || 'empty'
        // );
      }
    }

    socket.on("leaveProvince", () => leaveProvince("event"));
    socket.on("leaveMbu", () => mbuManager.leave(socket, io, "event"));

    socket.on("disconnect", () => {
      // console.log(`[Socket ${socket.id}] disconnected.`);
      leaveProvince("disconnect");
      mbuManager.leave(socket, io, "disconnect");
    });
  });
}

module.exports = { setupSocket }; // Export setupSocket
