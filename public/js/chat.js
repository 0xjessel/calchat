// socket.io specific code
var opts = {};
opts['sync disconnect on unload'] = false;
var socket = io.connect(null, opts);
var current = rooms[0];
var chatDiv;
var selfAnnounced = false;
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
	
	socket.emit('get chatlog', current, function (logs) {
		for (timestamp in logs) {
			// not showing timestamp for now
			var msg = linkify(logs[timestamp]);
			$('#lines').append($('<p>').append(msg));
		}

		// send fb name
		socket.emit('set name', name, function(set) {
			if(!set) {
				clear();
			}
		});
	});
});

socket.on('announcement', function (to, msg) {
	if (to == current) {
		$('#lines').append($('<p>').append($('<em>').text(msg)));
		if (!selfAnnounced) {
			// scroll chat to bottom after chatlog and this announcement 
			// only once (in the beginning)
			chatDiv.scrollTop(chatDiv[0].scrollHeight);	
			selfAnnounced = true;
		}
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
	msg = linkify(msg);
	if (to == current) {
		// incoming msg to the current room
		$('#lines').append($('<p>').append($('<b>').text(from), ': '+msg));
		scrollToBottom();
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

function scrollToBottom () {
	// scroll to bottom only if already scrolled to bottom
	if (chatDiv[0].scrollHeight - chatDiv.scrollTop() - 80 <= chatDiv.outerHeight()) {
		chatDiv.scrollTop(chatDiv[0].scrollHeight);	
	}
}

// dom manipulation
$(function () {
	chatDiv = $('#chat');
	
	// setup chats in left nav sidebar
	var roomsNav = $('#chats');
	for (var i = 0; i < rooms.length; i++) {
		if (i == 0) {
			roomsNav.append('<li class="active"><a href="javascript:" id="'+rooms[i]+'">'+rooms[i]+'</a></li>');	
		} else {
			roomsNav.append('<li><a href="#" id="'+rooms[i]+'">'+rooms[i]+'</a></li>');
		}
	}
	
	$('#chats a').click(function() {
		if ($(this).text() != current) {
			$('#lines').empty();
			$('#online li:not(.nav-header)').remove();
			$(this).find('.badge').remove();

			$('#chats .active').removeClass('active');
			$(this).parent().addClass('active');

			current = $(this).text();
			socket.emit('get chatlog', current, function (logs) {
				for (timestamp in logs) {
					// not showing timestamp for now
					var msg = linkify(logs[timestamp]);
					$('#lines').append($('<p>').append(msg));
				}
				chatDiv.scrollTop(chatDiv[0].scrollHeight);
			});
			
			socket.emit('get online', current);
		}
		return false;
	});
	
	$('#send-message').submit(function () {
		message(current, name, $('#message').val());
		socket.emit('message', current, $('#message').val());
		clear();
		scrollToBottom();
		return false;
	});
    
    $('#message').keyup(function(e) {
        // check for @
        if (e.which == 50) {
            console.log("@ pressed");
        }
        
    });
});

window.onbeforeunload = function() {
	socket.emit('save chat', uid, current);
	socket.disconnect();
};
