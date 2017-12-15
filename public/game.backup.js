let socket;
let isReady = false;
let inGame = false;
let isGameActive = false;
let name;

// TODO Remove these
function utf8_to_b64(str) {
  return window.btoa(unescape(encodeURIComponent( str )));
}

function b64_to_utf8(str) {
  return decodeURIComponent(escape(window.atob( str )));
}

function submitName(event) {
  let form = event.target;
  form.className = 'form-loading';

  socket.emit('name', form.name.value);
}

// Form handler for initial question and name form
function submitInit(event) {
  if(event)
    event.preventDefault();

  let form = event.target;

  if(isGameActive)
    return;

  socket.emit('init', {
    name: form.name.value,
    question: form.question.value,
  });

  $('#questionForm')[0].className = 'container hidden';
  $('#lobbyView')[0].className = 'container';
  $('#readyButton')[0].className = '';
  $('#answerForm')[0].className = 'container hidden';
  $('#answerView')[0].className = 'container hidden';
  $('#questionForm')[0].className = 'container hidden';
  $('#scoreboardView')[0].className = 'container hidden';
  $('#scoreView')[0].className = 'container hidden';
  isReady = false;
  inGame = true;
}

// Form handler for answering other user's questions
function submitAnswers(event) {
  if(event)
    event.preventDefault();

  let form = event.target;
  let questions = [];
  for(let i = 0; i < form.numQuestions.value; i++) {
    questions.push({
      question: b64_to_utf8(form['question_' + i].value),
      answer: form['answer_' + i].value,
    });
  }

  socket.emit('answers', questions);
}

// Form handler for guessing which users correspond to answers
function submitGuess(event) {
  if(event)
    event.preventDefault();

  let form = event.target;
  let users = {};
  for(let i = 0; i < form.numUsers.value; i++) {
    users[form['id_' + i].value] = form['guess_' + i].value;
  }

  socket.emit('guess', users);
}

// Called when the ready button is pressed
function toggleReady(event, noEmit) {
  let button = $('#readyButton')[0];
  isReady = !isReady;
  button.innerHTML = isReady ? 'Not Ready' : 'Ready!';
  button.className = isReady ? 'not-ready' : 'ready';

  if(!noEmit)
    socket.emit('ready', isReady);
}

function reset(force, message) {
  if(!force && inGame)
    return;

  inGame = false;
  $('#lobbyView')[0].className = 'container hidden';
  $('#answerForm')[0].className = 'container hidden';
  $('#answerView')[0].className = 'container hidden';
  $('#scoreboardView')[0].className = 'container hidden';
  $('#questionForm')[0].className = 'container';
  $('#scoreView')[0].className = 'container hidden';
  $('#readyButton')[0].className = '';
  $('#questionInput')[0].value = '';
  toggleReady(0, 1);
  if(isReady)
    toggleReady(0, 1);

  if(message)
    alert(message);
}

window.addEventListener('load', () => {
  socket = io('/' + $.cookie('room'));
  reset(true);

  // Active game on the bottom
  socket.on('game-active', active => {
    $('#gameActive')[0].innerHTML = active ? 'Active' : 'Not Started';
    isGameActive = active;
  });

  // set the view to the default screen
  socket.on('reset', (force, message) => reset(force, message));

  socket.on('score', (correct, total) => {
    if(!inGame)
      return;

    $('#lobbyView')[0].className = 'container hidden';
    $('#answerForm')[0].className = 'container hidden';
    $('#answerView')[0].className = 'container hidden';
    $('#questionForm')[0].className = 'container hidden';
    $('#scoreboardView')[0].className = 'container';
    $('#scoreView')[0].className = 'container';

    $('#scoreCorrect')[0].innerHTML = correct;
    $('#scoreTotal')[0].innerHTML = total;
  });

  // Called when everyone is done answering questions
  // and players guess who answered what
  socket.on('answers', ({names, answers}) => {
    if(!inGame)
      return;
    
    $('#lobbyView')[0].className = 'container hidden';
    $('#answerForm')[0].className = 'container hidden';
    $('#scoreboardView')[0].className = 'container hidden';
    $('#questionForm')[0].className = 'container hidden';
    $('#scoreView')[0].className = 'container hidden';
    $('#answerView')[0].className = 'container';
    $('#numUsers')[0].value = answers.length;

    let list = $('#answerList')[0];
    while(list.hasChildNodes())
      list.removeChild(list.lastChild);

    answers.forEach(({id, answers}, i) => {
      let div = document.createElement('div');
      div.className = 'question';
      div.innerHTML = `
        <div class="user-field">
          <input type="hidden" name="id_${i}" value="${id}">
          <select name="guess_${i}">
            <option value="">Select a Name</option>
            ${names.map(({id, name}) => `
              <option value="${id}">${name}</option>
            `)}
          </select>
          <div class="answers">
            ${answers.map(({question, answer}) => `
              <div class="question-pair">
                <div class="question">${question}</div>
                <div class="answer">${answer}</div>
              </div>
            `).join('')}
          </div>
        </div>`;
      list.appendChild(div);
    })

  });

  // Called after the user submit answers to the questions
  socket.on('waiting', () => {
    if(!inGame)
      return;
    
    $('#lobbyView')[0].className = 'container';
    $('#readyButton')[0].className = 'hidden';
    $('#answerForm')[0].className = 'container hidden';
  });

  // Called when the after everyone readys up in the lobby
  // each player receives the questions shuffled
  socket.on('questions', questions => {
    if(!inGame)
      return;
    
    $('#questionForm')[0].className = 'container hidden';
    $('#scoreboardView')[0].className = 'container hidden';
    $('#lobbyView')[0].className = 'container';
    $('#readyButton')[0].className = 'hidden';
    $('#answerForm')[0].className = 'container';
    $('#numQuestions')[0].value = questions.length;

    let list = $('#questionList')[0];
    while(list.hasChildNodes())
      list.removeChild(list.lastChild);

    questions.forEach((question, i) => {
      let div = document.createElement('div');
      div.className = 'question';
      div.innerHTML = `
        <div class="input-container">
          <label for="answer_${i}">${question}</label>
          <input type="hidden" name="question_${i}" value="${utf8_to_b64(question)}">
          <input type="text" autocomplete="off" name="answer_${i}" id="answer_${i}" placeholder="Answer" required>
        </div>`;
      list.appendChild(div);
    });
  });

  // Called everytime ready status is updated
  socket.on('lobby', users => {
    let list = $('#userList')[0];

    while(list.hasChildNodes())
      list.removeChild(list.lastChild);

    users.forEach(({name, ready}) => {
      let div = document.createElement('div');
      div.className = 'lobby-user ' + (ready ? 'ready' : 'not-ready');
      div.innerHTML = `
        <div class="user-name">
          ${name}
        </div>
        <div class="user-ready">
          ${ready ? '&check;' : '&#x29D6;'}
        </div>`;
      list.appendChild(div);
    });
  });

  // Called everytime someone finishes answering
  socket.on('scoreboard', users => {
    let list = $('#scoreList')[0];

    while(list.hasChildNodes())
      list.removeChild(list.lastChild);

    users.forEach(({name, score}) => {
      let div = document.createElement('div');
      div.className = 'lobby-user ' + (score ? 'ready' : 'not-ready');
      div.innerHTML = `
        <div class="user-name">
          ${name}
        </div>
        <div class="user-ready">
          ${score ? score.join('/') : '&#x29D6;'}
        </div>`;
      list.appendChild(div);
    });
  });

});

window.addEventListener('unload', () => {
  if(socket && socket.readyState === WebSocket.OPEN) {
    socket.close();
  }
});
