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
                console.log('ERROR:',error,response)
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
            default: description+='('+game.sport+') ';
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

const Games_per_user = {};
const add_game2Games = (id,game) => Games_per_user[id].push(game.data_text)-1;

const Game_per_user = {};

bot.on('message',msg=>{console.log('MSG:',msg);});

bot.onText(/\/games\s?(.*)/, function (msg, match) {
    const request_json = {token:settings.api_token};
    request_json.select = {odds:false};
    request_json.filter = {};
    let text_query = match[1];
    console.log('text_query',text_query);
    let prev_period = text_query.match(/-(\d{1,2})h?/);
    if (prev_period) {
        text_query = text_query.slice(0,prev_period.index) +text_query.slice(prev_period.index+prev_period[0].length);
    };
    let next_period = text_query.match(/\+(\d{1,2})h?/);
    if (next_period) {
        text_query = text_query.slice(0,next_period.index) +text_query.slice(next_period.index+next_period[0].length);
    };
    console.log('prev_period,next_period',prev_period,next_period);
    request_json.filter.next_period = (next_period)?+next_period[1]:1;
    request_json.filter.prev_period = (prev_period)?+prev_period[1]:0;
    request_json.filter.text_query = text_query.trim();
    console.log('request_json', request_json);

    request_promise(request_json)
    .then((body)=>{
        console.log('/games api resond:',body);
        
        Games_per_user[msg.chat.id] = [];

        let message = '';
        if (body.games.length == 0) {
            message += 'Sorry, i found no games';
        } else if (body.games.length == 1) {
            message +=  game_description(body.games[0]) + '\n';
            message += 'bets for this game: '+'/b_'+add_game2Games(msg.chat.id,body.games[0]);
        } else if (body.games.length > 1) {
            message += 'I found several games:\n';

            for (let game of body.games) {
                message += game_description(game) + '\n';
                message += 'bets for this game: ' + '/b_' + add_game2Games(msg.chat.id,game) + '\n\n';
            }
            message += 'Please refine your query';

        };
        bot.sendMessage(msg.chat.id, message);
        console.log('GAMES',Games_per_user);
    },()=>{
        bot.sendMessage(msg.chat.id, 'Oops... There are some tech difficulties  :(');
    });
});

bot.onText(/\/b[\s_](\S+)/, function (msg, match) {
    console.log('/b_',match[1]);
    console.log(Games_per_user[msg.chat.id])
    if (match[1]=='') return bot.sendMessage(msg.chat.id,'You should chose some game');
    if (!Games_per_user[msg.chat.id][+match[1]]) return bot.sendMessage(msg.chat.id,'I can\'t identify this game.\nPlease search for games again.');

    const request_json = {token:settings.api_token};
    request_json.select = {odds:true};
    request_json.filter = {};
    request_json.filter.text_query = Games_per_user[msg.chat.id][match[1]];

    request_promise(request_json)
    .then((body)=>{
        let the_game = body.games[0];
        let message = '';
        if (body.games.length == 0) {
            message += 'Sorry, i didn\tt found that game:\n' + request_json.filter.text_query;
            return bot.sendMessage(msg.chat.id, message);
        } else if (body.games.length > 1) {
            for (let i in body.games) {
                if (body.games[i].data_text == request_json.filter.text_query) {
                    if (i != 0) the_game = body.games[i];
                    break;
                }
            };
        };
        message += game_description(the_game) + '\n';

        const regrouped_odds = {};
        console.log(the_game.odds)
        for (let odd of the_game.odds) {
            if (!regrouped_odds[odd.period]) regrouped_odds[odd.period]={};
            if (!regrouped_odds[odd.period][odd.event]) regrouped_odds[odd.period][odd.event]=[];
            regrouped_odds[odd.period][odd.event].push({
                bookmaker: odd.betting_company,
                allowance: odd.allowance,
                value: odd.value
            });
        };
        console.log(regrouped_odds)
        the_game.odds = regrouped_odds;
        Game_per_user[msg.chat.id] = the_game;

        for (let period in the_game.odds) {
            message += 'Period ' + period + ': /p_' + period.replace(/\//,'') + '\n';
            for (let event in the_game.odds[period]) {
                message += '    ' + event + ': /e_' + period.replace(/\//,'') + '_' + event + '\n';
            }
        }

        bot.sendMessage(msg.chat.id, message);
    },()=>{
        bot.sendMessage(msg.chat.id, 'Oops... There are some tech difficulties  :(');
    });
});