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

    socket.join(roomId);
    socket.emit("joined-room", { roomId });
    socket.broadcast.to(roomId).emit("user-joined", { emailId });
  });

  socket.on("call-user", (data) => {
    const { emailId, offer } = data;
    const fromEmail = socketIdToEmailMapping.get(socket.id);
    const socketId = emailToSocketMapping.get(emailId);
    socket.to(socketId).emit("incomming-call", { from: fromEmail, offer });
  });

  socket.on("call-accepted", (data) => {
    const { emailId, ans } = data;
    const fromEmail = socketIdToEmailMapping.get(socket.id);
    const socketId = emailToSocketMapping.get(emailId);
    socket.to(socketId).emit("call-accepted", { from: fromEmail, ans });
  });

  socket.on("ice-candidate", (data) => {
    const { roomId, candidate, to } = data;
    const fromEmail = socketIdToEmailMapping.get(socket.id);
    
    if (to) {
      // Targeted ICE candidate
      const socketId = emailToSocketMapping.get(to);
      if (socketId) {
        socket.to(socketId).emit("ice-candidate", { from: fromEmail, candidate });
      }
    } else {
      // Fallback: broadcast to room
      socket.broadcast.to(roomId).emit("ice-candidate", { from: fromEmail, candidate });
    }
  });

  socket.on("disconnect", () => {
    const email = socketIdToEmailMapping.get(socket.id);
    if (email) {
      // Get all rooms this socket was in
      const rooms = Array.from(socket.rooms);
      
      // Notify others in each room that user left
      rooms.forEach(roomId => {
        if (roomId !== socket.id) { // Skip the socket's own room
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
const HOST = "0.0.0.0";
server.listen(PORT, HOST, () => console.log(`Server running on ${PORT}`));
