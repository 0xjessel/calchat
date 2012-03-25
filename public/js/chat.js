// socket.io specific code
var socket = io.connect();
var chatDiv = $('#chat');
var current = rooms[0];
var unread = {};
for (var i = 0; i < rooms.length; i++) {
	unread[rooms[i]] = 0;
}

socket.on('connect', function () {
	// join all rooms
	for (var i = 0; i < rooms.length; i++) {
		if (rooms[i] != '') {
			socket.emit('join room', rooms[i]);
		}	
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

function message (to, from, msg) {
	if (to == current) {
		// incoming msg to the current room
		$('#lines').append($('<p>').append($('<b>').text(from), ': '+msg));
		chatDiv.scrollTop(chatDiv[0].scrollHeight);		
	} else {
		// incr badge
		unread[to]++;
		var badge = $('#'+to+' .badge');
		
		if (badge.length == 0) {
			$('#'+to).append('<span class="badge badge-error">'+unread[to]+'</span>');
		} else {
			badge.text(unread[to]);
		}
	}
}

function clear () {
	$('#message').val('').focus();
};

// dom manipulation
$(function () {
	// setup classes in left nav sidebar
	var roomsNav = $('#classes');
	for (var i = 0; i < rooms.length; i++) {
		if (i == 0) {
			roomsNav.append('<li class="active"><a href="#" id="'+rooms[i]+'">'+rooms[i]+'</a></li>');	
		} else {
			roomsNav.append('<li><a href="#" id="'+rooms[i]+'">'+rooms[i]+'</a></li>');
		}
	}
	
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
