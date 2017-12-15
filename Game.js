const md5 = require('md5');
const _ = require('lodash');
const escape = require('escape-html');


let numGames = 0;

const 
LOBBY = 0;
const ANSWERING = 1;
const GUESSING = 2;

module.exports = class Game {
  constructor(io) {
    this.room = md5(++numGames + ':' + Math.random());
    this.id = this.room.substr(0, 5);
    this.io = io.of('/' + this.room);

    this.users = {};
    this.questions = [];
    this.answers = {};
    this.ids = 0;
    this.leader = undefined;
    this.gameActive = false;
    this.gameState = LOBBY;

    this.initIo();
  }

  // Tells all players about other players
  lobbyEmit() {
    this.io.emit('lobby',
      _.map(_.filter(this.users, u => u.name), u => ({
        name: u.name,
        ready: u.ready,
        inGame: u.inGame,
        leader: u.leader,
      }))
    );
  }

  // Tells all inGame players about the state of the game
  gameEmit() {
    this.io.to('game').emit('state',
      _.map(_.filter(this.users, u => u.inGame), u => ({
        name: u.name,
        ready: u.ready,
      }))
    );
  }

  // Tells all players the scores
  scoreEmit() {
    this.io.emit('scoreboard',
      // Get all selectable users and names
      _.map(_.filter(_.values(this.users), u => typeof this.answers[u.id] !== 'undefined'),
        u => ({name: u.name, score: u.score}))
      .sort((a, b) => { // Put desc scores above waiting
        if(!a.score && !b.score)
          return 0;
        if(a.score && b.score)
          return b.score[0] - a.score[0];
        return !a.score ? 1 : -1;
      })
    );
  }

  getQuestions() {
    this.questions = [];

    _.each(this.users, u => {
      if(u.ready) {
        u.ready = false;
        u.inGame = true;
        u.socket.join('game');
        this.questions.push({
          userId: u.id,
          question: u.question,
        });
        u.question = '';
      }
    });

    this.questions = _.map(_.shuffle(this.questions), (q, i) => {
      q.id = i;
      return q;
    });

    let userQuestions = _.map(this.questions, q => ({
      id: q.id,
      question: q.question,
    }));

    // Emit shuffled questions to each player
    _.each(this.users, u => {
      if(u.inGame)
        u.socket.emit('questions', _.shuffle(userQuestions));
    });

    this.gameActive = true;
    this.gameState = ANSWERING;
    this.gameEmit();
    this.lobbyEmit();
  }

  playersReady() {
    return !_.filter(this.users, u => !u.ready && u.inGame).length
  }

  distributeAnswers() {
    _.each(this.users, u => {
      if(u.ready) {
        u.ready = false;
      }
    });

    let answers = _.map(_.filter(this.users, u => u.inGame), ({answers, id, name}) => ({
      answers: _.sortBy(answers, ['id']),
      id,
      name
    }));

    answers = _.shuffle(answers);
    this.gameEmit();
    this.gameState = LOBBY;
    this.gameActive = false;
    
    let names = [];
    this.answers = {};
    _.each(answers, (u, i) => {
      names.push({name: u.name, id: u.id});
      if(u.name)
        this.answers[u.id] = i;
      delete u.name;
      u.id = i;
    });
    
    names = _.sortBy(names, ['name']);

    _.each(this.users, user => {
      if(user.inGame)
        user.socket.emit('answers', {
          names: _.filter(names, u => u.id !== user.id),
          answers: _.filter(_.shuffle(answers), a => a.id !== this.answers[user.id]),
          questions: _.map(this.questions, q => ({
            id: q.id,
            question: q.question,
          })),
        });
    });
  }

  initIo() {
    let io = this.io;
    io.on('connection', socket => {
      let id = this.ids++;
      let user = this.users[id] = {
        socket,
        id,
        name: '',
        question: '',
        ready: false,
        score: false,
        inGame: false,
        leader: false,
      };

      socket.emit('hardReset');

      this.lobbyEmit();

      socket.on('disconnect', () => {
        delete this.users[id];
        let keys = Object.keys(this.users); 

        if(user.leader && keys.length) {
          this.leader = undefined;

          while(keys.length) {
            let newLeader = this.users[keys.splice(0, 1)];
            if(!newLeader.name)
              continue;

            this.leader = newLeader;
            newLeader.socket.emit('leader', true);
            newLeader.leader = true;
            break;
          }
        }

        if(this.gameActive) {
          this.gameEmit();

          if(this.gameState === ANSWERING && this.playersReady()) {
            this.distributeAnswers();
          }
        }

        this.lobbyEmit();
      });

      // User sets his or her name
      socket.on('name', name => {
        if(typeof name != 'string') {
          socket.emit('invalid-name', 'Name not valid type');
          return;
        }

        if(user.inGame) {
          socket.emit('invalid-name', 'Name cannot be changed while in game');
          return;
        }

        name = _.trim(name);

        if(name.length < 1) {
          socket.emit('invalid-name', 'Name too short');
          return;
        }

        if(name.length > 30) {
          socket.emit('invalid-name', 'Name too long');
          return;
        }

        for(let id in this.users) {
          if(this.users[id].name === name && id != user.id) {
            socket.emit('invalid-name', 'Name taken');
            return;
          }
        }

        name = escape(name);

        user.name = name;
        socket.emit('valid-name', user.name);

        if(!this.leader) {
          this.leader = user;
          user.leader = true;
          socket.emit('leader', true);
        }

        this.lobbyEmit();
      });

      // User updates his or her question
      socket.on('question', question => {
        if(typeof question != 'string') {
          socket.emit('invalid-question', 'Question not valid type');
          return;
        }

        if(user.name.length === 0) {
          socket.emit('invalid-question', 'User has no name');
          return;
        }

        if(user.inGame) {
          socket.emit('invalid-question', 'Question cannot be changed while in game');
          return;
        }

        if(user.ready) {
          socket.emit('invalid-question', 'Question cannot be changed while ready');
          return;
        }

        question = _.trim(question);

        if(question.length < 1) {
          socket.emit('invalid-question', 'Question too short');
          return;
        }

        if(question.length > 140) {
          socket.emit('invalid-question', 'Question too long');
          return;
        }

        question = escape(question);

        user.question = question;
        socket.emit('valid-question', question);
      });

      // User presses the ready button
      socket.on('ready', ready => {
        if(user.name.length === 0) {
          socket.emit('invalid-ready', 'User has no name');
          return;
        }

        if(user.inGame) {
          socket.emit('invalid-ready', 'Cannot ready while in game');
          return;
        }

        if(user.question.length === 0) {
          socket.emit('invalid-ready', 'Cannot ready without a question');
          return;
        }

        user.score = false;
        // Start the game if the leader readies up
        if(user.leader) {
          let count = 0;
          _.each(this.users, u => u.ready ? ++count : 0);
          if(count < 2) {
            socket.emit('invalid-ready', 'A minimum of 3 players are required');
            return;
          }

          user.ready = true;
          this.getQuestions();
        } else {
          user.ready = !!ready;
          socket.emit('valid-ready', user.ready);
          this.lobbyEmit();
        }
      });

      socket.on('answers', answers => {
        if(!user.inGame) {
          socket.emit('invalid-answers', 'Cannot answer while not in game');
          return;
        }

        if(this.gameState !== ANSWERING) {
          socket.emit('invalid-answers', 'Cannot answer while not in answering phase');
          return;
        }

        if(user.answers && user.answers.length) {
          socket.emit('invalid-answers', 'Cannot submit answers twice');
          return;
        }

        if(!_.isArray(answers)) {
          socket.emit('invalid-answers', 'Answers not an array');
          return;
        }

        for(let i = 0; i < answers.length; i++) {
          if(typeof answers[i].answer === 'undefined' || typeof answers[i].id === 'undefined') {
            socket.emit('invalid-answers', 'Invalid answer object format');
            return;
          }

          answers[i].answer = _.trim(answers[i].answer);

          if(answers[i].answer.length === 0) {
            socket.emit('invalid-answers', 'Answer ' + (i+1) + ' too short');
            return;
          }

          if(answers[i].answer.length > 140) {
            socket.emit('invalid-answers', 'Answer ' + (i+1) + ' too long');
            return;
          }

          answers[i].answer = escape(answers[i].answer);

          if(!this.questions[answers[i].id]) {
            socket.emit('invalid-answers', 'One of these answers is to a non-existent question');
            return;
          }
        }

        if(answers.length < this.questions.length) {
          socket.emit('invalid-answers', 'Not every question answered');
          return;
        }

        user.answers = answers;
        user.ready = true;
        socket.emit('valid-answers');
        this.gameEmit();
        if(this.playersReady())
          this.distributeAnswers();
      });

      socket.on('guesses', guess => {
        if(!user.inGame) {
          socket.emit('invalid-guesses', 'Cannot guess while not in game');
          return;
        }

        if(this.gameState !== LOBBY) {
          socket.emit('invalid-guesses', 'Cannot guess while not in guessing phase');
          return;
        }

        let correct = 0;
        let total = Object.keys(this.answers).length - 1;

        _.each(guess, (id, guess) => {
          if(this.answers[id] == guess)
            correct++;
        });

        user.score = [correct, total];
        user.ready = false;
        user.inGame = false;
        socket.leave('game');

        socket.emit('valid-guesses', correct, total);
        this.scoreEmit();
        this.gameEmit();
        this.lobbyEmit();
      });

    });
  }
};