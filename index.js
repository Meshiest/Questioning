const express = require('express');
let app = express();
let http = require('http').Server(app);
let io = require('socket.io')(http);
const escape = require('html-escape');
const _ = require('lodash');

const PORT = 3000;
const GAME_TIMEOUT = 3000;
const END_GAME_TIMEOUT = 10 * 60000; // 10 minutes

const QUESTIONS = [
  'Do you prefer to spend more time with your SO, family, or friends?',
  'What activity calms you down and makes you feel at peace with the world?',
  'How often do you feel overwhelmed?',
  'If you see a homeless person asking for money, do you give them any?',
  'What will immediately disqualify a potential SO?',
  'How adventurous are you?',
  'Who do you want to be more like?',
  'Do you think any part of your personality needs to be improved?',
  'Which aspect of your life is going really well right now and which aspect could you use some help with?',
  'How politically involved are you?',
  'When was the last time you really panicked?',
  'Where do you go when you want to be alone?',
  'What chokes you up when you think about it?',
  'What was the most awkward conversation you ever had with someone?',
  'What holidays did your family really go all out for when you were growing up?',
  'Would you rather spend the day at an art, history, or science museum?',
  'What seemed normal in your family when you were growing up, but seems weird now?',
  'What\'s your favorite scene in a movie?',
  'What is a controversial opinion do you have?',
  'What fact do you try to ignore?',
  'Who in your life always stresses you out and who do you rely on to help you calm down?',
  'What are you most self-conscious about?',
  'What is the most embarrassing picture of you?',
  'What would you do if you were the opposite sex for a month?',
  'What is the most expensive thing you have stolen?',
  'What is the most childish thing you still do?',
  'Have you ever let someone take the blame for something you did?',
  'What do most of your friends think about you that is totally untrue?',
  'Who here would you most like to make out with?',
  'Have you ever cheated or been cheated on?',
  'What lie have you told that hurt someone?',
  'What is the meanest you have been to someone that didn\'t deserve it?',
  'What is something that people think you would never do but you have?',
  'What was the worst encounter you had with a police officer?',
  'What is the silliest thing you have an emotional attachment to?',
  'What is your deepest darkest fear?',
  'Where is the strangest place you have peed?',
  'Who is the person you most regret kissing?',
  'Have you ever crapped your pants since you were a child?',
  'What is the most embarrassing thing your parents have caught you doing?',
  'What secret about yourself did you tell someone in confidence and then they told a lot of other people?',
  'When was the most inappropriate time you farted?',
  'What is the scariest dream you have ever had?',
  'What is the most embarrassing thing in your room?',
  'Why did you break up with your last boyfriend or girlfriend?',
  'What is the stupidest thing you have ever done?',
  'When was the last time you peed in bed?',
  'Who is the sexiest person here?',
  'What is the grossest thing that has come out of your body?',
  'What terrible thing have you done that you lied to cover up?',
  'Who have you loved but they didn\'t love you back?',
  'What is something that you have never told anyone?',
  'What is the most disgusting habit you have?',
  'What was the cruelest joke you played on someone?',
  'What is the most embarrassing thing you have put up on social media?',
  'What bad thing have you done that no one else found out about?',
  'What was the most awkward romantic encounter you have had?',
  'What is the grossest thing you have had in your mouth?',
  'What is the most embarrassing nickname you have ever had?',
  'What is the biggest lie you have ever told?',
  'What is the most embarrassing photo you have on your phone?',
  'What is the weirdest thing you have done for a boyfriend or girlfriend?',
  'Who here has the nicest butt?',
  'What is your biggest regret?',
  'Is it true that you (whatever you or the group suspects they do / did)?',
  'When was the last time you picked your nose without a tissue?',
  'What do you really hope your parents never find out about?',
  'Have you ever made out with someone here?',
  'What is the airspeed velocity of an unladen swallow?',
  'What have you done that people here would judge you most for doing?',
  'What would you do if you were the opposite gender for a day?',
  'Who is your crush?',
  'Do you prefer to spend more time with your SO, family, or friends?',
  'What activity calms you down and makes you feel at peace with the world?',
  'How often do you feel overwhelmed?',
  'If you see a homeless person asking for money, do you give them any?',
  'What will immediately disqualify a potential SO?',
  'How adventurous are you?',
  'Who do you want to be more like?',
  'Do you think any part of your personality needs to be improved?',
  'Which aspect of your life is going really well right now and which aspect could you use some help with?',
  'How politically involved are you?',
  'When was the last time you really panicked?',
  'Where do you go when you want to be alone?',
  'What chokes you up when you think about it?',
  'What was the most awkward conversation you ever had with someone?',
  'What holidays did your family really go all out for when you were growing up?',
  'Would you rather spend the day at an art, history, or science museum?',
  'What seemed normal in your family when you were growing up, but seems weird now?',
  'What\'s your favorite scene in a movie?',
  'What is a controversial opinion do you have?',
  'What fact do you try to ignore?',
  'Who in your life always stresses you out and who do you rely on to help you calm down?',
];

