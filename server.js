const path = require("path");
const http = require("http");
const express = require("express");
const socketio = require("socket.io");
const formatMessage = require("./utils/messages");
const createAdapter = require("@socket.io/redis-adapter").createAdapter;
const redis = require("redis");
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const Room = require('./models/Room');
const Message = require('./models/Message'); // Add this line to import the Message model
require("dotenv").config();
const { createClient } = redis;
const {
  userJoin,
  getCurrentUser,
  userLeave,
  getRoomUsers,
} = require("./utils/users");

const app = express();
const server = http.createServer(app);
const io = socketio(server);

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true, 
  useUnifiedTopology: true, 
}).then(() => console.log('MongoDB connected...'))
  .catch(err => console.error(err));

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json()); 

const botName = "LetsTalk Bot";

const predefinedRooms = [
  "JavaScript",
  "Python",
  "PHP",
  "C#",
  "Ruby",
  "Java"
];

const rooms = {};

predefinedRooms.forEach(room => {
  rooms[room] = { users: [], code: room }; 
});

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

(async () => {
  pubClient = createClient({ url: "redis://127.0.0.1:6379" });
  await pubClient.connect();
  subClient = pubClient.duplicate();
  io.adapter(createAdapter(pubClient, subClient));
})();

app.get("/rooms", (req, res) => {
  res.json(predefinedRooms);
});

app.post('/signup', async (req, res) => {
  const { username, email, password } = req.body;

  try {
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }

    user = new User({
      username,
      email,
      password
    });

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);

    await user.save();

    res.json({ success: true, message: 'User created successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

app.post('/signin', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    const payload = {
      user: {
        id: user.id,
        username: user.username 
      }
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '1h' },
      (err, token) => {
        if (err) throw err;
        res.json({ success: true, token });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

const auth = (req, res, next) => {
  const token = req.header('x-auth-token');

  if (!token) {
    return res.status(401).json({ success: false, message: 'You need to log in to create a room.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded.user;
    next();
  } catch (err) {
    res.status(401).json({ success: false, message: 'You need to log in to create a room.' });
  }
};

// Create Room Route - Protected
app.post('/createRoom', auth, (req, res) => {
  const { roomName } = req.body;

  if (!rooms[roomName]) {
    const roomCode = generateRoomCode();
    rooms[roomName] = { users: [], code: roomCode, creator: req.user.id };

    // Save room to the database
    const room = new Room({
      name: roomName,
      code: roomCode,
      createdBy: req.user.id
    });

    room.save().then(() => {
      res.status(201).json({ success: true, roomCode });
    }).catch(err => {
      console.error(err);
      res.status(500).json({ success: false, message: 'Server error' });
    });
  } else {
    res.status(400).json({ success: false, message: 'Room already exists' });
  }
});

// Run when client connects
io.on("connection", (socket) => {
  console.log(io.of("/").adapter);

  socket.on("createRoom", (room, callback) => {
    console.log(`Create room request received for room: ${room}`);
    if (!rooms[room]) {
      const roomCode = generateRoomCode();
      rooms[room] = { users: [], code: roomCode };
      console.log(`Room created: ${room} with code ${roomCode}`);
      callback(null, roomCode); // Pass the room code to the callback
    } else {
      console.log(`Room already exists: ${room}`);
      callback("Room already exists");
    }
  });

  socket.on("joinRoom", ({ username, roomCode }) => {
    const room = Object.keys(rooms).find(key => rooms[key].code === roomCode);
    if (room) {
      const user = userJoin(socket.id, username, room);
      socket.join(user.room);
      rooms[room].users.push(user);

      socket.emit("message", formatMessage(botName, "Welcome to LetsTalk!"));

      socket.broadcast
        .to(user.room)
        .emit(
          "message",
          formatMessage(botName, `${user.username} has joined the chat`)
        );

      io.to(user.room).emit("roomUsers", {
        room: user.room,
        users: getRoomUsers(user.room),
      });
    } else {
      socket.emit("error", "Room does not exist");
    }
  });

  socket.on("chatMessage", async (msg) => {
    const user = getCurrentUser(socket.id);
    const message = formatMessage(user.username, msg);

    io.to(user.room).emit("message", message);

    const newMessage = new Message({
      username: user.username,
      text: msg,
      room: user.room,
      sentiment: message.sentiment,
      emoji: message.emoji
    });

    try {
      await newMessage.save();
    } catch (error) {
      console.error('Error saving message:', error);
    }
  });

  // Runs when client disconnects
  socket.on("disconnect", () => {
    const user = userLeave(socket.id);

    if (user) {
      io.to(user.room).emit(
        "message",
        formatMessage(botName, `${user.username} has left the chat`)
      );

      // Send users and room info
      io.to(user.room).emit("roomUsers", {
        room: user.room,
        users: getRoomUsers(user.room),
      });

      rooms[user.room].users = rooms[user.room].users.filter(
        (u) => u.id !== user.id
      );
    }
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
