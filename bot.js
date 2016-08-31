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
            case "ice hockey": description+='🏒 '; break;
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

const Users_Data = {};

const add_game2usergames = (id,game) => Users_Data[id].games.push(game.data_text)-1;

bot.on('message',msg=>{
    console.log(new Date(),msg.chat.id+': '+msg.text);
    if (!Users_Data[msg.chat.id]) Users_Data[msg.chat.id] = {step:0};

    const match_games = msg.text.match(/^\/games\s?(.*)/);
    if (match_games) {
        return find_games(msg.chat.id, match_games[1]);
    };
    const match_d = msg.text.match(/^\/(\d+)/);
    if ((Users_Data[msg.chat.id].step == 1 || Users_Data[msg.chat.id].step == 2)
        && match_d) {
        return find_bets(msg.chat.id, match_d[1]);
    };

    const default_message = 'please type /games for games search.\nAdd team name, to narrow your search.\nAdd +X and -X for game start time limit in hours.\nExamples:\n  /games - to find nearest.\n  /games FC -2 - games started in last 2 hours, with teams "FC" named like "Saint Louis FC"';
    switch (Users_Data[msg.chat.id].step) {
        case 0: {
            bot.sendMessage(msg.chat.id, default_message);
        }; break;
        case 1: {
            return find_bets(msg.chat.id, msg.text);
        }; break;
        case 2: {
            if (Users_Data[msg.chat.id].games[msg.text]) {
                return find_bets(msg.chat.id, msg.text);
            }
            const commands = msg.text.split(' ');
            if (commands.length == 1) {
                return chose_period(msg.chat.id, msg.text);
            }
        }; break;
        case 3: {
            if (Users_Data[msg.chat.id].periods.has(msg.text.toUpperCase())) {
                return chose_period(msg.chat.id, msg.text);
            }
            return chose_event(msg.chat.id, msg.text);
        }
        case 4: {
            if (Users_Data[msg.chat.id].events.has(msg.text.toUpperCase())) {
                return chose_event(msg.chat.id, msg.text);
            }
        }
        default: bot.sendMessage(msg.chat.id, default_message);
    };    
});

function find_games (id, query) {
    // console.log('FIND GAMES:',query);
    const request_json = {token:settings.api_token};
    request_json.select = {odds:false};
    request_json.filter = {};
    let prev_period = query.match(/-(\d{1,2})h?/);
    if (prev_period) {
        query = query.slice(0,prev_period.index) +query.slice(prev_period.index+prev_period[0].length);
    };
    let next_period = query.match(/\+(\d{1,2})h?/);
    if (next_period) {
        query = query.slice(0,next_period.index) +query.slice(next_period.index+next_period[0].length);
    };
    request_json.filter.next_period = (next_period)?+next_period[1]:1;
    request_json.filter.prev_period = (prev_period)?+prev_period[1]:0;
    request_json.filter.text_query = query.trim();

    request_promise(request_json)
        .then((body)=>{
            Users_Data[id].games = [];

            if (body.games.length == 0) {
                return  bot.sendMessage(id, 'Sorry, i found no games');
            }

            let message = '';
            if (body.games.length > 1) {
                message += 'I found several games:\n';
            }

            for (let game of body.games) {
                message += '/' + add_game2usergames(id,game) + ' ' + game_description(game) + '\n\n';
            }
            message += 'Please enter the game number or click on it.';

            Users_Data[id].step = 1;
            Users_Data[id].query = request_json.filter.text_query;

            bot.sendMessage(id, message);
        },()=>{
            bot.sendMessage(id, 'Oops... There are some tech difficulties  :(');
        });
};


function find_bets (id, game_num) {
    // console.log('FIND BETS:',game_num);
    if (!Users_Data[id].games[+game_num]) return bot.sendMessage(id,'I can\'t identify this game.\n. Please enter the right number.');

    const request_json = {token:settings.api_token};
    request_json.select = {odds:true};
    request_json.filter = {};
    request_json.filter.text_query = Users_Data[id].games[game_num];

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
            const periods = new Set();
            const events = new Set();
            for (let odd of the_game.odds) {
                if (!regrouped_odds[odd.period]) {
                    regrouped_odds[odd.period]={};
                    periods.add(odd.period);
                }
                if (!regrouped_odds[odd.period][odd.event]) {
                    regrouped_odds[odd.period][odd.event]=[];
                    events.add(odd.event);
                }
                regrouped_odds[odd.period][odd.event].push({
                    bookmaker: odd.betting_company,
                    allowance: odd.allowance,
                    value: odd.value,
                    url: odd.source_url
                });
            };
            the_game.odds = regrouped_odds;

            message += 'Bets availible for:\n'
            message += ' Periods: ';
            periods.forEach(period => message+=' '+period);
            message += '\n';
            message += ' Events:';
            const sorted_events = Array.from(events).sort();
            for (let event of sorted_events) {
                message+=' '+event;
            }
            message += '\n';
            message += 'Please, enter the period.';

            Users_Data[id].step = 2;
            Users_Data[id].game = the_game;
            Users_Data[id].periods = periods;

            bot.sendMessage(id, message);
        },()=>{
            bot.sendMessage(id, 'Oops... There are some tech difficulties  :(');
        });
};

function chose_period (id, period) {
    // console.log('CHOSE PERIOD',period);
    if (!Users_Data[id].periods.has(period.toUpperCase())) return bot.sendMessage(id,'I can\'t identify the period.\nPlease enter the right one.');
    period = period.toUpperCase();

    let message = '';

    message += game_description(Users_Data[id].game) + '\n';
    message += '[' + period + '] Period (Allowance/Value)\n';
    let sorted_events = Object.keys(Users_Data[id].game.odds[period]).sort();
    let events = new Set();
    for (let event of sorted_events) {
        events.add(event);
        message += event + ':';
        for (let odd of Users_Data[id].game.odds[period][event]) {
            message += ' (' + odd.allowance + '/' + odd.value + ')';
        };
        message += '\n';
    };

    Users_Data[id].step = 3;
    Users_Data[id].period = period;
    Users_Data[id].events = events;

    bot.sendMessage(id, message);
};

function chose_event (id, event) {
    // console.log('CHOSE EVENT',event);
    if (!Users_Data[id].game.odds[Users_Data[id].period][event.toUpperCase()]) return bot.sendMessage(id,'I can\'t identify the event.\nPlease enter the right one.');
    event = event.toUpperCase();

    let message = '';

    message += game_description(Users_Data[id].game) + '\n';
    message += '[' + Users_Data[id].period + '] Period. [' + event + '] Event. (Allowance/Value)\n';

    for (let odd of Users_Data[id].game.odds[Users_Data[id].period][event]) {
        message += odd.bookmaker + ' (' + odd.allowance + '/' + odd.value + ') ' + odd.url + '\n';
    }

    Users_Data[id].step = 4;
    Users_Data[id].event = event;

    bot.sendMessage(id, message);
}