'use strict';

const settings = require('./settings.json');

const request = require('request');
const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot(settings.bot_token, {polling: true});

bot.on('message', function (msg) {
    console.log(msg);
    var fromId = msg.chat.id;
    bot.sendMessage(fromId, 'asd');
});

request.post(
    settings.api_url,
    { json: { token: settings.api_token } },
    function (error, response, body) {
        console.log(body);
        // if (!error && response.statusCode == 200) {
        //     console.log(body)
        // }
    }
);