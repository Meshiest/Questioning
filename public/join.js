function testLobby(event) {
  event.preventDefault();

  let form = event.target;
  form.className = 'form-loading';
  
  $.post(`/join/${form.id.value}`).then(msg => {
    location.href = msg.route;
  }, err => {
    $('#lobbyTitle').text('Invalid Lobby');
    form.className = 'form-error';
  });
}