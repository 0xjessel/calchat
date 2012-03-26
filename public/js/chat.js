// socket.io specific code
var socket = io.connect();
var current = rooms[0];
var chatDiv;
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
	socket.emit('set name', name, function(set) {
		if(!set) {
			clear();
		}
	});
	
	socket.emit('get chatlog', current);
});

socket.on('chatlog', function (logs) {
	for (timestamp in logs) {
		// not showing timestamp for now
		$('#lines').append($('<p>').append(logs[timestamp]));
	}
	chatDiv.scrollTop(chatDiv[0].scrollHeight);	
});

socket.on('announcement', function (to, msg) {
	if (to == current) {
		$('#lines').append($('<p>').append($('<em>').text(msg)));		
	}
});

socket.on('nicknames', function (to, nicknames) {
	if (to == current) {
		for (var i in nicknames) {
			if (!i == '') {
				$('#online').append('<li>'+nicknames[i]+'</li>');
			}
		}
	}
});

socket.on('message', message);

socket.on('reconnect', function () {
	$('#lines').empty();
	message(current, 'System', 'Reconnected to the server');
});

socket.on('reconnecting', function () {
	message(current, 'System', 'Attempting to re-connect to the server');
});

socket.on('error', function (e) {
	message(current, 'System', e ? e : 'A unknown error occurred');
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
	chatDiv = $('#chat');
	
	// setup classes in left nav sidebar
	var roomsNav = $('#classes');
	for (var i = 0; i < rooms.length; i++) {
		if (i == 0) {
			roomsNav.append('<li class="active"><a href="#" id="'+rooms[i]+'">'+rooms[i]+'</a></li>');	
		} else {
			roomsNav.append('<li><a href="#" id="'+rooms[i]+'">'+rooms[i]+'</a></li>');
		}
	}
	
	$('#classes a').click(function() {
		$('#lines').empty();
		
		$('#classes .active').removeClass('active');
		$(this).parent().addClass('active');
		
		current = $(this).text();
		socket.emit('get chatlog', current);
	});
	
	$('#send-message').submit(function () {
		message(current, name, $('#message').val());
		socket.emit('message', current, $('#message').val());
		clear();
		chatDiv.scrollTop(chatDiv[0].scrollHeight);
		return false;
	});
});
