const express = require('express');
let app = express();
let http = require('http').Server(app);
let io = require('socket.io')(http);
const escape = require('html-escape');
const _ = require('lodash');

const PORT = 3000;
const GAME_TIMEOUT = 3000;

app.use(express.static('public'));
app.get('/', (req, res) => {
  res.sendFile(__dirname + 'public/index.html');
});

let userPool = {};
let ids = 0;
let readyTimeout;
let gameActive = false;

function lobbyEmit() {
  io.emit('lobby', _.map(_.filter(_.values(userPool), u => u.name),
    u => ({name: u.name, ready: u.ready})));
}

function inGameEmit(inGame) {
  gameActive = inGame;
  io.emit('game-active', inGame);
}

function scoreEmit() {
  io.emit('scoreboard',
    _.map(_.filter(_.values(userPool), u => u.name),
      u => ({name: u.name, score: u.score}))
    .sort((a, b) => {
      if(!a.score && !b.score)
        return 0;
      if(a.score && b.score)
        return b.score[0] - a.score[0];
      return !a ? -1 : 1;
    })
  );
}

function startGame() {
  inGameEmit(true);

  let questions = _.uniq(_.map(_.filter(userPool, u => u.name && u.question), u => u.question));
  _.each(userPool, user => {
    user.ready = false;
    user.socket.emit('questions', _.shuffle(questions));
  });

  lobbyEmit();
}

let answerMap = {};

function startGamePhase2() {
  let answers = _.map(_.filter(userPool, u => u.name && u.question), ({answers, id, name}) => ({
    answers: _.sortBy(answers, ['question']), id, name
  }));
  answers = _.shuffle(answers);
  
  let names = [];
  _.each(answers, (u, i) => {
    names.push({name: u.name, id: u.id});
    if(u.name)
      answerMap[i] = u.id;
    delete u.name;
    u.id = i;
  });
  
  names = _.sortBy(names, ['name']);

  _.each(userPool, user => {
    user.socket.emit('answers', {
      names,
      answers: _.shuffle(answers),
    });
  });

  inGameEmit(false);
}


io.on('connection', socket => {
  let id = ids++;
  let user = userPool[id] = {
    id,
    socket,
    name: '',
    question: '',
    answers: [],
    ready: false,
  };
  clearTimeout(readyTimeout);

  io.emit('user-count', Object.keys(userPool).length);
  socket.emit('game-active', gameActive);

  socket.on('init', ({name, question}) => {
    if(gameActive) {
      socket.emit('reset');
      return;
    }

    if(user.name.length > 140 || user.question.length > 140) {
      socket.emit('reset');
      return;
    }

    user.name = escape(name);
    user.question = escape(question);
    user.ready = false;
    user.score = false;
    user.answers = [];
    clearTimeout(readyTimeout);

    lobbyEmit();
  });

  socket.on('answers', answers => {
    if(!gameActive) {
      socket.emit('reset');
      return;
    }

    user.answers = _.map(answers, ({question, answer}) => ({
      answer: escape(answer),
      question,
    }));
    user.ready = true;
    socket.emit('waiting');
    lobbyEmit();

    if(!_.filter(userPool, u => !u.ready && u.name).length) {
      clearTimeout(readyTimeout);
      readyTimeout = setTimeout(startGamePhase2, GAME_TIMEOUT);
    } else {
      clearTimeout(readyTimeout);
    }
  });

  socket.on('ready', ready => {
    if(gameActive) {
      socket.emit('reset');
      return;
    }
    
    user.ready = !!ready;
    lobbyEmit();

    if(!_.filter(userPool, u => !u.ready && u.name).length) {
      readyTimeout = setTimeout(startGame, GAME_TIMEOUT);
    } else {
      clearTimeout(readyTimeout);
    }
  });

  socket.on('guess', guess => {
    let correct = 0;
    let total = Object.keys(answerMap).length;

    _.each(guess, (id, guess) => {
      if(answerMap[guess] == id)
        correct++;
    });
    user.score = [correct, total];

    socket.emit('score', correct, total);
    scoreEmit();
  });

  socket.on('disconnect', () => {
    delete userPool[id];
    io.emit('user-count', Object.keys(userPool).length);
    if(gameActive) { 
      _.each(userPool, u => {
        u.ready = false
        u.name = '';
        u.question = '';
      });
      lobbyEmit();
      io.emit('reset');
      inGameEmit(false);
    }
  })
});

http.listen(process.env.PORT || PORT, () => {
  console.log('Listening on *:', PORT);
});
