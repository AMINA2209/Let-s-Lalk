const moment = require("moment");
const Sentiment = require("sentiment");
const sentiment = new Sentiment();

function formatMessage(username, text) {
  const sentimentResult = sentiment.analyze(text);
  let sentimentLabel = 'neutral';
  let emoji = '😐';

  if (sentimentResult.score > 0) {
    sentimentLabel = 'positive';
    emoji = '😊';
  } else if (sentimentResult.score < 0) {
    sentimentLabel = 'negative';
    emoji = '😢';
  }

  return {
    username,
    text,
    time: moment().format("h:mm a"),
    sentiment: sentimentLabel,
    emoji: emoji
  };
}

module.exports = formatMessage;
