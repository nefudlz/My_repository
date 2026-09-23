const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// 引入上傳檔案所需的核心套件
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ==========================================
// 1. 伺服器基本設定與常數
// ==========================================
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET environment variable is required');

// ==========================================
// 2. 資料庫連接與模型定義 (MongoDB)
// ==========================================
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/xiaqi_db')
  .then(() => console.log('MongoDB 資料庫連接成功！'))
  .catch(err => console.error('MongoDB 連接失敗:', err));

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  nickname: { type: String, default: '無名俠客' },         // 新增：暱稱
  avatar: { type: String, default: '/default-avatar.png' }, // 新增：頭像路徑
  winCount: { type: Number, default: 0 },
  loseCount: { type: Number, default: 0 }
});
const User = mongoose.model('User', userSchema);

// ==========================================
// 3. 檔案上傳設定 (Multer)
// ==========================================
// 確保 uploads 資料夾存在
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// 設定圖片儲存名稱與路徑
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        // 使用時間戳防重複，例如：1623456789.png
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });


// ==========================================
// 4. Express 中介軟體
// ==========================================
app.use(cors());
app.use(express.json());
// 【重要】讓前端可以透過 /uploads 路徑讀取到實體圖片
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


// ==========================================
// 5. API 路由 (註冊、登入與個人資料)
// ==========================================
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: '帳號和密碼不能留空' });

    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ success: false, message: '此帳號已被註冊' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();

    res.json({ success: true, message: '註冊成功！' });
  } catch (err) {
    res.status(500).json({ success: false, message: '伺服器內部錯誤' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ success: false, message: '帳號或密碼錯誤' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ success: false, message: '帳號或密碼錯誤' });

    const token = jwt.sign({ userId: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true, message: '登入成功', token,
      user: {
          username: user.username,
          nickname: user.nickname, // 登入時一併回傳暱稱
          avatar: user.avatar,     // 登入時一併回傳頭像
          win: user.winCount,
          lose: user.loseCount
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: '伺服器內部錯誤' });
  }
});

// 新增：更新個人資料 API
app.post('/api/profile', upload.single('avatar'), async (req, res) => {
    try {
        const username = req.body.username;
        const nickname = req.body.nickname;
        let updateData = { nickname: nickname };

        // 如果有上傳新圖片，將路徑更新進去
        if (req.file) {
            updateData.avatar = '/uploads/' + req.file.filename;
        }

        // 更新資料庫中的 User 資料
        const updatedUser = await User.findOneAndUpdate(
            { username: username },
            updateData,
            { new: true } // 回傳更新後的新資料
        );

        res.json({ success: true, user: updatedUser });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: '資料更新失敗' });
    }
});


