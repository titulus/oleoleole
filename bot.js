'use strict';

const settings = require('./settings.json');

const request = require('request');
const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot(settings.bot_token, {polling: true});

const request_promise = json => {
    return new Promise((resolve, reject)=>{
        request.post(
            settings.api_url,
            {json: json},
            function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    return resolve(body);
                }
                return reject();
            }
        );
    });
};
const game_description = game => {
    let description = '';
    const starts_at = game.starts_at;
    const data_text = game.data_text;
    game = JSON.parse(game.data_json); 
    if (game.sport) {
        switch (game.sport) {
            case "football": description+='⚽ '; break;
            case "basketball": description+='🏀 '; break;
            case "hockey": description+='🏒 '; break;
            default: description+=game.sport;
        };
    };
    if (typeof(game.team1)=='undefined' || typeof(game.team2)=='undefined') {
            description += data_text + '\n';
        } else {
            description += game.team1 + ' vs ' + game.team2 + '\n';
        };
        description += starts_at;
        if (game.group) {
            description += ' ' + game.group;
        }
    return description;
};

bot.on('message',msg=>{console.log(msg);});

bot.onText(/\/games\s?(.*)/, function (msg, match) {
    const request_json = {token:settings.api_token};
    request_json.select = {odds:false};
    request_json.filter = {};
    if (match[1]) request_json.filter.text_query = match[1];
    request_json.filter.next_period = 6;
    request_json.filter.prev_period = 4;

    request_promise(request_json)
    .then((body)=>{
        console.log(body);
        

        let message = '';
        if (body.games.length == 0) {
            message += 'Sorry, i found no games';
        } else if (body.games.length == 1) {
            console.log(body.games[0]);
            message += game_description(body.games[0]);
        } else if (body.games.length > 1) {
            message += 'I found several games:\n';

            for (let game of body.games) {
                message += game_description(game) + '\n\n';
            }
            message += 'Please refine your query';

        };
        bot.sendMessage(msg.chat.id, message);
    },()=>{
        bot.sendMessage(msg.chat.id, 'Oops... There are some tech difficulties  :(');
    });
});

bot.onText(/\/bets\s?(.*)/, function (msg, match) {
    if (match[1]=='') return bot.sendMessage(msg.chat.id,'You should refine your query');

    const request_json = {token:settings.api_token};
    request_json.select = {odds:true};
    request_json.filter = {};
    request_json.filter.text_query = match[1];

    request_promise(request_json)
    .then((body)=>{
        console.log(body);
        

        let message = '';
        if (body.games.length == 0) {
            message += 'Sorry, i found no games';
        } else if (body.games.length == 1) {
            console.log(body.games[0]);
            message += game_description(body.games[0]);
        } else if (body.games.length > 1) {
            message += 'I found several games:\n';

            for (let game of body.games) {
                message += game_description(game) + '\n\n';
            }
            message += 'Please refine your query';

        };
        bot.sendMessage(msg.chat.id, message);
    },()=>{
        bot.sendMessage(msg.chat.id, 'Oops... There are some tech difficulties  :(');
    });
});