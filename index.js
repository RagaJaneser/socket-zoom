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

// Track room participants
const rooms = new Map(); // roomId -> Set of emails
const emailToSocketMapping = new Map(); 
const socketIdToEmailMapping = new Map();

io.on("connection", (socket) => {
  console.log("New Connection:", socket.id);

  socket.on("join-room", ({ roomId, emailId }) => {
    console.log(`${emailId} joined room ${roomId}`);
    
    emailToSocketMapping.set(emailId, socket.id);
    socketIdToEmailMapping.set(socket.id, emailId);

    if (!rooms.has(roomId)) rooms.set(roomId, new Set());
    const participants = rooms.get(roomId);
    participants.add(emailId);

    socket.join(roomId);

    // Notify the joining user about existing participants
    const otherParticipants = Array.from(participants).filter(e => e !== emailId);
    socket.emit("room-participants", { participants: otherParticipants });

    // Notify all others that a new user joined
    socket.broadcast.to(roomId).emit("user-joined", { emailId });
  });

  socket.on("call-user", ({ to, offer }) => {
    const socketId = emailToSocketMapping.get(to);
    const fromEmail = socketIdToEmailMapping.get(socket.id);
    if (socketId) {
      socket.to(socketId).emit("incomming-call", { from: fromEmail, offer });
    }
  });

  socket.on("call-accepted", ({ to, answer }) => {
    const socketId = emailToSocketMapping.get(to);
    if (socketId) {
      socket.to(socketId).emit("call-accepted", { answer });
    }
  });

  socket.on("ice-candidate", ({ to, candidate }) => {
    const socketId = emailToSocketMapping.get(to);
    if (socketId) {
      socket.to(socketId).emit("ice-candidate", { candidate });
    }
  });

  socket.on("disconnect", () => {
    const email = socketIdToEmailMapping.get(socket.id);
    if (!email) return;

    console.log("Disconnected:", email);

    emailToSocketMapping.delete(email);
    socketIdToEmailMapping.delete(socket.id);

    // Remove from all rooms
    rooms.forEach((participants, roomId) => {
      if (participants.has(email)) {
        participants.delete(email);
        socket.broadcast.to(roomId).emit("user-left", { emailId: email });
      }
    });
  });
});

const PORT = process.env.PORT || 8000;
const HOST = "0.0.0.0";

server.listen(PORT, HOST, () => {
  console.log(`Server running on ${PORT}`);
});
