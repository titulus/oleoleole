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
            case "ice hockey": description+='🏒 '; break;
            case "basketball": description+='🏀 '; break;
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

bot.on('message',msg=>{
    console.log(new Date(),msg.chat.id+': '+msg.text);
    const id = msg.chat.id;
    if (!Users_Data[id]) {
        Users_Data[id] = {step:0};
    } else {
        clearTimeout(Users_Data[id].countdown);
    };
    Users_Data[id].countdown = setTimeout(function () {
        console.log('User '+id+' left');
        delete Users_Data[id];
        bot.sendMessage(id, '🕝 Too much time left. You need to search again to get actual data. Please, use /games again'); // I don't really know... are those kind of messages acceptable by Telegram rules?
    }, 10000)

    const default_message = 'please type /games for games search.\nAdd team name, to narrow your search.\nAdd +X and -X for game start time limit in hours.\nExamples:\n  /games - to find nearest.\n  /games FC -2 - games started in last 2 hours, with teams "FC" named like "Saint Louis FC"';

    if (msg.text.match(/^\/start/)) {
        bot.sendMessage(id, default_message);
    }
    const match_games = msg.text.match(/^\/games\s?(.*)/);
    if (match_games) {
        return find_games(id, match_games[1]);
    };
    const match_d = msg.text.match(/^\/(\d+)/);
    if ((Users_Data[id].step == 1 || Users_Data[id].step == 2)
        && match_d) {
        return chose_game(id, match_d[1]);
    };

    switch (Users_Data[id].step) {
        case 0: {   // before first search, not specified command
            bot.sendMessage(id, default_message);
        }; break;
        case 1: {   // after search
            return chose_game(id, msg.text);
        }; break;
        case 2: {   // after chosing game
            if (Users_Data[id].games[msg.text]) {
                return chose_game(id, msg.text);
            };
            const commands = msg.text.split(' ');
            if (commands.length == 1) {
                return chose_period(id, msg.text);
            };
            const period = commands[0].toUpperCase();
            if (!Users_Data[id].game.odds[period]) {
                return bot.sendMessage(id,'I can\'t identify the period.\nPlease enter the right one.');
            };
            Users_Data[id].period = period;
            return chose_event(id, commands[1]);
        }; break;
        case 3: {   // after chosing period or event
            const commands = msg.text.split(' ');
            if (commands.length == 1) {
                if (Users_Data[id].game.odds[msg.text.toUpperCase()]) {
                    return chose_period(id, msg.text);
                };
                return chose_event(id, msg.text);
            };
            const period = commands[0].toUpperCase();
            if (!Users_Data[id].game.odds[period]) {
                return bot.sendMessage(id,'I can\'t identify the period.\nPlease enter the right one.');
            };
            Users_Data[id].period = period;
            return chose_event(id, commands[1]);
        }; break;
        default: bot.sendMessage(id, default_message);
    };    
});

const cut_matched = (str, match) => str.slice(0,match.index) + str.slice(match.index+match[0].length);

function find_games (id, query) {
    // console.log('FIND GAMES:',query);
    const request_json = {token:settings.api_token};
    request_json.select = {odds:false};
    request_json.filter = {};
    let prev_period = query.match(/-(\d{1,2})/);
    if (prev_period) {
        query = cut_matched(query, prev_period);
    };
    let next_period = query.match(/\+(\d{1,2})/);
    if (next_period) {
        query = cut_matched(query, next_period);
    };
    request_json.filter.next_period = (next_period)?+next_period[1]:settings.default_next;
    request_json.filter.prev_period = (prev_period)?+prev_period[1]:settings.default_prev;
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
            const games = [];
            for (let game of body.games) {
                message += '/' + (games.push(game.data_text)-1) + ' ' + game_description(game) + '\n\n';
            }
            message += 'Please enter the game number or click on it.';

            Users_Data[id].step = 1;
            Users_Data[id].query = request_json.filter.text_query;
            Users_Data[id].games = games;

            bot.sendMessage(id, message);
        },()=>{
            bot.sendMessage(id, 'Oops... There are some tech difficulties  :(');
        });
};


function chose_game (id, game_num) {
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

            message += 'Bets availible for:\n';
            message += ' Periods: ';
            periods.forEach(period => message+=' '+period);
            message += '\n';
            message += ' Events:';
            const sorted_events = Array.from(events).sort();
            for (let event of sorted_events) {
                message+=' '+event;
            }
            message += '\n\n';
            message += 'From now, you can switch between periods and their events by entering them separated by space or new line [↵]\n for example: "F"; "1/3[↵]X"; "F[↵]x[↵]F2"; "1/2 x2". Case insensitive 😉';

            Users_Data[id].step = 2;
            Users_Data[id].game = the_game;

            bot.sendMessage(id, message);
        },()=>{
            bot.sendMessage(id, 'Oops... There are some tech difficulties  :(');
        });
};

const odd_to_string = odd =>  ((odd.value>2)?((odd.value>5)?'💰':'💵'):'') + odd.value + '/' + odd.allowance;

function chose_period (id, period) {
    // console.log('CHOSE PERIOD',period);
    period = period.toUpperCase();
    const game = Users_Data[id].game;
    if (!game.odds[period]) {
        return bot.sendMessage(id,'I can\'t identify the period.\nPlease enter the right one.');
    };

    let message = '';

    message += game_description(game) + '\n';
    message += '[' + period + ' of';
    for (let period of Object.keys(game.odds).sort()) {
        message += ' ' + period;
    };
    message += '] Period (Odd/Allowance)\n';
    let sorted_events = Object.keys(game.odds[period]).sort();
    let events = new Set();
    for (let event of sorted_events) {
        events.add(event);
        message += event + ':';
        for (let odd of game.odds[period][event]) {
            message += ' (' + odd_to_string(odd) + ')';
        };
        message += '\n';
    };

    Users_Data[id].step = 3;
    Users_Data[id].period = period;

    bot.sendMessage(id, message);
};

function chose_event (id, event) {
    // console.log('CHOSE EVENT',event);
    event = event.toUpperCase();
    const game = Users_Data[id].game;
    const period = Users_Data[id].period;
    if (!game.odds[period][event]) {
        return bot.sendMessage(id,'I can\'t identify the event.\nPlease enter the right one.');
    };

    let message = '';

    message += game_description(game) + '\n';
    message += '[' + period + '] Period. [' + event + '] Event. (Odd/Allowance)\n';

    for (let odd of game.odds[period][event]) {
        message += odd.bookmaker + ' (' + odd_to_string(odd) + ') ' + odd.url + '\n';
    }

    Users_Data[id].step = 3;
    Users_Data[id].event = event;

    bot.sendMessage(id, message);
}