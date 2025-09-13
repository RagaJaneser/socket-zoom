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

// Maintain participants per room
const rooms = new Map(); // roomId => Set of emails
const emailToSocketMapping = new Map();
const socketIdToEmailMapping = new Map();

io.on("connection", (socket) => {
  console.log("New Connection..");

  // Join room
  socket.on("join-room", (data) => {
    const { roomId, emailId } = data;
    console.log("User", emailId, "Joined Room", roomId);

    emailToSocketMapping.set(emailId, socket.id);
    socketIdToEmailMapping.set(socket.id, emailId);

    // Add participant to room
    if (!rooms.has(roomId)) rooms.set(roomId, new Set());
    rooms.get(roomId).add(emailId);

    socket.join(roomId);

    // Notify this user of the room participants
    const participants = Array.from(rooms.get(roomId)).filter((e) => e !== emailId);
    socket.emit("joined-room", { roomId, participants });

    // Notify others in the room that a new user joined
    socket.broadcast.to(roomId).emit("user-joined", { emailId });
  });

  // Call user
  socket.on("call-user", (data) => {
    const { emailId, offer } = data;
    const fromEmail = socketIdToEmailMapping.get(socket.id);
    const socketId = emailToSocketMapping.get(emailId);
    if (socketId) {
      socket.to(socketId).emit("incomming-call", { from: fromEmail, offer });
    }
  });

  // Call accepted
  socket.on("call-accepted", (data) => {
    const { emailId, ans } = data;
    const socketId = emailToSocketMapping.get(emailId);
    if (socketId) {
      socket.to(socketId).emit("call-accepted", { ans });
    }
  });

  // ICE candidates
  socket.on("ice-candidate", (data) => {
    const { roomId, candidate } = data;
    // Forward candidate to all other participants
    socket.broadcast.to(roomId).emit("ice-candidate", {
      candidate,
      from: socketIdToEmailMapping.get(socket.id),
    });
  });

  // Disconnect
  socket.on("disconnect", () => {
    const email = socketIdToEmailMapping.get(socket.id);

    // Remove user from room
    for (const [roomId, participants] of rooms) {
      if (participants.has(email)) {
        participants.delete(email);
        // Notify remaining participants
        socket.broadcast.to(roomId).emit("user-left", { emailId: email });
      }
    }

    emailToSocketMapping.delete(email);
    socketIdToEmailMapping.delete(socket.id);
    console.log("User disconnected:", email);
  });
});

const PORT = process.env.PORT || 8000;
const HOST = "0.0.0.0";
server.listen(PORT, HOST, () => console.log(`Server running on ${PORT}`));
