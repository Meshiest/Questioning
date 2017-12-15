let socket;
let isReady = false;
let isGameActive = false;
let isLeader = false;
let userName;
let userMap = {};
let questionMap = {};

// Form handler for updating name
function submitName(event) {
  event.preventDefault();

  let form = event.target;
  form.className = 'form-loading';

  socket.emit('name', form.name.value);
}

// Form handler for updating question
function submitQuestion(event) {
  event.preventDefault();

  let form = event.target;
  form.className = 'form-loading';

  socket.emit('question', form.question.value);
}

function sendMessage(event) {
  event.preventDefault();

  let form = event.target;
  socket.emit('message', form.message.value);
  form.message.value = "";
}

// Form handler for answering other user's questions
function submitAnswers(event) {
  event.preventDefault();

  let form = event.target;
  form.className = 'form-loading';

  let answers = [];
  for(let i = 0; i < form.numQuestions.value; i++) {
    answers.push({
      id: form['question_' + i].value,
      answer: form['answer_' + i].value,
    });
  }

  socket.emit('answers', {
    answers,
    favorite: form.favoriteQuestion.value
  });
}

// Form handler for guessing which users correspond to answers
function submitGuess(event) {
  event.preventDefault();

  let form = event.target;
  form.className = 'form-loading';
  let guesses = {};
  for(let i = 0; i < form.numUsers.value; i++) {
    guesses[form['id_' + i].value] = form['guess_' + i].value;
  }

  socket.emit('guesses', guesses);
}

function selectUser(event) {
  let usedNames = {};
  $('select.names').each((i, e) => {
    usedNames[$(e).val()] = true;
  });
  $('select.names option').each((i, e) => {
    if(e.value.length !== 0)
      $(e).html((usedNames[e.value] ? '&check; ' : '&cross; ') + userMap[e.value]);
  });
}

function voteQuestion(event, id) {
  $('.star-button').html('&#x2606;');
  if($('#favoriteQuestion').val() != id) { 
    $('#favoriteQuestion').val(id);
    $(event.target).html('&#x2605;');
  } else {
    $('#favoriteQuestion').val(-1);
  }
}

// Game resets to its initial state
function hardReset() {
  $('.container').addClass('hidden');
  $('#nameForm').removeClass('hidden');
  $('#userView').removeClass('hidden');
  $('#nameInput').val(localStorage.gameName || '');
}

// Button handler for edit question button
function showEditQuestion() {
  $('#questionPreview').addClass('hidden');
  $('#questionForm').removeClass('hidden');
  $('#questionForm .error').text('');
}

// Resets the question dialog to default state
function showQuestionDialog() {
  $('#questionPreview').addClass('hidden');
  $('#questionForm').removeClass('hidden');
  $('#editQuestionButton').removeClass('hidden');
  $('#question').text('');
  $('#questionInput').val('');
  $('#questionForm form')[0].className = '';
  $('#questionForm .error').text('');
}

function resetLobby() {
  isGameActive = false;
  showQuestionDialog();
  $('#readyButton').attr('disabled', true);
  $('#readyError').text('');
  $('#readyButton').removeClass('hidden');
  $('#userView').removeClass('hidden');
  $('#scoreView').addClass('hidden');
  $('#scoreboardView').addClass('hidden');
  $('#guessForm').addClass('hidden');
  $('#answerForm').addClass('hidden');
  $('#chatView').removeClass('hidden');
  setReady(false);
}

function closeLobby() {
  $('#questionPreview').addClass('hidden');
  $('#questionForm').addClass('hidden');
  $('#readyButton').addClass('hidden');
  $('#readyError').text('');
  $('#answerForm').removeClass('hidden');
  $('#answerForm form')[0].className = '';
}

// Handler for the ready button
function toggleReady(event) {
  $('#readyButton').attr('disabled', true);
  socket.emit('ready', !isReady);
}

// Updates the ready button appearance
function setReady(ready) {
  isReady = ready;

  if(isLeader)
    $('#readyButton').text('Start Game');
  else
    $('#readyButton').text(isReady ? 'Not Ready' : 'Ready!');

  $('#readyButton').addClass(isReady ? 'not-ready' : 'ready');
  $('#readyButton').removeClass(!isReady ? 'not-ready' : 'ready');
}

