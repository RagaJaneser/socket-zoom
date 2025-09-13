const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const bodyParser = require("body-parser");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }, // ⚠️ restrict in production
});

app.use(bodyParser.json());

// Mappings
const emailToSocketMapping = new Map(); // email -> socketId
const socketIdToEmailMapping = new Map(); // socketId -> email

io.on("connection", (socket) => {
  console.log("New connection:", socket.id);

  // When a user joins a room
  socket.on("join-room", ({ roomId, emailId }) => {
    if (!roomId || !emailId) return;
    console.log("User", emailId, "joined room", roomId);

    emailToSocketMapping.set(emailId, socket.id);
    socketIdToEmailMapping.set(socket.id, emailId);

    socket.join(roomId);

    // Tell the joiner they joined successfully
    socket.emit("joined-room", { roomId });

    // Tell others in the room about the new user
    socket.to(roomId).emit("user-joined", { emailId });
  });

  // When a user calls another
  socket.on("call-user", ({ to, from, offer }) => {
    const targetSocketId = emailToSocketMapping.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit("incomming-call", { from, offer });
    }
  });

  // When a call is accepted
  socket.on("call-accepted", ({ to, from, ans }) => {
    const targetSocketId = emailToSocketMapping.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit("call-accepted", { from, ans });
    }
  });

  // When sending ICE candidate
  socket.on("ice-candidate", ({ to, from, candidate }) => {
    const targetSocketId = emailToSocketMapping.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit("ice-candidate", { from, candidate });
    }
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    const email = socketIdToEmailMapping.get(socket.id);
    console.log("User disconnected:", email);

    emailToSocketMapping.delete(email);
    socketIdToEmailMapping.delete(socket.id);
  });
});

// 🚀 Start server
const PORT = process.env.PORT || 8000;
const HOST = "0.0.0.0"; // needed for Railway/Heroku
server.listen(PORT, HOST, () => console.log(`Server running on ${PORT}`));
