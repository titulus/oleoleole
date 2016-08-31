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

const Choices_per_user = {};

const Games_per_user = {};
const add_game2Games = (id,game) => Games_per_user[id].push(game.data_text)-1;

const Game_per_user = {};

bot.on('message',msg=>{
    console.log('MSG:',msg);
    if (!Choices_per_user[msg.chat.id]) Choices_per_user[msg.chat.id] = {step:0};

    const match_games = msg.text.match(/^\/games\s?(.*)/);
    if (match_games) {
        Choices_per_user[msg.chat.id].step = 1;
        return find_games(msg.chat.id, match_games[1]);
    };
    const match_b_ = msg.text.match(/^\/b_?(.+)/);
    if (match_b_) {
        Choices_per_user[msg.chat.id].step = 2;
        return find_bet(msg.chat.id, match_b_[1]);
    };

    switch (Choices_per_user[msg.chat.id].step) {
        case 1: return find_bet(msg.chat.id, msg.text);
        default: bot.sendMessage(msg.chat.id, 'please type /games for games search.\nAdd team name, to narrow your search.\nAdd +X and -X for game start time limit in hours.\nExamples:\n  /games - to find nearest.\n  /games FC -2 - games started in last 2 hours, with teams "FC" named like "Saint Louis FC"');
    };    
});

function find_games (id, query) {
    const request_json = {token:settings.api_token};
    request_json.select = {odds:false};
    request_json.filter = {};
    console.log('text_query',query);
    let prev_period = query.match(/-(\d{1,2})h?/);
    if (prev_period) {
        query = query.slice(0,prev_period.index) +query.slice(prev_period.index+prev_period[0].length);
    };
    let next_period = query.match(/\+(\d{1,2})h?/);
    if (next_period) {
        query = query.slice(0,next_period.index) +query.slice(next_period.index+next_period[0].length);
    };
    console.log('prev_period,next_period',prev_period,next_period);
    request_json.filter.next_period = (next_period)?+next_period[1]:1;
    request_json.filter.prev_period = (prev_period)?+prev_period[1]:0;
    request_json.filter.text_query = query.trim();
    console.log('request_json', request_json);

    Choices_per_user[id] = {
        query:request_json.filter.text_query,
        step:1
    };
    console.log('CHOICES',Choices_per_user);

    request_promise(request_json)
    .then((body)=>{
        console.log('/games api resond:',body);
        
        Games_per_user[id] = [];

        let message = '';
        if (body.games.length == 0) {
            message += 'Sorry, i found no games';
        } else if (body.games.length == 1) {
            message +=  game_description(body.games[0]) + '\n';
            message += 'bets for this game: '+'/b_'+add_game2Games(id,body.games[0]);
        } else if (body.games.length > 1) {
            message += 'I found several games:\n';

            for (let game of body.games) {
                message += game_description(game) + '\n';
                message += 'bets for this game: ' + '/b_' + add_game2Games(id,game) + '\n\n';
            }
            message += 'Please chose the game';

        };
        bot.sendMessage(id, message);
        console.log('GAMES',Games_per_user);
    },()=>{
        bot.sendMessage(id, 'Oops... There are some tech difficulties  :(');
    });
};


function find_bet (id, game_num) {
    console.log('/b_',game_num);
    console.log(Games_per_user[id])
    if (game_num=='') return bot.sendMessage(id,'You should chose some game');
    if (!Games_per_user[id][+game_num]) return bot.sendMessage(id,'I can\'t identify this game.\nPlease search for games again.');

    const request_json = {token:settings.api_token};
    request_json.select = {odds:true};
    request_json.filter = {};
    request_json.filter.text_query = Games_per_user[id][game_num];

    request_promise(request_json)
    .then((body)=>{
        let the_game = body.games[0];
        let message = '';
        if (body.games.length == 0) {
            message += 'Sorry, i didn\tt found that game:\n' + request_json.filter.text_query;
            return bot.sendMessage(id, message);
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
        Game_per_user[id] = the_game;

        for (let period in the_game.odds) {
            message += 'Period ' + period + ': /p_' + period.replace(/\//,'') + '\n';
            for (let event in the_game.odds[period]) {
                message += '    ' + event + ': /e_' + period.replace(/\//,'') + '_' + event + '\n';
            }
        }

        bot.sendMessage(id, message);
    },()=>{
        bot.sendMessage(id, 'Oops... There are some tech difficulties  :(');
    });
};