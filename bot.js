'use strict';

const settings = require('./settings.json');

const request = require('request');
const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot(settings.bot_token, {polling: true});

bot.on('message', function (msg) {
    (new Promise((resolve, reject)=>{
        request.post(
            settings.api_url,
            { json: { token: settings.api_token } },
            function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    return resolve(body);
                }
                return reject();
            }
        );
    }))
    .then((body)=>{
        console.log(body);
        bot.sendMessage(msg.chat.id, JSON.stringify(body, undefined, 4));
    },()=>{
        bot.sendMessage(msg.chat.id, 'Sorry :(');
    });
});