app.use(express.static('public'));
app.get('/', (req, res) => {
  res.sendFile(__dirname + 'public/index.html');
});

let userPool = {};
let ids = 0;
let readyTimeout, gameTimeout, endGameTimeout;
let gameActive = false;

function lobbyEmit() {
  io.emit('lobby', _.map(_.filter(_.values(userPool), u => u.name),
    u => ({name: u.name, ready: u.ready})));
}

function inGameEmit(inGame) {
  gameActive = inGame;
  io.emit('game-active', inGame);
}

function endGame() {
  inGameEmit(false);
  _.each(userPool, u => u.ready = false);
  io.emit('reset', true, 'Game Ended by Timeout');
}

function scoreEmit(socket) {
  (socket || io).emit('scoreboard',
    // Get all selectable users and names
    _.map(_.filter(_.values(userPool), u => u.name && typeof answerMap[u.id] !== 'undefined'),
      u => ({name: u.name, score: u.score}))
    .sort((a, b) => { // Put desc scores above waiting
      if(!a.score && !b.score)
        return 0;
      if(a.score && b.score)
        return b.score[0] - a.score[0];
      return !a ? 1 : -1;
    })
  );
}

function startGame() {
  clearTimeout(endGameTimeout);
  endGameTimeout = setTimeout(endGame, END_GAME_TIMEOUT);
  
  inGameEmit(true);

  let questions = _.uniq(_.map(_.filter(userPool, u => u.name && u.question), u => u.question));
  if(questions.length < 5)
    questions = questions.concat(_.shuffle(QUESTIONS).splice(0, 5 - questions.length));
  
  _.each(userPool, user => {
    user.ready = false;
    user.socket.emit('questions', _.shuffle(questions));
  });

  lobbyEmit();
}

let answerMap = {};

function startGamePhase2() {
  clearTimeout(endGameTimeout);
  endGameTimeout = setTimeout(endGame, END_GAME_TIMEOUT);

  _.each(userPool, u => u.ready = false);

  let answers = _.map(_.filter(userPool, u => u.name && u.question), ({answers, id, name}) => ({
    answers: _.sortBy(answers, ['question']), id, name
  }));

  answers = _.shuffle(answers);
  
  let names = [];
  answerMap = {};
  _.each(answers, (u, i) => {
    names.push({name: u.name, id: u.id});
    if(u.name)
      answerMap[u.id] = i;
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
  if(gameActive)
    scoreEmit(socket);


  // User submits initial information for the game
  socket.on('init', ({name, question}) => {
    if(gameActive) {
      socket.emit('reset', true, 'There is an active game');
      return;
    }

    for(let id in userPool) {
      if(userPool[id].name === name && id != user.id) {
        socket.emit('reset', true, 'Name already in use');
        return;
      }
    }

    if(user.name.length > 30 || user.question.length > 140) {
      socket.emit('reset', true, 'Name/Question too long');
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

  // User is submitting his or her answers to the questions
  socket.on('answers', answers => {
    if(!gameActive) {
      socket.emit('reset', true, 'There is an active game');
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
      clearTimeout(gameTimeout);
      gameTimeout = setTimeout(startGamePhase2, GAME_TIMEOUT);
      scoreEmit();
    } else {
      clearTimeout(gameTimeout);
    }
  });

  // User is ready in lobby
  socket.on('ready', ready => {
    if(gameActive) {
      socket.emit('reset', true, 'There is an active game');
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

  // Submitting a guess for answers
  socket.on('guess', guess => {
    let correct = 0;
    let total = Object.keys(answerMap).length;

    _.each(guess, (id, guess) => {
      if(answerMap[id] == guess)
        correct++;
    });
    user.score = [correct, total];

    socket.emit('score', correct, total);
    scoreEmit();
  });

  socket.on('disconnect', () => {
    delete userPool[id];
    io.emit('user-count', Object.keys(userPool).length);
    lobbyEmit();

    // A member of an active game may have left
    if(gameActive && user.name && user.question) { 
      if(!user.answers.length)
        delete answerMap[user.id];

      if(!_.filter(userPool, u => !u.ready && u.name).length) {
        clearTimeout(gameTimeout);
        gameTimeout = setTimeout(startGamePhase2, GAME_TIMEOUT);
        scoreEmit();
      } else {
        clearTimeout(gameTimeout);
      }
    } else {

      // A readied user may have left
      if(!gameActive) {
        if(!_.filter(userPool, u => !u.ready && u.name).length) {
          clearTimeout(readyTimeout);
          readyTimeout = setTimeout(startGame, GAME_TIMEOUT);
        } else {
          clearTimeout(readyTimeout);
        }
      }

    }
  })
});

http.listen(process.env.PORT || PORT, () => {
  console.log('Listening on *:', PORT);
});
