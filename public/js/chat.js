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
	// join all rooms, set uid and nick, get chatlog
	socket.emit('initialize', uid, name, rooms, current, function(logs, mentions) {
		renderChatlogs(logs, mentions);
	});
});

socket.on('announcement', function (to, msg) {
	if (to == current) {
		message(current, 'System', msg);
		
		scrollToBottom();
	}
});

socket.on('online', function(room, nicknames) {
	if (room == current) {        
		// empty out sidebar, repopulate with online people
		var onlineSidebar = $('#online');
		$('#online li:not(.nav-header)').remove();

		for (var id in nicknames) {
			var pic = 'https://graph.facebook.com/'+id+'/picture?type=square';
			onlineSidebar.append('<li><a '+ getUserLinkAttributes(id) +'><img class="avatar" width="30px" height="30px" src='+pic+'>'+nicknames[id]+'</a></li>');
		}
		$('#online .loading').addClass('hidden');
	}
});

socket.on('message', message);

socket.on('reconnect', function () {
	$('#lines').empty();
	message(current, 'System', 'Reconnected to the server');
	// $('#message').prop('disabled', false);
	$('.chat-header .loading').addClass('hidden');
});

socket.on('reconnecting', function () {
	message(current, 'System', 'Attempting to re-connect to the server');
	// $('#message').prop('disabled', true);
	$('.chat-header .loading').removeClass('hidden');
});

socket.on('error', function (e) {
	message(current, 'System', e ? e : 'A unknown error occurred');
});

