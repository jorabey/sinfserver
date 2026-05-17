// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // 🔴 MUHIM: Istalgan saytdan (Pinggy'dan ham) ulanishga ruxsat beradi
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Xonadagi ishtirokchilarni xotirada saqlash uchun
const rooms = {}; 

io.on('connection', (socket) => {
  console.log('⚡ Yangi foydalanuvchi ulandi:', socket.id);

  // Foydalanuvchi xonaga kirganda
  socket.on('join-room', ({ callId, userId, userName }) => {
    socket.join(callId);
    
    if (!rooms[callId]) {
      rooms[callId] = [];
    }
    
    // Eski ulanishini o'chirib, yangisini qo'shamiz (Rejoin xatosini yo'qotadi)
    rooms[callId] = rooms[callId].filter(user => user.userId !== userId);
    rooms[callId].push({ socketId: socket.id, userId, userName });

    console.log(`👤 ${userName} [${userId}] xonaga kirdi: ${callId}`);

    // Xonadagi boshqa barcha foydalanuvchilarga "Yangi odam kirdi, unga ulaninglar" deb signal beramiz
    socket.to(callId).emit('user-joined', { socketId: socket.id, userId, userName });
    
    // Kirgan odamning o'ziga xonadagi hozirgi odamlar ro'yxatini yuboramiz
    socket.emit('current-room-users', rooms[callId].filter(user => user.socketId !== socket.id));
  });

  // WebRTC Signal uzatish (Ovoz/Video ma'lumotlarini almashish)
  socket.on('webRTC-signal', ({ toSocketId, signalData }) => {
    io.to(toSocketId).emit('webRTC-signal', {
      fromSocketId: socket.id,
      signalData
    });
  });

  // Foydalanuvchi aloqani uzganda (yoki interneti o'chganda)
  socket.on('disconnect', () => {
    console.log('❌ Foydalanuvchi uzildi:', socket.id);
    
    for (const callId in rooms) {
      const user = rooms[callId].find(u => u.socketId === socket.id);
      if (user) {
        rooms[callId] = rooms[callId].filter(u => u.socketId !== socket.id);
        // Xonadagilarga u chiqib ketganini real vaqtda xabar qilamiz
        socket.to(callId).emit('user-left', { userId: user.userId });
        
        if (rooms[callId].length === 0) {
          delete rooms[callId];
        }
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Shaxsiy ulanish serveri ${PORT}-portda ishonchli ishlamoqda...`);
});