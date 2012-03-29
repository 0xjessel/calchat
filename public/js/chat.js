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
    
	socket.emit('get chatlog', current, function (logs, mentions) {
		renderChatlogs(logs, mentions);

		// send fb name
		socket.emit('set name', uid, name, function(set) {
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

socket.on('online', function(room, nicknames) {
	if (room == current) {        
		// empty out sidebar, repopulate with all online people
		var onlineSidebar = $('#online');
		$('#online li:not(.nav-header)').remove();

		for (var id in nicknames) {
			onlineSidebar.append('<li>'+nicknames[id]+'</li>');
            // TODO: make link using id
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

function message (to, from, msg, mentions) {
	msg = linkify(msg);
    msg = mentionize(msg, mentions);
    
	if (to == current) {
		// incoming msg to the current room
		$('#lines').append($('<p>').append($('<strong>').text(from), ': '+msg));
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

function mentionize(msg, mentions) {
    for (id in mentions) {
        var text = '@'+mentions[id];
        msg = msg.replace('#'+id+'$', '<a href="javascript:void(0)">'+text+'</a>');
        // TODO: make the link actually go somewhere
    }
    return msg;
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

var renderChatlogs = function (logs, mentions) {
	for (timestamp in logs) {
		// not showing timestamp for now
		var entry = linkify(logs[timestamp])
        entry = mentionize(entry, mentions);
		var i = entry.indexOf(":");
		entry = [entry.slice(0,i), entry.slice(i+1)];
		var from = entry[0];
		var msg = entry[1];
		$('#lines').append($('<p>').append($('<strong>').text(from), ':'+ msg));
	}
	chatDiv.scrollTop(chatDiv[0].scrollHeight);
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

	$('#chats a').click(function () {
		if ($(this).text() != current) {
			$('#lines').empty();
			$('#online li:not(.nav-header)').remove();
			$(this).find('.badge').remove();

			$('#chats .active').removeClass('active');
			$(this).parent().addClass('active');

			current = $(this).text();
            
			socket.emit('get chatlog', current, renderChatlogs);
			socket.emit('get online', current);
		}
		return false;
	});

	$('#send-message').submit(function () {
        // TODO: since we are sending the message to the server and waiting for the reply
        //       we should display some kind of 'Sending…' text
        
		socket.emit('message', current, $('#message').val());
		clear();
		scrollToBottom();
		return false;
	});
    
    // Suggestions
    var suggesting = false;
    $('#message').keypress(function(e) {
        if (!suggesting) {
            // check for '@' to begin suggestions
            if (e.which == '@'.charCodeAt(0)) {                
                suggesting = true;
            }
        }
    });
    
    // upon keyup, the val() would have already been updated
    $('#message').keyup(function(e) {
        // ignore if input has not been changed
        if ($(this).data('prev') == $(this).val()) {
            return;
        }
        $(this).data('prev', $(this).val());
        
        if (suggesting) {
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
            $('#suggestion-list').empty();
            $('#user-suggestions').show();
            // TODO: show spinning 'Loading…' icon
            
            socket.emit('get users', current, function(users){                
                for (id in users) {
                    var user = users[id];
                    // filter text matches a user name
                    if (user.toUpperCase().indexOf(filter.toUpperCase()) == 0) {
                        // TODO: make much prettier
                        $('#suggestion-list').append('<li><a href="javascript:void(0)" id="user'+id+'">'+user+'</a></li>');
                        $('#user'+id).data('id', id);
                        $('#user'+id).click(function(){
                            // get id of clicked suggestion
                            var id = $(this).data('id');
                            // get text after the caret position
                            var after = msg.substring(end);
                            // make sure there is at least 1 space between replaced text and after text
                            if (after && after.length > 0 && after.charAt(0) == ' ') {
                                // we are adding a space later, so if there is already a space, remove it
                                after = after.substring(1);
                            }
                            
                            // turn the '@filter' into '#id ' and keep the before and after text the same
                            var transformedMsg = msg.substring(0, start) + '#' + id + '$ ' + after;
                            
                            // calculate the new caret position
                            var caretPosition = transformedMsg.length - after.length;
                            
                            // hide suggestions box
                            $('#user-suggestions').hide();
                            suggesting = false;
                            
                            // set new value for input
                            $('#message')
                                .val(transformedMsg)
                                .focus()
                                .get(0).setSelectionRange(caretPosition,caretPosition);
                        });
                    }
                }
            });
        }
    });

	$('.close').click(function () {
		// remove chatroom from sidebar
		// load next chatroom in line
		// if no chatroom redirect to dashboard with params
		socket.emit('leave room', current);
		
		$('#lines').empty();
		$('#online li:not(.nav-header)').remove();
		$('#chats .active').remove();

		var next = $('#chats a:first')
		if (next.length) {
			next.parent().addClass('active');
			current = next.text();
			socket.emit('get chatlog', current, renderChatlogs);
			socket.emit('get online', current);
		} else {
			// redirect
			window.location.href = '/dashboard';
		}
		
	})
});

window.onbeforeunload = function () {
	socket.emit('save chat', current);
	socket.disconnect();
};
