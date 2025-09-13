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
  console.log("New Connection..");

  socket.on("join-room", (data) => {
    const { roomId, emailId } = data;
    console.log("User", emailId, "Joined Room", roomId);

    emailToSocketMapping.set(emailId, socket.id);
    socketIdToEmailMapping.set(socket.id, emailId);

    // Join the room
    socket.join(roomId);

    // Send existing participants to the new user
    const participants = [];
    for (const [email, id] of emailToSocketMapping) {
      if (id !== socket.id) participants.push(email);
    }
    socket.emit("all-users", { participants });

    // Notify others about the new user
    socket.broadcast.to(roomId).emit("user-joined", { emailId });
  });

  // Handle call offer
  socket.on("call-user", (data) => {
    const { emailId, offer } = data;
    const fromEmail = socketIdToEmailMapping.get(socket.id);
    const socketId = emailToSocketMapping.get(emailId);
    socket.to(socketId).emit("incoming-call", { from: fromEmail, offer });
  });

  // Handle call answer
  socket.on("call-accepted", (data) => {
    const { emailId, ans } = data;
    const socketId = emailToSocketMapping.get(emailId);
    socket.to(socketId).emit("call-accepted", { ans });
  });

  // Forward ICE candidates
  socket.on("ice-candidate", (data) => {
    const { roomId, candidate, toEmail } = data;
    if (toEmail) {
      const socketId = emailToSocketMapping.get(toEmail);
      socket.to(socketId).emit("ice-candidate", { candidate });
    } else {
      socket.broadcast.to(roomId).emit("ice-candidate", { candidate });
    }
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    const email = socketIdToEmailMapping.get(socket.id);

    // Remove mappings
    emailToSocketMapping.delete(email);
    socketIdToEmailMapping.delete(socket.id);

    // Notify all rooms that this user left
    const rooms = Array.from(socket.rooms).filter((r) => r !== socket.id);
    rooms.forEach((roomId) => {
      socket.broadcast.to(roomId).emit("user-left", { emailId: email });
    });

    console.log("User disconnected:", email);
  });
});

const PORT = process.env.PORT || 8000;
const HOST = "0.0.0.0";
server.listen(PORT, HOST, () => console.log(`Server running on ${PORT}`));
