const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const bodyParser = require("body-parser");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
});

app.use(bodyParser.json());

// Room-wise users: { roomId: [emailId1, emailId2, ...] }
const rooms = new Map();
// Maps for socket to email
const emailToSocketMapping = new Map();
const socketIdToEmailMapping = new Map();

io.on("connection", (socket) => {
  console.log("New Connection:", socket.id);

  // ---- Join Room ----
  socket.on("join-room", (data) => {
    const { roomId, emailId } = data;

    // Add to room
    if (!rooms.has(roomId)) rooms.set(roomId, []);
    rooms.get(roomId).push(emailId);

    // Save mappings
    emailToSocketMapping.set(emailId, socket.id);
    socketIdToEmailMapping.set(socket.id, emailId);

    socket.join(roomId);

    // Send existing participants to new user
    const existingUsers = rooms.get(roomId).filter((e) => e !== emailId);
    socket.emit("existing-users", { users: existingUsers });

    // Notify all others in room
    socket.broadcast.to(roomId).emit("user-joined", { emailId });

    console.log(`User ${emailId} joined room ${roomId}`);
  });

  // ---- Call User ----
  socket.on("call-user", (data) => {
    const { emailId, offer } = data;
    const fromEmail = socketIdToEmailMapping.get(socket.id);
    const socketId = emailToSocketMapping.get(emailId);
    if (socketId) {
      socket.to(socketId).emit("incoming-call", { from: fromEmail, offer });
    }
  });

  // ---- Call Accepted ----
  socket.on("call-accepted", (data) => {
    const { emailId, ans } = data;
    const socketId = emailToSocketMapping.get(emailId);
    if (socketId) {
      socket.to(socketId).emit("call-accepted", { ans });
    }
  });

  // ---- ICE Candidates ----
  socket.on("ice-candidate", (data) => {
    const { roomId, candidate, to } = data;
    if (to) {
      // Send to specific user
      const socketId = emailToSocketMapping.get(to);
      if (socketId) {
        socket.to(socketId).emit("ice-candidate", {
          candidate,
          from: socketIdToEmailMapping.get(socket.id),
        });
      }
    } else {
      // Broadcast to all except sender
      socket.broadcast.to(roomId).emit("ice-candidate", {
        candidate,
        from: socketIdToEmailMapping.get(socket.id),
      });
    }
  });

  // ---- Disconnect ----
  socket.on("disconnect", () => {
    const email = socketIdToEmailMapping.get(socket.id);

    // Remove from rooms
    rooms.forEach((users, roomId) => {
      if (users.includes(email)) {
        const updatedUsers = users.filter((u) => u !== email);
        rooms.set(roomId, updatedUsers);

        // Notify remaining users
        socket.broadcast.to(roomId).emit("user-left", { emailId: email });
      }
    });

    // Remove mappings
    emailToSocketMapping.delete(email);
    socketIdToEmailMapping.delete(socket.id);

    console.log("User disconnected:", email);
  });
});

const PORT = process.env.PORT || 8000;
const HOST = "0.0.0.0";
server.listen(PORT, HOST, () => console.log(`Server running on ${PORT}`));
