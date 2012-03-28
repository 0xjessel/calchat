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
		socket.emit('set name', name, uid, function(set) {
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

var users = null;
socket.on('online', function(room, nicknames) {
	if (room == current) {
        users = nicknames;
        
        // for testing
        users['anonymous'] = 11111;
        users['user'] = 22222;
        users['student'] = 33333;
        
		// empty out sidebar, repopulate with all online people
		var onlineSidebar = $('#online');
		$('#online li:not(.nav-header)').remove();

		for (var name in nicknames) {
			onlineSidebar.append('<li>'+name+'</li>');
            // TODO: make link using id = nicknames[name]
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
			roomsNav.append('<li class="active"><a href="javascript:void(0)" id="'+rooms[i]+'">'+rooms[i]+'</a></li>');	
		} else {
			roomsNav.append('<li><a href="javascript:void(0)" id="'+rooms[i]+'">'+rooms[i]+'</a></li>');
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
    
    // Suggestions
    var suggesting = false;
    $('#message').keyup(function(e) {
        if (!suggesting) {
            // check for '@' to begin suggestions
            if (e.which == 50) {
                $('#user-suggestions').show();
                
                // populate suggestions
                for (user in users) {
                    $('#suggestion-list').append($('<li>').text(user));
                }
                
                suggesting = true;
            }
        } else {
            // filter suggestions
            var msg = $('#message').val();
            // get caret position
            var end = $('#message').get(0).selectionStart;
            // get position of '@'
            var start = msg.substring(0, end).lastIndexOf('@');
            
            // did user delete '@'?
            if (start == -1) {
                $('#user-suggestions').hide();
                suggesting = false;
                return;
            }
            
            // the text in between '@' and caret position
            var filter = msg.substring(start+1, end);
            
            // clear suggestions box to be repopulated
            $('#user-suggestions').hide();
            $('#suggestion-list').empty();
            
            for (user in users) {
                // filter text matches a user name
                if (user.toUpperCase().indexOf(filter.toUpperCase()) == 0) {
                    $('#user-suggestions').show();
                    // TODO: make much prettier
                    $('#suggestion-list').append('<li><a href="javascript:void(0)" id="user'+users[user]+'">'+user+'</a></li>');
                    $('#user'+users[user]).click(function(){
                        // get id of clicked suggestion
                        var id = users[$(this).text()];
                        // get text after the caret position
                        var after = msg.substring(end);
                        // make sure there is at least 1 space between replaced text and after text
                        if (after && after.length > 0 && after.charAt(0) == ' ') {
                            // we are adding a space later, so if there is already a space, remove it
                            after = after.substring(1);
                        }
                        
                        // turn the '@filter' into '#id ' and keep the before and after text the same
                        var transformedMsg = msg.substring(0, start) + '#' + id + ' ' + after;
                        
                        // calculate the new caret position
                        var caretPosition = transformedMsg.length - after.length;
                        
                        // hide suggestions box
                        $('#user-suggestions').hide();
                        suggesting = false;
                        
                        // set new value for input
                        $('#message').val(transformedMsg).focus().get(0).setSelectionRange(caretPosition,caretPosition);
                    });
                }
            }
        }
    });
});

window.onbeforeunload = function() {
	socket.emit('save chat', uid, current);
	socket.disconnect();
};
