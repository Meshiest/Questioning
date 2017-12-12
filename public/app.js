let socket;
let isReady = false, inGame = false;
const $ = document.querySelector.bind(document);

// Form handler for initial question and name form
function submitInit(event) {
  if(event)
    event.preventDefault();

  let form = event.target;

  socket.emit('init', {
    name: form.name.value,
    question: form.question.value,
  });

  $('#questionForm').className = 'container hidden';
  $('#lobbyView').className = 'container';
  $('#readyButton').className = '';
  $('#answerForm').className = 'container hidden';
  $('#answerView').className = 'container hidden';
  $('#questionForm').className = 'container hidden';
  $('#scoreboardView').className = 'container hidden';
  $('#scoreView').className = 'container hidden';
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
      question: atob(form['question_' + i].value),
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
  let button = $('#readyButton');
  isReady = !isReady;
  button.innerHTML = isReady ? 'Not Ready' : 'Ready!';
  button.className = isReady ? 'not-ready' : 'ready';

  if(!noEmit)
    socket.emit('ready', isReady);
}

function reset() {
  $('#lobbyView').className = 'container hidden';
  $('#answerForm').className = 'container hidden';
  $('#answerView').className = 'container hidden';
  $('#scoreboardView').className = 'container hidden';
  $('#questionForm').className = 'container';
  $('#scoreView').className = 'container hidden';
  $('#readyButton').className = '';
  $('#questionInput').value = '';
  inGame = false;
  toggleReady(0, 1);
  if(isReady)
    toggleReady(0, 1);
}

window.addEventListener('load', () => {
  socket = io();

  // Online counter on the bottom
  socket.on('user-count', count => {
    $('#onlineCount').innerHTML = count;
  });

  // set the view to the default screen
  socket.on('reset', reset);

  socket.on('score', (correct, total) => {
    if(!inGame)
      return;

    $('#lobbyView').className = 'container hidden';
    $('#answerForm').className = 'container hidden';
    $('#answerView').className = 'container hidden';
    $('#questionForm').className = 'container hidden';
    $('#scoreboardView').className = 'container';
    $('#scoreView').className = 'container';

    $('#scoreCorrect').innerHTML = correct;
    $('#scoreTotal').innerHTML = total;
  });

  // Called when everyone is done answering questions
  // and players guess who answered what
  socket.on('answers', ({names, answers}) => {
    if(!inGame)
      return;
    
    $('#lobbyView').className = 'container hidden';
    $('#answerForm').className = 'container hidden';
    $('#scoreboardView').className = 'container hidden';
    $('#questionForm').className = 'container hidden';
    $('#answerView').className = 'container';
    $('#numUsers').value = answers.length;

    let list = $('#answerList');
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
    
    $('#lobbyView').className = 'container';
    $('#readyButton').className = 'hidden';
    $('#answerForm').className = 'container hidden';
  });

  // Called when the after everyone readys up in the lobby
  // each player receives the questions shuffled
  socket.on('questions', questions => {
    if(!inGame)
      return;
    
    $('#questionForm').className = 'container hidden';
    $('#scoreboardView').className = 'container hidden';
    $('#lobbyView').className = 'container';
    $('#readyButton').className = 'hidden';
    $('#answerForm').className = 'container';
    $('#numQuestions').value = questions.length;

    let list = $('#questionList');
    while(list.hasChildNodes())
      list.removeChild(list.lastChild);

    questions.forEach((question, i) => {
      let div = document.createElement('div');
      div.className = 'question';
      div.innerHTML = `
        <div class="input-container">
          <label for="answer_${i}">${question}</label>
          <input type="hidden" name="question_${i}" value="${btoa(question)}">
          <input type="text" autocomplete="off" name="answer_${i}" id="answer_${i}" placeholder="Answer" required>
        </div>`;
      list.appendChild(div);
    });
  });

  // Called everytime ready status is updated
  socket.on('lobby', users => {
    let list = $('#userList');

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
    let list = $('#scoreList');

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