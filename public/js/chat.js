// socket.io specific code
var opts = {};
opts['sync disconnect on unload'] = false;
var socket = io.connect(null, opts);
var current = rooms[0];
var chatDiv;
var selfAnnounced = false;
var unread = {};
for (var i = 0; i < rooms.length; i++) {
	unread[rooms[i].id] = 0;
}
var History = window.History;

socket.on('connect', function () {
	// join all rooms, set uid and nick, get chatlog
	var roomIds = [];
	for (var i = 0; i < rooms.length; i++) {
		roomIds.push(rooms[i].id);
	};
	socket.emit('initialize', uid, name, roomIds, current.id, function(logs, mentions, title) {
		renderChatlogs(logs, mentions, title);
	});
});

socket.on('announcement', function (to, msg) {
	if (to == current.id) {
		message({
			'from'	: 'System',
			'to'	: current.id,
			'text'	: msg,
		});
		
		scrollToBottom();
	}
});

socket.on('online', function(room, nicknames) {
	if (room == current.id) {        
		// empty out sidebar, repopulate with online people
		var onlineSidebar = $('#online');
		$('#online li:not(.nav-header)').remove();

		for (var id in nicknames) {
			var pic = 'https://graph.facebook.com/'+id+'/picture?type=square';
			onlineSidebar.append($('<li>').append(getUserLink(id).append(
				$('<img class="avatar" width="30px" height="30px" src='+pic+'>'),
				nicknames[id])));
		}
		$('#online .loading').addClass('hidden');
	}
});

socket.on('message', message);

socket.on('reconnect', function () {
	$('#lines').empty();
	message({
		'from'	: 'System',
		'to'	: current.id,
		'text'	: 'Reconnected to the server',
	});
	$('.chat-header .loading').addClass('hidden');
});

socket.on('reconnecting', function () {
	message({
		'from'	: 'System',
		'to'	: current.id,
		'text'	: 'Attempting to re-connect to the server',
	});
	$('.chat-header .loading').removeClass('hidden');
});

socket.on('error', function (e) {
	message({
		'from'	: 'System',
		'to'	: current.id,
		'text'	: e ? e : 'A unknown error occurred',
	});
});

