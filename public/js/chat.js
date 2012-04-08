// socket.io specific code
var opts = {};
opts['sync disconnect on unload'] = false;
var socket = io.connect(null, opts);
var current = rooms[0];
var currentOnline = {};
var chatDiv;
var selfAnnounced = false;
var unread = {};
var privateMsgs = [];
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
	for (var i = 0; i < rooms.length; i++) {
		if (roomId == rooms[i].id) {
			return;
		}
	}

	if (privateMsgs.indexOf(messageEntry.from) != -1) {
		var msg = $('.private-msg');
		if (msg.length) {
			msg.text(messageEntry.text);
		}
		return;
	}

	privateMsgs[privateMsgs.length] = messageEntry.from;
	
	notify(0,
		'New Private Chat from '+mapping[messageEntry.from].name+'!',
		messageEntry.text,
		'/chat/'+roomId,
		'Go to Private Chat');
});

socket.on('kick', function(from, by, msg) {
	$('#close').click();
	notify(1,
		'You are temporarily kicked from '+from.pretty,
		by.name+': '+msg,
		'/chat/'+from.id,
		'Take me back I\'ve learned my lesson');
});

socket.on('warn', function(from, by, msg) {
	notify(2,
		'You are temporarily banned from '+from.pretty,
		by.name+': '+msg);
});

socket.on('ban', function(from, by, msg) {
	notify(3,
		'You are permanently banned from '+from.pretty,
		by.name+': '+msg);
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

    $('#fb-link').remove();
	$('#lines').empty();
	$('#online li:not(.nav-header)').remove();
	anchor.find('.badge').remove();
	unread[current.id] = 0;
	
	$('.loading').removeClass('hidden');
	$('.actions').addClass('hidden');
	$('.rooms .active').removeClass('active');
	anchor.parent().addClass('active');
	$('.rooms .loading').addClass('hidden');
	
	$('#message').prop('disabled', true);

	socket.emit('get chatlog', current.id, null, null, renderChatlogs);
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
	var lines = $('#lines');
	for (timestamp in logs) {
		// not showing timestamp for now

		var entry = logs[timestamp];

		var element = renderChatMessage(entry, mapping);
		lines.append(element);
	}
	chatDiv.scrollTop(chatDiv[0].scrollHeight+50);
	
	$('#message').prop('disabled', false);
	$('#message').data('mentions', {});

	$('#login').attr('href', '/authenticate/'+room.url);
	var pretty = room.pretty;
	var title = room.title;
	if (room.type == 'private') {
		pretty = room.pretty.split(':');
		var me = (pretty[0] == name);
		var uids = room.id.split(':');
		var otherUID = (uid == uids[0]) ? uids[1] : uids[0];
		pretty = me ? pretty[1] : pretty[0];
		title = room.title.split(':');
		title = me ? title[1] : title[0];
		$('.chat-title').prepend('<a id="fb-link" target="_blank" rel="tooltip" title="visit '+pretty+'\'s fb profile" href="http://www.facebook.com/'+otherUID+'"><img src="/img/fb-small.png"></a>');
		$('#fb-link').tooltip();
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
	var chatNav = $('#chats');
	var privateNav = $('#private');
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
		
		if (room.type == 'private') {
			privateNav.append(element);
		} else {
			chatNav.append(element);
		}
	}
	
	$('.rooms .loading').addClass('hidden');

	$('.rooms a').click(function () {
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
		rooms.splice(rooms.indexOf(current), 1);

		$('#lines').empty();
		$('#online li:not(.nav-header)').remove();
		
		var parent = $('.rooms .active').parents('.rooms');
		console.log(parent);
		$('.rooms .active').remove();
		var next = parent.find('a:first');
		
		if (!next.length) {
			parent = parent.siblings('.rooms');
			next = parent.find('a:first');
		}
		
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

// type can be 0-3, 0 being positive and 3 being negative
function notify(type, title, body, actionurl, actiontext) {
	var alertType = 'alert';
	var buttonType = 'btn-warning';
	switch(type) {
		case 0:
			alertType = 'alert-success';
			buttonType = 'btn-success';
			break;
		case 1:
			alertType = 'alert-info';
			buttonType = 'btn-info';
			break;
		case 2:
			alertType = 'alert';
			buttonType = 'btn-warning';
			break;
		case 3:
			alertType = 'alert-error';
			buttonType = 'btn-danger';
			break;
	}
	
	var sidebar = $('.span3');
	var alert = $('<div>').addClass('alert').addClass(alertType).addClass('fade in').addClass('private-alert');
	alert.append($('<a>').addClass('close').attr('data-dismiss', 'alert').attr('href', '#').text('x')
		, $('<h4>').addClass('alert-heading').text(title)
		, $('<p>').text(body).addClass('private-msg')
		, (actionurl && actiontext) ? 
		$('<p>').append($('<a>').addClass('btn').addClass(buttonType).attr('href', actionurl).text(actiontext)) :
		null);
	sidebar.append(alert);
}

var init = true;
window.addEventListener('popstate', function(e) {
	if (init) { init = false; return;}
	if (uid != null && name != null) {
		window.location.href = '/dashboard';
	} else {
		window.location.href = '/';
	}
});