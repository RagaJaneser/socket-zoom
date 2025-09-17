// server.js
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

const emailToSocketMapping = new Map();
const socketIdToEmailMapping = new Map();

io.on("connection", (socket) => {
  console.log("New Connection..", socket.id);

  // ✅ Join Room
  socket.on("join-room", (data) => {
    const { roomId, emailId } = data;
    console.log("User", emailId, "Joined Room", roomId);

    emailToSocketMapping.set(emailId, socket.id);
    socketIdToEmailMapping.set(socket.id, emailId);

    socket.join(roomId);

    socket.emit("joined-room", { roomId });
    socket.broadcast.to(roomId).emit("user-joined", { emailId });
  });

  // ✅ Call User
  socket.on("call-user", (data) => {
    const { emailId, offer } = data;
    const fromEmail = socketIdToEmailMapping.get(socket.id);
    const socketId = emailToSocketMapping.get(emailId);
    if (socketId) {
      socket.to(socketId).emit("incomming-call", { from: fromEmail, offer });
    }
  });

  // ✅ Accept Call
  socket.on("call-accepted", (data) => {
    const { to, ans } = data;
    const fromEmail = socketIdToEmailMapping.get(socket.id);
    const socketId = emailToSocketMapping.get(to);
    if (socketId) {
      socket.to(socketId).emit("call-accepted", { from: fromEmail, ans });
    }
  });

  // ✅ ICE Candidate
  socket.on("ice-candidate", (data) => {
    const { roomId, candidate, to } = data;
    const fromEmail = socketIdToEmailMapping.get(socket.id);

    if (!fromEmail) {
      console.warn("ICE candidate from unknown user:", socket.id);
      return;
    }

    if (to) {
      const socketId = emailToSocketMapping.get(to);
      if (socketId) {
        socket.to(socketId).emit("ice-candidate", { from: fromEmail, candidate });
      }
    } else {
      socket.broadcast.to(roomId).emit("ice-candidate", { from: fromEmail, candidate });
    }
  });

  // ✅ Disconnect
  socket.on("disconnect", () => {
    const email = socketIdToEmailMapping.get(socket.id);
    if (email) {
      const rooms = Array.from(socket.rooms);
      rooms.forEach(roomId => {
        if (roomId !== socket.id) {
          socket.broadcast.to(roomId).emit("user-left", { emailId: email });
        }
      });

      emailToSocketMapping.delete(email);
      socketIdToEmailMapping.delete(socket.id);
      console.log("User disconnected:", email);
    }
  });
});

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
