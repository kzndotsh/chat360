const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { join } = require('path');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Allow all origins for now since we don't know the final frontend URL
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Basic health check endpoint
app.get('/health', (req, res) => {
  console.log('Health check called');
  res.status(200).json({ status: 'ok' });
});

// Store active rooms and their participants
const rooms = new Map();

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}, Active rooms: ${Array.from(rooms.keys()).length}`);

  socket.on('join-room', (roomId) => {
    console.log(`User ${socket.id} attempting to join room: ${roomId}`);

    // Leave previous room if any
    const prevRoom = [...socket.rooms].find(room => room !== socket.id);
    if (prevRoom) {
      console.log(`User ${socket.id} leaving previous room: ${prevRoom}`);
      socket.leave(prevRoom);
      if (rooms.has(prevRoom)) {
        rooms.get(prevRoom).delete(socket.id);
        if (rooms.get(prevRoom).size === 0) {
          rooms.delete(prevRoom);
          console.log(`Room ${prevRoom} deleted, no more participants`);
        }
      }
    } else {
      console.log(`User ${socket.id} not part of any prior room`);
    }

    // Join new room
    socket.join(roomId);
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
      console.log(`Room ${roomId} created`);
    }
    rooms.get(roomId).add(socket.id);

    console.log(`User ${socket.id} joined room: ${roomId}, Total participants: ${rooms.get(roomId).size}`);

    // Notify others in the room
    socket.to(roomId).emit('user-connected', socket.id);
    
    // Send current participants to the joining user
    const participants = Array.from(rooms.get(roomId));
    socket.emit('room-users', participants.filter(id => id !== socket.id));
    
    // Broadcast updated user count
    io.to(roomId).emit('user-count', rooms.get(roomId).size);
  });

  socket.on('voice-data', ({ roomId, data }) => {
    console.log(`Voice data received from user ${socket.id} in room ${roomId}`);
    socket.to(roomId).emit('voice-data', {
      userId: socket.id,
      data
    });
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    // Remove user from all rooms
    for (const [roomId, users] of rooms.entries()) {
      if (users.has(socket.id)) {
        users.delete(socket.id);
        console.log(`User ${socket.id} removed from room: ${roomId}`);
        if (users.size === 0) {
          rooms.delete(roomId);
          console.log(`Room ${roomId} deleted, no more participants`);
        } else {
          io.to(roomId).emit('user-disconnected', socket.id);
          io.to(roomId).emit('user-count', users.size);
          console.log(`Room ${roomId} now has ${users.size} participants`);
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