// ==========================================
// 6. Socket.io 狀態與輔助函數
// ==========================================
const rooms = {};
const undoRequests = {};

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ==========================================
// 7. Socket.io 實時通訊邏輯
// ==========================================
io.on('connection', (socket) => {
  console.log('有新的 Socket 連線:', socket.id);

  let currentUser = null;
  const token = socket.handshake.auth?.token;
  if (token) {
    try { currentUser = jwt.verify(token, JWT_SECRET); }
    catch (e) { console.log('Socket Token 驗證失敗'); }
  }

  // --- 智能分流：創建房間 ---
  socket.on('createRoom', (payload) => {
    // 1. 如果 payload 是字串，代表這是「五子棋」創建房間
    if (typeof payload === 'string') {
      const roomId = payload;
      socket.join(roomId);
      rooms[roomId] = {
        gameType: 'gomoku',
        players: [{ id: socket.id, name: currentUser ? currentUser.username : 'Guest', color: 'black' }],
        board: Array(15).fill(null).map(() => Array(15).fill(null)),
        currentTurn: 'black',
        history: [],
        lastMove: null,
        isGameOver: false,
        disconnectTimeout: null
      };
      console.log(`[五子棋] 房間 ${roomId} 創建成功`);
      return;
    }

    // 2. 否則，代表這是「象棋」創建房間
    if (!currentUser) return socket.emit('error', '請先登入帳號');
    const roomId = generateRoomId();
    const INIT_BOARD = [
      ['Rb','Nb','Sb','Jb','Kb','Jb','Sb','Nb','Rb'],
      [null,null,null,null,null,null,null,null,null],
      [null,'Cb',null,null,null,null,null,'Cb',null],
      ['Pb',null,'Pb',null,'Pb',null,'Pb',null,'Pb'],
      [null,null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null,null],
      ['Pr',null,'Pr',null,'Pr',null,'Pr',null,'Pr'],
      [null,'Cr',null,null,null,null,null,'Cr',null],
      [null,null,null,null,null,null,null,null,null],
      ['Rr','Nr','Sr','Jr','Kr','Jr','Sr','Nr','Rr']
    ];

    rooms[roomId] = {
      gameType: 'chess',
      players: [{ id: socket.id, name: currentUser.username, color: 'red' }],
      board: JSON.parse(JSON.stringify(INIT_BOARD)),
      currentTurn: 'red',
      history: [],
      lastMove: null,
      disconnectTimeout: null
    };
    socket.join(roomId);
    socket.emit('roomCreated', { roomId, color: 'red' });
    console.log(`[象棋] 房間 ${roomId} 創建成功，房主: ${currentUser.username}`);
  });

  // --- 智能分流：加入房間 ---
  socket.on('joinRoom', (payload) => {
    // 1. 如果 payload 是字串，代表這是「五子棋」加入房間
    if (typeof payload === 'string') {
      const roomId = payload;
      const room = rooms[roomId];
      if (!room) return socket.emit('error', '房間不存在');
      if (room.disconnectTimeout) { clearTimeout(room.disconnectTimeout); room.disconnectTimeout = null; }

      const existingPlayerIdx = room.players.findIndex(p => p.name === (currentUser ? currentUser.username : 'Guest'));
      if (existingPlayerIdx !== -1) {
        // 五子棋斷線重連
        room.players[existingPlayerIdx].id = socket.id;
        socket.join(roomId);
        socket.emit('joinSuccess', room.players[existingPlayerIdx].color);
        io.to(roomId).emit('gameStart', { players: room.players });
        socket.emit('boardUpdate', {
          board: room.board,
          currentTurn: room.currentTurn,
          lastMove: room.lastMove,
          isGameOver: room.isGameOver
        });
        return;
      }

      if (room.players.length >= 2) return socket.emit('error', '房間已滿');

      room.players.push({ id: socket.id, name: currentUser ? currentUser.username : 'Guest', color: 'white' });
      socket.join(roomId);
      socket.emit('joinSuccess', 'white');
      console.log(`[五子棋] 玩家加入了房間 ${roomId}`);

      io.to(roomId).emit('gameStart', { players: room.players });
      io.to(roomId).emit('boardUpdate', {
        board: room.board,
        currentTurn: room.currentTurn,
        lastMove: room.lastMove,
        isGameOver: room.isGameOver
      });
      return;
    }

    // 2. 否則，這是「象棋」加入房間
    if (!currentUser) return socket.emit('error', '請先登入帳號');
    const { roomId } = payload;
    const room = rooms[roomId];
    if (!room) return socket.emit('error', '房間不存在');
    if (room.disconnectTimeout) { clearTimeout(room.disconnectTimeout); room.disconnectTimeout = null; }

    const existingPlayerIdx = room.players.findIndex(p => p.name === currentUser.username);
    if (existingPlayerIdx !== -1) {
      // 象棋斷線重連
      room.players[existingPlayerIdx].id = socket.id;
      socket.join(roomId);
      socket.emit('roomJoined', { roomId, color: room.players[existingPlayerIdx].color });
      io.to(roomId).emit('gameStart', { players: room.players });
      socket.emit('boardUpdate', { board: room.board, currentTurn: room.currentTurn, lastMove: room.lastMove });
      return;
    }

    if (room.players.length >= 2) return socket.emit('error', '房間已滿');

    room.players.push({ id: socket.id, name: currentUser.username, color: 'black' });
    socket.join(roomId);
    socket.emit('roomJoined', { roomId, color: 'black' });
    io.to(roomId).emit('gameStart', { players: room.players });
    socket.emit('boardUpdate', { board: room.board, currentTurn: room.currentTurn, lastMove: room.lastMove });
  });

  // --- 智能分流：走棋 ---
  socket.on('move', (data) => {
    // 1. 五子棋落子 (包含 r 與 c 座標)
    if (data.r !== undefined && data.c !== undefined) {
      const { roomId, r, c, isGameOver } = data;
      const room = rooms[roomId];
      if (!room) return socket.emit('error', '房間不存在');

      // 備份歷史狀態以供悔棋
      room.history.push({
        board: JSON.parse(JSON.stringify(room.board)),
        currentTurn: room.currentTurn,
        lastMove: room.lastMove ? JSON.parse(JSON.stringify(room.lastMove)) : null,
        isGameOver: room.isGameOver
      });

      // 更新棋盤狀態
      room.board[r][c] = room.currentTurn;
      room.lastMove = { r, c };
      room.isGameOver = isGameOver || false;
      room.currentTurn = room.currentTurn === 'black' ? 'white' : 'black';

      // 廣播給房間內的雙方
      io.to(roomId).emit('boardUpdate', {
        board: room.board,
        currentTurn: room.currentTurn,
        lastMove: room.lastMove,
        isGameOver: room.isGameOver
      });
      return;
    }

    // 2. 象棋走棋
    const { roomId, from, to } = data;
    const room = rooms[roomId];
    if (!room) return socket.emit('error', '房間不存在');
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return socket.emit('error', '你不是本局玩家');
    if (room.currentTurn !== player.color) return socket.emit('error', '還沒輪到你的回合');
    const piece = room.board[from.r][from.c];
    if (!piece) return socket.emit('error', '起點沒有棋子');
    const pieceColor = piece[1] === 'r' ? 'red' : 'black';
    if (pieceColor !== player.color) return socket.emit('error', '你不能移動對方的棋子');

    room.history.push({
      board: JSON.parse(JSON.stringify(room.board)),
      currentTurn: room.currentTurn,
      lastMove: room.lastMove ? JSON.parse(JSON.stringify(room.lastMove)) : null
    });

    room.board[to.r][to.c] = piece;
    room.board[from.r][from.c] = null;
    room.currentTurn = room.currentTurn === 'red' ? 'black' : 'red';
    room.lastMove = { from, to };

    io.to(roomId).emit('boardUpdate', {
      board: room.board,
      currentTurn: room.currentTurn,
      lastMove: room.lastMove
    });
  });

  // --- 新增：聊天室廣播 ---
  socket.on('sendChatMessage', (data) => {
    // data 預期包含：roomId, message, sender (含 nickname, avatar 等資訊)
    const { roomId } = data;
    if (rooms[roomId]) {
        // 將訊息廣播給同一房間的所有玩家（包含發送者自己）
        io.to(roomId).emit('receiveChatMessage', data);
    }
  });

  // --- 專屬通道：悔棋請求與審批 ---
  socket.on('requestUndo', (data) => {
    const { roomId } = data;
    if (undoRequests[roomId]) {
      return socket.emit('error', '已發送悔棋請求，請等待對方回應');
    }
    socket.to(roomId).emit('undoRequested');
    undoRequests[roomId] = {
      requesterId: socket.id,
      timeout: setTimeout(() => {
        io.to(socket.id).emit('undoRejected', '⏳ 對手未回應，悔棋請求已超時');
        socket.to(roomId).emit('undoTimeout');
        delete undoRequests[roomId];
      }, 15000)
    };
  });

  socket.on('undoResponse', (data) => {
    const { roomId, agreed } = data;
    const request = undoRequests[roomId];
    if (!request) return;
    if (socket.id === request.requesterId) return;

    clearTimeout(request.timeout);
    const requesterId = request.requesterId;
    delete undoRequests[roomId];

    if (agreed) {
      const room = rooms[roomId];
      if (room && room.history && room.history.length > 0) {
        const prevState = room.history.pop();
        room.board = prevState.board;
        room.currentTurn = prevState.currentTurn;
        room.lastMove = prevState.lastMove;
        room.isGameOver = prevState.isGameOver || false;

        io.to(roomId).emit('boardUpdate', {
          board: room.board,
          currentTurn: room.currentTurn,
          lastMove: room.lastMove,
          isGameOver: room.isGameOver
        });
        io.to(roomId).emit('undoSuccess', '悔棋成功！棋局已還原。');
      } else {
        socket.emit('error', '目前沒有更早的落子紀錄，無法悔棋');
      }
    } else {
      io.to(requesterId).emit('undoRejected', '❌ 對手拒絕了你的悔棋請求');
    }
  });

  // --- 斷線處理 ---
  socket.on('disconnect', () => {
    for (const [roomId, room] of Object.entries(rooms)) {
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        const disconnectedPlayer = room.players[idx];
        io.to(roomId).emit('opponentDisconnected', { name: disconnectedPlayer.name });
        room.disconnectTimeout = setTimeout(() => {
          io.to(roomId).emit('gameEnded', '由於一方長時間斷線，對局已結束');
          delete rooms[roomId];
        }, 30000);
        break;
      }
    }
  });
});

server.listen(3000, () => {
  console.log('伺服器執行在 http://localhost:3000 (象棋與五子棋雙引擎已啟動，聊天室已掛載)');
});
