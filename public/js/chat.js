// socket.io specific code
var opts = {};
opts['sync disconnect on unload'] = false;
var socket = io.connect(null, opts);
var current = rooms[0];
var currentOnline = {};
var chatDiv;
var selfAnnounced = false;
var unread = {};
for (var i = 0; i < rooms.length; i++) {
	unread[rooms[i].id] = 0;
}
var History = window.History;

var SPECIAL_NONE		= 0;
var SPECIAL_FOUNDER		= 1;

function debug(msg) {
	console.log(msg);
}

socket.on('connect', function () {
	debug('connect');
	// join all rooms, set uid and nick, get chatlog
	var roomIds = [];
	for (var i = 0; i < rooms.length; i++) {
		roomIds.push(rooms[i].id);
	};
	socket.emit('initialize', roomIds, current.id, renderChatlogs);
});

socket.on('announcement', function (to, msg) {
	debug('announcement');
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
	debug('online');
	if (room == current.id) {
		// store the new nicknames object
		currentOnline = nicknames;

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

socket.on('reconnect', function () {
	debug('reconnect');
	$('#lines').empty();
	message({
		'from'	: 'System',
		'to'	: current.id,
		'text'	: 'Reconnected to the server',
	});
	$('.chat-header .loading').addClass('hidden');
});

socket.on('reconnecting', function () {
	debug('reconnecting');
	message({
		'from'	: 'System',
		'to'	: current.id,
		'text'	: 'Attempting to re-connect to the server',
	});
	$('.chat-header .loading').removeClass('hidden');
});

socket.on('error', function (e) {
	debug('Error: '+e);
	message({
		'from'	: 'System',
		'to'	: current.id,
		'text'	: e ? e : 'A unknown error occurred',
	});
});

socket.on('private chat', function(roomId, messageEntry, mapping) {
	alert('New private chat in room '+roomId+': '+messageEntry.text);
});

socket.on('message', message);
function message (entry, mapping) {
	debug('message');
	console.log(entry);
	if (entry.to == current.id) {
		// append incoming msg to the current room
		var element = renderChatMessage(entry, mapping);
		$('#lines').append(element);

		scrollToBottom();
	} else {
		// incr badge
		unread[entry.to]++;
		var id = entry.to.replace(':', '');
		var badge = $('#'+id+' .badge');

		if (badge.length == 0) {
			$('#'+id).append('<span class="badge badge-error">'+unread[entry.to]+'</span>');
		} else {
			badge.text(unread[entry.to]);
		}
	}
}

function renderChatroom(anchor) {
	debug('renderChatroom');
	current = anchor.data('room');

	$('.chat-title h2').text('Loading...');
	$('.chat-title h3').text('');

	$('#lines').empty();
	$('#online li:not(.nav-header)').remove();
	anchor.find('.badge').remove();
	
	$('.loading').removeClass('hidden');
	$('.actions').addClass('hidden');
	$('#chats .active').removeClass('active');
	anchor.parent().addClass('active');
	$('#chats .loading').addClass('hidden');
	
	$('#message').prop('disabled', true);

	socket.emit('get chatlog', current.id, renderChatlogs);
	socket.emit('get online', current.id);			
}

function renderChatlogs (logs, mapping, room) {
	debug('renderChatlogs');
	if (!logs) logs = {};
	if (!Object.keys(logs).length) {
		logs[new Date().getTime()] = {
			'from'	: 'System',
			'to'	: current.id,
			'text'	: 'First!! Say something to get this room started.',
		};
	}
	for (timestamp in logs) {
		// not showing timestamp for now

		var entry = logs[timestamp];

		var element = renderChatMessage(entry, mapping);
		$('#lines').append(element);
	}
	chatDiv.scrollTop(chatDiv[0].scrollHeight+50);
	
	$('#message').prop('disabled', false);
	$('#message').data('mentions', {});

	$('#login').attr('href', '/authenticate/'+room.url);
	var pretty = room.pretty;
	var title = room.title;
	if (room.type == 'private') {
		var me = pretty[0] == name;
		pretty = room.pretty.split(':');
		pretty = me ? pretty[1] : pretty[0];
		title = room.title.split(':');
		title = me ? title[1] : title[0];
	}
	$('.chat-title h2').text(pretty);
	$('.chat-title h3').text(title);
	
	History.pushState(null, null, '/chat/'+room.url);			
	
	var newTitle = pretty;
	document.title = newTitle;
	$("meta[property=og\\:title]").attr("content", newTitle);

	$('#archives').attr('href', '/chat/'+room.url+'/archives');
	$('#share').attr('href', 'https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(document.URL));

	$('.chat-header .loading').addClass('hidden');
	$('.actions').removeClass('hidden');

	clear();
}

function renderChatMessage(entry, mapping) {
	var fromUid = entry.from;
	var toRoom = entry.to;
	var msg = entry.text;
	var mentions = entry.mentions;
	var mid = entry.id;

	msg = linkify(msg);
	// msg = mentionize(msg, mapping);
	
	var from = fromUid;
	var gsi = false;
	var special = SPECIAL_NONE;
	if (mapping && fromUid in mapping) {
		from = mapping[fromUid].name;
		special = mapping[fromUid].special;
		var gsirooms = mapping[fromUid].gsirooms.split(',');
		for (var i = 0; i < gsirooms.length; i++) {
			if (gsirooms[i] == toRoom) {
				gsi = true;
				break;
			}
		};
		special = mapping[fromUid].special;
	}
	var label = $('<span>').addClass('label').hide();
	if (special == SPECIAL_FOUNDER) {
		label.addClass('label-inverse').text('FOUNDER').show();
	} else if (gsi) {
		label.addClass('label-warning').text('GSI').show();
	}
	
	if (from == 'System') {
		return $('<p class="system-message">').append(msg);
	} else {
		var mentionsElement = $('<div>').addClass('message-mentions').attr('id', 'mentions'+mid);

		var totalWidth = 0;
		for (var i = 0; i < mentions.length; i++) {
			var id = mentions[i];

			var element = $('<span>').addClass('mention').attr('id', id).append(
				getUserLink(id).addClass('mention').text(' @'+mapping[id].name+' '));

			totalWidth += $('#'+id).outerWidth();
			if (i == 0) {
				element.addClass('first');
			}

			mentionsElement.append(element);
		}


		var element = $('<p>').addClass('message').append(
			$('<span>').addClass('pic').append($('<img>').addClass('avatar-msg').attr('src', "http://graph.facebook.com/"+fromUid+"/picture").width(18).height(18)),
			$('<span>').addClass('from').append(getUserLink(fromUid).addClass('from').append(from), label, ': '),
			$('<span>').addClass('text').append(msg).attr('id', 'text'+mid).hover(
				function() {
					$('#mentions'+mid).stop().fadeTo(400 ,0, function(){$(this).hide()});
				}, function() {
					$('#mentions'+mid).show().stop().fadeTo(300, 1);
				}),
			$('<span>').addClass('mentions').append(mentionsElement));

		return element;
	}
}

function getUserLink(id) {
	if (uid == id) {
		return $('<a>');
	}
	return $('<a>').attr('href', '/chat/'+Math.min(uid, id)+':'+Math.max(uid, id));
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

// dom manipulation
$(document).ready(function () {
	chatDiv = $('#chat');

	// setup chats in left nav sidebar
	var roomsNav = $('#chats');
	for (var i = 0; i < rooms.length; i++) {
		var room = rooms[i];
		var pretty = room.pretty;
		var id = room.id;
		var element = $('<li>');
		if (i == 0) {
			element.addClass('active');
		}
		if (room.type == 'private') {
			pretty = pretty.split(':');
			pretty = (name == pretty[0]) ? pretty[1] : pretty[0];
			id = id.replace(':', '');
		}

		element.append($('<a>')
			.attr('href', 'javascript:void(0)')
			.attr('id', id)
			.data('room', room)
			.append(pretty));
		roomsNav.append(element);
	}
	
	$('#chats .loading').addClass('hidden');

	$('#chats a').click(function () {
		if ($(this).data('room') != current) {
			renderChatroom($(this));	
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
					var name = mapping[id].name;
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
		
		var next = $('#chats a:first');
		$('#message').prop('disabled', true);

		socket.emit('leave room', current.id, function() {
			if (next.length) {
				renderChatroom(next);
			} else {
				window.location.href = '/dashboard';
			}
		});
	});
	
	$('a[rel=tooltip]').tooltip();
});

var init = true;
window.addEventListener('popstate', function(e) {
	if (init) { init = false; return;}
	if (uid != null && name != null) {
		window.location.href = '/dashboard';
	} else {
		window.location.href = '/';
	}
});