function message (to, from, msg, mentions) {    
	if (to == current) {
		// append incoming msg to the current room
		var element = renderChatMessage(from, msg, mentions);
		$('#lines').append(element);

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

function renderChatlogs (logs, mentions) {
	for (timestamp in logs) {
		// not showing timestamp for now

		var entry = logs[timestamp];
		
		var from = entry['from'];
		var text = entry['text'];

		var element = renderChatMessage(from, text, mentions);
		$('#lines').append(element);
	}
	chatDiv.scrollTop(chatDiv[0].scrollHeight+50);
	
	$('#message').prop('disabled', false);
	$('.chat-header .loading').addClass('hidden');
	clear();
}

function renderChatMessage(fromUid, msg, mentions) {
	msg = linkify(msg);
	msg = mentionize(msg, mentions);
	
	var from = fromUid;
	if (mentions && fromUid in mentions) {
		from = mentions[fromUid];
	}
	
	if (from == 'System') {
		return $('<p class="system-message">').append(msg);
	} else {
		var fromElement = $('<span class="from">').append($('<a '+ getUserLinkAttributes(fromUid) +' class="from">').append(from), ': ');
		var msgElement = $('<span class="text">').append(msg);

		var element = $('<p class="message">').append(fromElement, msgElement);
		return element;
	}
}

function mentionize(msg, mentions) {
	for (id in mentions) {
		var text = '@'+mentions[id];
		msg = msg.replace('#'+id+'$', '<a '+ getUserLinkAttributes(id) +' class="mention">'+text+'</a>');
		// TODO: make the link actually do something
	}
	return msg;
}

function getUserLinkAttributes(id) {
	return 'target="_blank" href="http://www.facebook.com/'+ id +'" ';
}

function clear () {
	$('#message').val('').focus();
};

function scrollToBottom () {
	// uset setTimeout to give layout time to append
	setTimeout(function() {
		// scroll to bottom only if already scrolled to bottom
		if (chatDiv[0].scrollHeight - chatDiv.scrollTop() - 80 <= chatDiv.outerHeight()) {
			chatDiv.scrollTop(chatDiv[0].scrollHeight);	
		}
	}, 100);
}

function getUsers(room, callback) {
	socket.emit('get users', current, callback);
}

// dom manipulation
$(document).ready(function () {
	$('.chat-title h2').text(current);
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
	
	$('#chats .loading').addClass('hidden');

	$('#chats a').click(function () {
		if ($(this).text() != current) {
			$('#lines').empty();
			$('#online li:not(.nav-header)').remove();
			$(this).find('.badge').remove();

			$('#chats .active').removeClass('active');
			$(this).parent().addClass('active');

			current = $(this).text();
			$('.chat-title h2').text(current);
			
			$('#message').prop('disabled', true);

			socket.emit('get chatlog', current, renderChatlogs);
			socket.emit('get online', current);
		}
		$('.loading:not(#chats .loading)').removeClass('hidden');
		return false;
	});

	$('#send-message').submit(function () {
		// TODO: since we are sending the message to the server and waiting for the reply
		//       we should display some kind of 'Sending…' text
		if ($('#message').val()) {
			socket.emit('message', current, $('#message').val());
			clear();
			scrollToBottom();
		}
		return false;
	});
	
	$('#message').typeahead({
		source: function(typeahead, query) {
			var msg = this.query;
			// get caret position
			var end = $('#message').get(0).selectionStart;
			$('#message').data('selectionStart', end);
			// get position of '@'
			var start = msg.substring(0, end).lastIndexOf('@');

			// quit if no '@'
			if (start == -1) {
				typeahead.process([]);
				return;
			}

			getUsers(current, function(mapping, online, offline) {
				online.sort();
				offline.sort();
				var ids = online.concat(offline);
					
				var users = [];
					
				for (var i = 0; i < ids.length; i++) {
					var id = ids[i];
					var name = mapping[id];
					var pic = 'https://graph.facebook.com/'+id+'/picture?type=square';
					var html = $('<div>').append($('<img class="avatar" width="30px" height="30px" src='+pic+'>')).append(name);
					
					users.push({
						id:		id,
						value:	html.html(),
						name:	name,
					});
				}
				
				typeahead.process(users);
			});
		},
		
		items: 5,
		
		matcher: function(item) {
			var msg = this.query;
			// get caret position
			var end = $('#message').get(0).selectionStart;
			$('#message').data('selectionStart', end);
			// get position of '@'
			var start = msg.substring(0, end).lastIndexOf('@');

			// did user delete '@'?
			if (start == -1) {
				return false;
			}

			// the text in between '@' and caret position
			var filter = msg.substring(start+1, end).toUpperCase();
			
			// remove html stuff
			item = item.substring(item.lastIndexOf('>') + 1).toUpperCase();
			
			// is what the user entered the start of this item?
			return item.indexOf(filter) == 0;
		},
		
		onselect: function(item) {			
			var msg = this.query;
			// get caret position
			// for some reason $('#message').get(0).selectionStart becomes all screwed up
			var end = $('#message').data('selectionStart');
			// get position of '@'
			var start = msg.substring(0, end).lastIndexOf('@');
			
			var replacement = '#'+item.id+'$';
			
			var transformedMsg = msg.substring(0, start) + replacement + msg.substring(end);

			// calculate the new caret position
			var caretPosition = start + replacement.length;

			// set new value for input
			$('#message')
			.val(transformedMsg)
			.focus()
			.get(0).setSelectionRange(caretPosition,caretPosition);
		}
	});

	$('#archives').attr('href', '/chat/'+current+'/archives');

	$('#close').click(function () {
		// remove chatroom from sidebar
		// load next chatroom in line
		// if no chatroom redirect to dashboard with params

		$('#lines').empty();
		$('#online li:not(.nav-header)').remove();
		$('#chats .active').remove();
		var left = current;
		
		var next = $('#chats a:first')
		if (next.length) {
			next.parent().addClass('active');
			current = next.text();
			$('.chat-title h2').text('Loading...');
		}
		
		$('#message').prop('disabled', true);

		socket.emit('leave room', left, function() {
			if (next.length) {
				socket.emit('get chatlog', current, renderChatlogs);
				socket.emit('get online', current);
				$('.chat-title h2').text(current);
			}
		});
		
		if (!next.length) {
			// redirect
			window.location.href = '/dashboard';
		}
	});
	
	$('a[rel=tooltip]').tooltip();
});
