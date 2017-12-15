const express = require('express');
let app = express();
let http = require('http').Server(app);
let io = require('socket.io')(http);
const Game = require('./Game.js');
const _ = require('lodash');

const PORT = 3000;
const GAME_TIMEOUT = 3000;
const END_GAME_TIMEOUT = 10 * 60000; // 10 minutes

const QUESTIONS = require('./questions.json');

let games = {};
let userPool = {};
let ids = 0;

function newGame() {
  let game = new Game(io);
  games[game.id] = game;
  return game;
}

app.use(express.static('public'));
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.get('/new', (req, res) => {
  res.redirect('/game/' + newGame().id);
})

app.get('/join', (req, res) => {
  res.sendFile(__dirname + '/public/join.html');
});

app.post('/join/:id', (req, res) => {
  let id = req.params.id.toLowerCase()
  if(games[id]) {
    res.status(200).json({
      message: 'Game Found',
      route: '/game/' + id,
    });
  } else {
    res.status(404).json({
      message: 'Game Not Found',
    });
  }
});

app.get('/game/:id', (req, res) => {
  let game = games[req.params.id];
  if(game) {
    res.cookie('room', game.room);
    res.sendFile(__dirname + '/public/game.html');
  } else {
    res.sendFile(__dirname + '/public/game404.html');
  }
});


http.listen(process.env.PORT || PORT, () => {
  console.log('Listening on *:', PORT);
});
