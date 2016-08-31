'use strict';

const settings = require('./settings.json');

const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot(settings.bot_token, {polling: true});

bot.on('message', function (msg) {
    console.log(msg);
    var fromId = msg.chat.id;
    bot.sendMessage(fromId, 'asd');
});