window.addEventListener('load', () => {
  socket = io('/' + $.cookie('room'));
  $('#nameInput').val(localStorage.gameName || '');

  socket.on('leader', leader => {
    isLeader = leader;
    setReady(false);
  });

  socket.on('hardReset', hardReset);
  socket.on('resetLobby', resetLobby);

  socket.on('invalid-name', message => {
    $('#nameForm form')[0].className = 'form-error';
    $('#nameForm .error').html(message);
  });

  socket.on('valid-name', name => {
    userName = name;
    localStorage.gameName = name;
    $('#nameForm').addClass('hidden');
    $('#readyButton').removeClass('hidden');
    resetLobby();
  });

  socket.on('invalid-question', message => {
    $('#questionForm form')[0].className = 'form-error';
    $('#questionForm .error').html(message);
  });

  socket.on('valid-question', question => {
    $('#questionForm form')[0].className = '';
    $('#questionForm').addClass('hidden');
    $('#question').html(question);
    $('#readyButton').attr('disabled', false);
    $('#questionPreview').removeClass('hidden');
  });

  socket.on('invalid-ready', message => {
    $('#readyError').html(message);
    $('#readyButton').attr('disabled', false);
  });

  socket.on('valid-ready', ready => {
    $('#readyError').text('');
    $('#readyButton').attr('disabled', false);
    setReady(ready);
  });

  socket.on('invalid-answers', message => {
    $('#answerForm form')[0].className = 'form-error';
    $('#answerForm .error').html(message);
  });

  socket.on('valid-answers', () => {
    $('#answerForm form')[0].className = '';
    $('#answerForm').addClass('hidden');
  });

  socket.on('invalid-guesses', message => {
    $('#guessForm form')[0].className = 'form-error';
    $('#guessForm .error').text(message);
  });

  socket.on('valid-guesses', (correct, total) => {
    $('#guessForm form')[0].className = '';
    $('#guessForm').addClass('hidden');
    $('#userView').addClass('hidden');
    $('#scoreView').removeClass('hidden');
    $('#scoreboardView').removeClass('hidden');
    $('#scoreCorrect').html(correct);
    $('#scoreTotal').html(total);
    isGameActive = false;
  });

  // Called everytime ready status is updated
  socket.on('lobby', users => {
    if(isGameActive)
      return;

    let list = $('#userList');

    list.empty();

    if(users.length === 0)
      list.append($('<i class="hint"/>').text('No one here!'));

    users.forEach(({name, ready, leader, inGame}) => {
      list.append(
        $('<div class="lobby-user"/>')
        .addClass(!leader && !ready && name && !inGame ? 'not-ready' : 'ready')
        .html(`
          <div class="user-name" style="${name === userName ? 'font-weight: bold;' : ''}">
            ${name}
          </div>
          <div class="user-ready">
            ${inGame ? '&#x2694;' :
              leader ? '&#9818;' :
              ready ? '&check;' : '&#x29D6;'}
          </div>
        `));
    });
  });

  // Called when a player is ready
  socket.on('state', users => {
    let list = $('#userList');

    list.empty();

    if(users.length === 0)
      list.append($('<i class="hint"/>').text('No one here!'));

    users.forEach(({name, ready, leader, inGame}) => {
      list.append(
        $('<div class="lobby-user"/>')
        .addClass(!ready ? 'not-ready' : 'ready')
        .html(`
          <div class="user-name" style="${name === userName ? 'font-weight: bold;' : ''}">
            ${name}
          </div>
          <div class="user-ready">
            ${ready ? '&check;' : '&#x29D6;'}
          </div>
        `));
    });
  });

  // Give the player all the questions he or she needs to answer
  socket.on('questions', questions => {
    isGameActive = true;
    closeLobby();

    $('#numQuestions').val(questions.length);
    $('#favoriteQuestion').val(-1);

    let list = $('#questionList');
    list.empty();

    questions.forEach(({question, id}, i) => {
      list.append($('<div class="question"/>').html(`
        <div class="input-container">
          <label for="answer_${i}">${question}</label>
          <input type="hidden" name="question_${i}" value="${id}">
          <input type="text" maxlength="140" autocomplete="off" name="answer_${i}" id="answer_${i}" placeholder="Answer" required>
        </div>
        <div class="star">
          <span class="star-button" onclick="voteQuestion(event, ${id})">&#x2606;</span>
        </div>
      `));
    });
  });

  // Called when everyone is done answering questions
  // and players guess who answered what
  socket.on('answers', ({names, answers, questions}) => {
    userMap = {};
    names.forEach(({id, name}) => userMap[id] = name);
    questionMap = {};
    questions.forEach(({id, question}) => questionMap[id] = question);

    $('#guessForm').removeClass('hidden');
    $('#numUsers').val(answers.length);

    let list = $('#answerList');
    list.empty();

    answers.forEach(({id, answers}, i) => {
      list.append($('<div/>').html(`
        <div class="user-field">
          <input type="hidden" name="id_${i}" value="${id}">
          <select class="names" onchange="selectUser(event)" name="guess_${i}">
            <option value="">Select a Name</option>
            ${names.map(({id, name}) => `
              <option value="${id}">&cross; ${name}</option>
            `)}
          </select>
          <div class="answers">
            ${answers.map(({id, answer}) => `
              <div class="question-pair">
                <div class="question">${questionMap[id]}</div>
                <div class="answer">&quot;${answer}&quot;</div>
              </div>
            `).join('')}
          </div>
        </div>
      `));
    });
  });

  socket.on('scoreboard', (users, best) => {
    let list = $('#scoreList');
    list.empty();

    users.forEach(({name, score, id}) => {
      list.append($('<div class="lobby-user"/>')
      .addClass('lobby-user ' + (score ? 'ready' : 'not-ready'))
      .html(`
        <div class="user-name">
          ${name}
        </div>
        <div class="user-ready best-question">
          ${best == id ? '&#x2605;' : ''}
        </div>
        <div class="user-ready">
          ${score ? score.join('/') : '&#x29D6;'}
        </div>`));
    });
  });

  socket.on('message', (sender, message) => {
    $('#chatHistory').append($('<div class="message ' + (!sender ? 'sent' : '') + '"/>')
      .append($('<div class="author"/>').text(sender || 'You'))
      .append($('<div class="content"/>').html(message)));
    $("#chatHistory").scrollTop($("#chatHistory")[0].scrollHeight);
  });
});

window.addEventListener('unload', () => {
  if(socket && socket.readyState === WebSocket.OPEN) {
    socket.close();
  }
});