function message (entry, mapping) {
	if (entry.to == current.id) {
		// append incoming msg to the current room
		var element = renderChatMessage(entry, mapping);
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

function renderChatlogs (logs, mapping, title) {
	for (timestamp in logs) {
		// not showing timestamp for now

		var entry = logs[timestamp];
		
		var text = entry.text;

		var element = renderChatMessage(entry, mapping);
		$('#lines').append(element);
	}
	chatDiv.scrollTop(chatDiv[0].scrollHeight+50);
	
	$('.chat-header .loading').addClass('hidden');
	$('#message').prop('disabled', false);
	$('#message').data('mentions', {});

	$('#login').attr('href', '/authenticate/'+strip(title));

	$('.chat-title h2').text(title);
	History.pushState(null, null, strip(title));

	$('#archives').attr('href', '/chat/'+strip(title)+'/archives');
	$('#share').attr('href', 'https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(document.URL));

	clear();
}

function renderChatMessage(entry, mapping) {
	var fromUid = entry.from;
	var msg = entry.text;
	var mentions = entry.mentions;
	var id = entry.id;

	console.log(mentions);

	msg = linkify(msg);
	// msg = mentionize(msg, mapping);
	
	var from = fromUid;
	if (mapping && fromUid in mapping) {
		from = mapping[fromUid];
	}
	
	if (from == 'System') {
		return $('<p class="system-message">').append(msg);
	} else {
		var mentionsElement = $('<div>').addClass('message-mentions').attr('id', 'mentions'+id);

		var totalWidth = 0;
		for (var i = 0; i < mentions.length; i++) {
			var id = mentions[i];

			var element = $('<span>').addClass('mention').attr('id', id).append(getUserLink(id).addClass('mention').text('@'+mapping[id]+' '));

			totalWidth += $('#'+id).outerWidth();
			if (i == 0) {
				element.addClass('first');
			}

			mentionsElement.append(element);
		}


		var element = $('<p>').addClass('message').append(
			$('<span>').addClass('from').append(getUserLink(fromUid).addClass('from').append(from), ': '),
			$('<span>').addClass('text').append(msg).attr('id', 'text'+id),
			$('<span>').addClass('mentions').append(mentionsElement));

		return element;
	}
}

function getUserLink(id) {
	return $('<a>').attr('target', '_blank').attr('href', 'http://www.facebook.com/'+id);
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

function getUsers(room, filter, limit, callback) {
	socket.emit('get users', current.id, filter, limit, callback);
}

function strip(string) {
	return string.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
}

// dom manipulation
$(document).ready(function () {
	chatDiv = $('#chat');
	$('.chat-title h2').text('Loading...');

	// setup chats in left nav sidebar
	var roomsNav = $('#chats');
	for (var i = 0; i < rooms.length; i++) {
		var room = rooms[i];
		var element = $('<li>');
		if (i == 0) {
			element.addClass('active');
		}

		element.append($('<a>').attr('href', 'javascript:void(0)').attr('id', room.id).data('room', room).append(room.title));
		roomsNav.append(element);
	}
	
	$('#chats .loading').addClass('hidden');

	$('#chats a').click(function () {
		if ($(this).data('room') != current) {
			current = $(this).data('room');
			
			$('#lines').empty();
			$('#online li:not(.nav-header)').remove();
			$(this).find('.badge').remove();
			
			$('.loading:not(#chats .loading)').removeClass('hidden');
			$('#chats .active').removeClass('active');
			$(this).parent().addClass('active');

			
			$('#message').prop('disabled', true);

			socket.emit('get chatlog', current.id, renderChatlogs);
			socket.emit('get online', current.id);			
		}
		return false;
	});

	$('#send-message').submit(function () {
		// TODO: since we are sending the message to the server and waiting for the reply
		//       we should display some kind of 'Sending...' text
		if ($('#message').val()) {
			socket.emit('message', current.id, $('#message').val(), Object.keys($('#message').data('mentions')));
			$('#message').data('mentions', {});
			clear();
			scrollToBottom();
		}
		return false;
	});
	
	var limit = 5;
	$('#message').typeahead({
		source: function(typeahead, query) {
			var msg = this.query;
			// get caret position
			var end = $('#message').get(0).selectionStart;
			$('#message').data('selectionStart', end);
			// get position of '@'
			var start = msg.substring(0, end).lastIndexOf('@');

			$('#message').data('');

			// quit if no '@'
			if (start == -1) {
				typeahead.process([]);
				return;
			}

			// the text in between '@' and caret position
			var filter = msg.substring(start+1, end).toUpperCase();

			if (filter.indexOf($('#message').data('filter-empty')) == 0) {
				typeahead.process([]);
				return;
			}

			getUsers(current.id, filter, limit, function(mapping, online, offline) {
				online.sort();
				offline.sort();
				var ids = online.concat(offline);

				if (!ids.length) {
					$('#message').data('filter-empty', filter);
				} else {
					$('#message').data('filter-empty', null);
				}
					
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
		
		items: limit,
		
		matcher: function(item) {
			return true;
		},
		
		onselect: function(item) {			
			var msg = this.query;
			// get caret position
			// for some reason $('#message').get(0).selectionStart becomes all screwed up
			var end = $('#message').data('selectionStart');
			// get position of '@'
			var start = msg.substring(0, end).lastIndexOf('@');
			
			var replacement = item.name;
			
			var transformedMsg = msg.substring(0, start) + replacement + msg.substring(end);

			// calculate the new caret position
			var caretPosition = start + replacement.length;

			// set new value for input
			$('#message')
			.val(transformedMsg)
			.focus()
			.get(0).setSelectionRange(caretPosition,caretPosition);

			// use associative array for de-duplication
			$('#message').data('mentions')[item.id] = null;
		}
	});

	$('#close').click(function () {
		// remove chatroom from sidebar
		// load next chatroom in line
		// if no chatroom redirect to dashboard with params

		$('#lines').empty();
		$('#online li:not(.nav-header)').remove();
		$('#chats .active').remove();
		var left = current.id;
		
		var next = $('#chats a:first')
		if (next.length) {
			next.parent().addClass('active');
			current = next.data('room');
			$('.chat-title h2').text('Loading...');
		}
		
		$('#message').prop('disabled', true);

		socket.emit('leave room', left, function() {
			if (next.length) {
				socket.emit('get chatlog', current.id, renderChatlogs);
				socket.emit('get online', current.id);
			}
		});
		
		if (!next.length) {
			// redirect
			window.location.href = '/dashboard';
		}
	});
	
	$('a[rel=tooltip]').tooltip();
});
