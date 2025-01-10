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
  res.status(200).json({ status: 'ok' });
});

// Store active rooms and their participants
const rooms = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', (roomId) => {
    // Leave previous room if any
    const prevRoom = [...socket.rooms].find(room => room !== socket.id);
    if (prevRoom) {
      socket.leave(prevRoom);
      if (rooms.has(prevRoom)) {
        rooms.get(prevRoom).delete(socket.id);
        if (rooms.get(prevRoom).size === 0) {
          rooms.delete(prevRoom);
        }
      }
    }

    // Join new room
    socket.join(roomId);
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }
    rooms.get(roomId).add(socket.id);

    // Notify others in the room
    socket.to(roomId).emit('user-connected', socket.id);
    
    // Send current participants to the joining user
    const participants = Array.from(rooms.get(roomId));
    socket.emit('room-users', participants.filter(id => id !== socket.id));
    
    // Broadcast updated user count
    io.to(roomId).emit('user-count', rooms.get(roomId).size);
  });

  socket.on('voice-data', ({ roomId, data }) => {
    socket.to(roomId).emit('voice-data', {
      userId: socket.id,
      data
    });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Remove user from all rooms
    for (const [roomId, users] of rooms.entries()) {
      if (users.has(socket.id)) {
        users.delete(socket.id);
        if (users.size === 0) {
          rooms.delete(roomId);
        } else {
          io.to(roomId).emit('user-disconnected', socket.id);
          io.to(roomId).emit('user-count', users.size);
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
