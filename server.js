const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const webpush = require('web-push');

// ==========================================
// 1. ASOSIY SOZLAMALAR (EXPRESS & CORS)
// ==========================================
const app = express();

// O'ta tezkor JSON parser (body-parser o'rniga)
app.use(express.json()); 
app.use(cors({
  origin: "*", // Barcha domenlar va Pinggy uchun ochiq
  methods: ["GET", "POST"],
  credentials: true
}));

const server = http.createServer(app);

// ==========================================
// 2. WEBPUSH (BILDIRISHNOMALAR) MOTORINI SOZLASH
// ==========================================
const vapidKeys = {
  publicKey: 'BKB--9KZ5l18Vf-a7f-eEeJ_AkvfTbDNlM2Sd97yw9Waqvudj0mVXcmuLCH847KCT5K2g4-taIOboye1hC7g7tA',
  privateKey: 'eL7SeIriy58-KZCnm2Bj3Ri17grgkrU-eGzpYLAeyvU'
};

webpush.setVapidDetails(
  'mailto:admin@jora.net',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// 🍏 PUSH API NUQTASI
app.post('/api/send-push', async (req, res) => { // 🔴 DIQQAT: res parametri qo'shildi
  try {
    const { subscriptions, senderName, messageContent } = req.body;

    if (!subscriptions || subscriptions.length === 0) {
      return res.status(200).json({ success: true, message: "Yuboriladigan qurilmalar yo'q" });
    }

    const payload = JSON.stringify({
      title: senderName || "Yangi xabar",
      body: messageContent || "Fayl keldi",
      icon: "/icon-192.png",
      url: "/chat"
    });

    // Barcha a'zolarga parallel (bir vaqtning o'zida) push signal otamiz
    const pushPromises = subscriptions.map(sub => 
      webpush.sendNotification(sub, payload).catch(err => {
        // Agar token eskirgan bo'lsa konsolga yozamiz, lekin serverni qulatmaymiz
        console.error("Push yetkazilmadi (Token xatosi):", err.statusCode);
      })
    );

    await Promise.all(pushPromises);
    res.status(200).json({ success: true, message: "Push yuborildi!" });

  } catch (error) {
    console.error("Push API'da xatolik:", error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 3. SOCKET.IO (WEBRTC QO'NG'IROQLAR MOTOR)
// ==========================================
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Xonadagi ishtirokchilarni xotirada saqlash uchun (O'ta tez ishlashi uchun RAM'da saqlanadi)
const rooms = {}; 

io.on('connection', (socket) => {
  console.log('⚡ Yangi foydalanuvchi ulandi:', socket.id);

  // Foydalanuvchi xonaga kirganda
  socket.on('join-room', ({ callId, userId, userName }) => {
    socket.join(callId);
    
    if (!rooms[callId]) {
      rooms[callId] = [];
    }
    
    // Eski ulanishini o'chirib, yangisini qo'shamiz (Rejoin ziddiyatini yo'qotadi)
    rooms[callId] = rooms[callId].filter(user => user.userId !== userId);
    rooms[callId].push({ socketId: socket.id, userId, userName });

    console.log(`👤 ${userName} [${userId}] xonaga kirdi: ${callId}`);

    // Xonadagi boshqa barcha foydalanuvchilarga "Yangi odam kirdi" deb signal beramiz
    socket.to(callId).emit('user-joined', { socketId: socket.id, userId, userName });
    
    // Kirgan odamning o'ziga xonadagi hozirgi odamlar ro'yxatini yuboramiz
    socket.emit('current-room-users', rooms[callId].filter(user => user.socketId !== socket.id));
  });

  // WebRTC Signal uzatish (Ovoz/Video ma'lumotlarini to'g'ridan-to'g'ri almashish)
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
          delete rooms[callId]; // Xona bo'shasa xotiradan tozalaymiz
        }
        break;
      }
    }
  });
});

// ==========================================
// 4. SERVERNI ISHGA TUSHIRISH
// ==========================================
// Bitta port (5000) orqali ham Express (Push) ham Socket.io ishlaydi
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Jora Unified Server faol!`);
  console.log(`📡 Socket.io (Aloqa) ulanishga tayyor...`);
  console.log(`🍏 Push API: http://localhost:${PORT}/api/send-push`);
});
