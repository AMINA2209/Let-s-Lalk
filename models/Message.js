const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true
  },
  text: {
    type: String,
    required: true
  },
  time: {
    type: Date,
    default: Date.now
  },
  room: {
    type: String,
    required: true
  },
  sentiment: {
    type: String,
    enum: ['positive', 'negative', 'neutral'],
    default: 'neutral'
  },
  emoji: {
    type: String,
    default: '😐'
  }
});

module.exports = mongoose.model('Message', MessageSchema);
