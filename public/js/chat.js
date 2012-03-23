// socket.io specific code
var socket = io.connect();

socket.on('connect', function () {
  // join this room
  socket.emit('join room', '#{room}');
             
  // send fb name
  socket.emit('nickname', name, function(set) {
    if(!set) {
      clear();
    }
  });
});

socket.on('announcement', function (msg) {
  $('#lines').append($('<p>').append($('<em>').text(msg)));
});

socket.on('nicknames', function (nicknames) {
  for (var i in nicknames) {
    if (!i == '') { 
      $('#online').append('<li>'+nicknames[i]+'</li>');
    }
  }
});

socket.on('message', message);

socket.on('reconnect', function () {
  $('#lines').remove();
  message('System', 'Reconnected to the server');
});

socket.on('reconnecting', function () {
  message('System', 'Attempting to re-connect to the server');
});

socket.on('error', function (e) {
  message('System', e ? e : 'A unknown error occurred');
});

function message (from, msg) {
  $('#lines').append($('<p>').append($('<b>').text(from), ': '+msg));
}

function clear () {
  $('#message').val('').focus();
};

// dom manipulation
$(function () {
  $('#send-message').submit(function () {
    message(name, $('#message').val());
    socket.emit('message', $('#message').val());
    clear();
    $('#lines').get(0).scrollTop = 10000000;
    return false;
  });

  function clear () {
    $('#message').val('').focus();
  };
});
