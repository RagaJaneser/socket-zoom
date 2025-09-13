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

// Maps for user management
const emailToSocketMapping = new Map();
const socketIdToEmailMapping = new Map();
const roomParticipants = new Map(); // roomId -> Set of emailIds

io.on("connection", (socket) => {
  console.log("New Connection..");

  // ---- Join Room ----
  socket.on("join-room", (data) => {
    const { roomId, emailId } = data;
    if (!roomParticipants.has(roomId)) roomParticipants.set(roomId, new Set());
    roomParticipants.get(roomId).add(emailId);

    emailToSocketMapping.set(emailId, socket.id);
    socketIdToEmailMapping.set(socket.id, emailId);

    socket.join(roomId);

    // Send current participants to new user
    socket.emit("joined-room", {
      roomId,
      participants: Array.from(roomParticipants.get(roomId)).filter((id) => id !== emailId),
    });

    // Notify existing participants
    socket.broadcast.to(roomId).emit("user-joined", { emailId });
  });

  // ---- Call User ----
  socket.on("call-user", (data) => {
    const { emailId, offer } = data;
    const fromEmail = socketIdToEmailMapping.get(socket.id);
    const socketId = emailToSocketMapping.get(emailId);
    socket.to(socketId).emit("incoming-call", { from: fromEmail, offer });
  });

  // ---- Call Accepted ----
  socket.on("call-accepted", (data) => {
    const { emailId, ans } = data;
    const socketId = emailToSocketMapping.get(emailId);
    socket.to(socketId).emit("call-accepted", { ans });
  });

  // ---- Forward ICE candidates ----
  socket.on("ice-candidate", (data) => {
    const { roomId, candidate } = data;
    socket.broadcast.to(roomId).emit("ice-candidate", { candidate, from: socketIdToEmailMapping.get(socket.id) });
  });

  // ---- Disconnect ----
  socket.on("disconnect", () => {
    const email = socketIdToEmailMapping.get(socket.id);

    socketIdToEmailMapping.delete(socket.id);
    emailToSocketMapping.delete(email);

    // Remove from roomParticipants and notify
    roomParticipants.forEach((participants, roomId) => {
      if (participants.has(email)) {
        participants.delete(email);
        socket.broadcast.to(roomId).emit("user-left", { emailId: email });
      }
    });

    console.log("User disconnected:", email);
  });
});

const PORT = process.env.PORT || 8000;
const HOST = "0.0.0.0"; // for Railway
server.listen(PORT, HOST, () => console.log(`Server running on ${PORT}`));
