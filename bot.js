'use strict';

const settings = require('./settings.json');

const request = require('request');
const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot(settings.bot_token, {polling: true});

bot.onText(/\/games\s?(.*)/, function (msg, match) {
    console.log(msg,match);
    const request_json = {token:settings.api_token};
    request_json.select = {odds:true};
    request_json.filter = {};
    if (match[1]) request_json.filter.text_query = match[1];
    request_json.filter.next_period = 6;
    request_json.filter.prev_period = 4;  
    console.log(request_json);

    (new Promise((resolve, reject)=>{
        request.post(
            settings.api_url,
            {json: request_json},
            function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    return resolve(body);
                }
                return reject();
            }
        );
    }))
    .then((body)=>{
        console.log(body,body.games[0]);
        let message = '';
        if (body.games.length>1) {
            message += 'I found several games:\n';

            for (let game of body.games) {
                let starts_at = game.starts_at;
                game = JSON.parse(game.data_json);
                message += game.team1 + ' vs ' + game.team2 + '\n';
                message += starts_at + ' ' + game.group;
                message += '\n\n';
            }
            message += 'Please refine your query';

            bot.sendMessage(msg.chat.id, message);
        }
    },()=>{
        bot.sendMessage(msg.chat.id, 'Sorry :(');
    });
});