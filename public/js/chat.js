// socket.io specific code
var socket = io.connect();

socket.on('connect', function () {
  // join this room
  if (room != '') {
    socket.emit('join room', room);
  }
  
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
	chatDiv.scrollTop(chatDiv[0].scrollHeight);
}

function clear () {
	$('#message').val('').focus();
};

// dom manipulation
$(function () {
	// setup classes in left nav sidebar
	var roomsNav = $('#classes');
	for (i in rooms) {
		if (i == 0) {
			roomsNav.append('<li class=\'active\'><a href=\'#\'>'+rooms[i]+'</a></li>');	
		} else {
			roomsNav.append('<li><a href=\'#\'>'+rooms[i]+'</a></li>');
		}
	}
	
	var chatDiv = $('#chat');
	$('#send-message').submit(function () {
		message(name, $('#message').val());
		socket.emit('message', $('#message').val());
		clear();
		chatDiv.scrollTop(chatDiv[0].scrollHeight);
		return false;
	});
	
	function clear () {
		$('#message').val('').focus();
	};
});
