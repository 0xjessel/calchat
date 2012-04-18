// Responsible for rendering the chat room

// socket.io specific code
var current = rooms[0];
var chatDiv, notifbar;
var selfAnnounced = false;
var unread = {};
var privateMsgs = [];
var updateTitleId;
var focused = true;
for (var i = 0; i < rooms.length; i++) {
	unread[rooms[i].id] = 0;
}

function debug() {
	function inner() {
		for(var i = 0; i < arguments.length; i++) {
			console.log(arguments[i]);
		}
	}
	inner.apply(null, arguments);
}

// on connection to the server
socket.on('connect', function () {
	debug('connect');
	// join all rooms, set uid and nick, get chatlog
	var roomIds = [];
	for (var i = 0; i < rooms.length; i++) {
		roomIds.push(rooms[i].id);
	};
	socket.emit('initialize', roomIds, current.id, renderChatlogs);
});

// display announcement from server
socket.on('announcement', function (to, msg) {
	debug('announcement');
	if (to == current.id) {
		message({
			from	: 'System',
			to		: current.id,
			text	: msg,
		});
		
		scrollToBottom();
	}
});

// server sends updated online users list
socket.on('online', function(room, mapping) {
	debug('online');
	if (room == current.id) {
		// empty out sidebar, repopulate with online people
		var onlineSidebar = $('#online');
		$('#online li:not(.nav-header)').remove();

		for (var id in mapping) {
			var pic = 'https://graph.facebook.com/'+id+'/picture?type=square';
			var label = getLabel(id, room, mapping);
			
			onlineSidebar.append($('<li>').append(
				getUserLink(id, mapping, true).append(
					$('<a>').attr('href', 'http://facebook.com/'+id).attr('target', '_blank').append(
							$('<img>').addClass('avatar').attr('width','30px').attr('height','30px').attr('src',pic)
						),
					$('<span>').text(mapping[id].name),
					label)));
		}
		$('#online .loading').addClass('hidden');
	}
});

// server reconnected
socket.on('reconnect', function () {
	debug('reconnect');
	$('#lines').empty();
	message({
		'from'	: 'System',
		'to'	: current.id,
		'text'	: 'Reconnected to the server',
	});
	$('.chat-header .loading').addClass('hidden');
	errModal.modal();
});

// server is disconnected
socket.on('reconnecting', function () {
	debug('reconnecting');
	message({
		'from'	: 'System',
		'to'	: current.id,
		'text'	: 'Attempting to re-connect to the server',
	});
	$('.chat-header .loading').removeClass('hidden');
});

var errModal = $('<div>').addClass('modal').addClass('fade').addClass('errModal');
errModal.append(
	$('<div>').addClass('modal-header').append(
			$('<h3>').text('Sorry!')
		),
	$('<div>').addClass('modal-body').append(
			$('<p>').text('An error has occurred.  Please refresh the page and try again.'),
			$('<p>').text('NOTE: You may have to re-login with Facebook')
		),
	$('<div>').addClass('modal-footer').append(
			$('<button>').addClass('btn').addClass('btn-primary').text('Refresh').click(function() {
				window.location.reload();
			})
		)
);

// server sends an error message to the client
socket.on('error', function (e, code) {
	debug('Error: '+e);
	message({
		'from'	: 'System',
		'to'	: current.id,
		'text'	: e ? e : 'A unknown error occurred',
	});
	if (code == 1) {
		errModal.modal();
	}
});

// server alerts client of a private chat
socket.on('private chat', function(roomId, messageEntry, mapping) {
	for (var i = 0; i < rooms.length; i++) {
		if (roomId == rooms[i].id) {
			return;
		}
	}

	if (privateMsgs.indexOf(messageEntry.from) != -1) {
		var msg = $('.alert-msg');
		if (msg.length) {
			msg.text(messageEntry.text);
		}
		return;
	}

	privateMsgs[privateMsgs.length] = messageEntry.from;
	
	var callToAction = $('<a>').addClass('btn').attr('href', '/chat/'+roomId).text('Go to Private Chat');
	prependNotification(
		notify(0,
			'notify-'+messageEntry.from,
			'New Private Chat from '+mapping[messageEntry.from].name+'!',
			messageEntry.text,
			callToAction,
			true,
			true
		)
	);
});

socket.on('command', function(command, room, by, msg) {
	debug('command',command, room, by, msg);
	
	var buttontext = null;
	var buttonlink = null;
	
	var type = 0;
	var alertClass = 'notify-command';
	var title = null;
	var text = by.name+': '+msg;
	var pretty = room.pretty;
	
	if (room.type == 'private') {
		pretty = prettyfor(room, uid);
	}
	
	// COMMANDLIST
	switch(command.toUpperCase()) {
		case 'MENTION':
		buttontext = 'Go to '+pretty;
		buttonlink = '/chat/'+room.url;
		type = 0;
		title = by.name+' mentioned you in '+pretty+'!';
		break;
		case 'FORGIVE':
		buttontext = 'Go to '+pretty;
		buttonlink = '/chat/'+room.url;
		type = 0;
		title = by.name+' has forgiven you';
		break;
		case 'ADMIN':
		buttontext = 'Go to '+pretty;
		buttonlink = '/chat/'+room.url;
		type = 1;
		title = by.name+' made you ADMIN in '+pretty+'!';
		break;
		case 'GSI':
		buttontext = 'Go to '+pretty;
		buttonlink = '/chat/'+room.url;
		type = 1;
		title = by.name+' made you GSI in '+pretty+'!';
		break;
		case 'DEMOTE':
		type = 1;
		title = by.name+' demoted you in '+pretty;
		break;
		case 'KICK':
		
		if (room.id == current.id)
			$('#close').click();
		
		buttontext = 'Take me back I\'ve learned my lesson';
		buttonlink = '/chat/'+room.url;
		type = 2;
		title = 'You are temporarily kicked from '+pretty;
		break;
		case 'WARN':
		type = 2;
		title = 'You are temporarily banned from '+pretty;
		break;
		case 'BAN':
		type = 3;
		title = 'You are permanently banned from '+pretty;
		break;
		default: return;
	}
	
	var callToAction = null;
	if (buttonlink && buttontext) {
		callToAction = $('<a>').addClass('btn').attr('href', buttonlink).text(buttontext);
	}
	var hasButton = callToAction != null;
	var corner = true;
	
	debug('notify', type, alertClass, title, text, callToAction, hasButton, corner);
	prependNotification(
		notify(type, alertClass, title, text, callToAction, hasButton, corner)
	);
});

// server alerts client of a message
socket.on('message', message);
function message (entry, mapping) {
	debug('message');
	if (entry.to == current.id) {
		// append incoming msg to the current room
		var element = renderChatMessage(entry, mapping, true);
		$('#lines').append(element);

		$('div.timeago').filter(':last').timeago();

		// update chat window title
		if (entry.from != uid && mapping && entry.from in mapping) {
			var title1 = mapping[entry.from].name+' messaged '+current.pretty;
			var title2 = document.title;
			clearInterval(updateTitleId);
			updateTitleId = setInterval(function() {
				window.document.title = title1;
				title1 = title2;
				title2 = document.title;
			}, 2000);
			if (!focused) {
				$('#ping').trigger('play');
			}
		}

		scrollToBottom();
	} else {
		// incr badge
		unread[entry.to]++;
		var id = entry.to.replace(/:/g, '');
		var badge = $('#'+id+' .badge');

		if (badge.length == 0) {
			$('#'+id).append('<span class="badge badge-error">'+unread[entry.to]+'</span>');
		} else {
			badge.text(unread[entry.to]);
		}
	}
}

// helper function when chat anchor is clicked
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
	$('.chat-title > i').addClass('hidden');
	
	$('.actions').addClass('hidden');
	$('.rooms .active').removeClass('active');
	anchor.parent().addClass('active');
	$('.rooms .loading').addClass('hidden');
	
	$('#message').prop('disabled', true);

	socket.emit('get chatlog', current.id, null, null, renderChatlogs);
	socket.emit('get online', current.id);			
}

// callback from 'get chatlog' server command
function renderChatlogs (logs, mapping, room) {
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
		var entry = logs[timestamp];

		// render individual chat messages
		var element = renderChatMessage(entry, mapping, true);
		lines.append(element);
	}

	$('div.timeago').timeago();

	chatDiv.scrollTop(chatDiv[0].scrollHeight+50);
	
	// update all page information when get chatlog is successful
	
	$('#message').prop('disabled', false);
	$('#message').data('mentions', {});

	$('#login').attr('href', '/authenticate/'+room.url);
	$('#share').show();
	var pretty = room.pretty;
	var title = room.title;
	if (room.type == 'private') {
		pretty = prettyfor(room, uid);
		$('.chat-title').prepend('<a id="fb-link" target="_blank" rel="tooltip" title="visit '+pretty+'\'s fb profile" href="http://www.facebook.com/'+getotherfor(room, uid)+'"><img src="/img/fb-small.png"></a>');
		$('#fb-link').tooltip();
		$('#share').hide();
	}
	$('.chat-title h2').text(pretty);
	$('.chat-title h3').text(title);
	$('.chat-title > i').removeClass().addClass(getIconClass(room.type));
	
	window.History.replaceState(null, null, '/chat/'+room.url);			
	
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

function prependNotification(alert) {
	var windowHeight = $(window).height();
	var notifHeight = notifbar.height();

    // if notifications are taking up over half the screen
	if (notifHeight/windowHeight > 0.5) {
		var last = $('.corner-alerts .corner-alert:last');
		if (last.length) {
			last.fadeOut('slow', function() {
				last.remove();
				alert.css('display', 'none');
				notifbar.prepend(alert);
				alert.fadeIn('slow');
				return;
			});
		}
	}
	alert.css('display', 'none');
	notifbar.prepend(alert);
	alert.fadeIn('slow');
}

// dom manipulation
$(document).ready(function () {
	chatDiv = $('#chat');
	notifbar = $('.corner-alerts');

	// setup chats in left nav sidebar
	var chatNav = $('#chats');
	var privateNav = $('#private');
	for (var i = 0; i < rooms.length; i++) {
		var room = rooms[i];
		var pretty = room.pretty;
		var id = room.id;
		var element = $('<li>');
		var icon = $('<i>').addClass(getIconClass(room.type)).addClass('chats-icon');
		
		if (i == 0) {
			element.addClass('active');
		}
		if (room.type == 'private') {
			pretty = prettyfor(room, uid);
			// fix for jquery crashing due to : character in data
			id = id.replace(':', '');
		}
		// add the chatroom link element
		element.append($('<a>')
			.attr('href', 'javascript:void(0)')
			.attr('id', id.replace(/:/g, ""))
			.data('room', room)
			.append(
				icon, 
				$('<span>').addClass('chats-name').append(pretty)));
		
		// add to the correct section
		if (room.type == 'group' || room.type == 'private') {
			privateNav.append(element);
		} else {
			chatNav.append(element);
		}
	}
	
	$('.rooms .loading').addClass('hidden');

	// switch to new room
	$('.rooms a').click(function () {
		if ($(this).data('room') != current) {
			renderChatroom($(this));	
		}
		return false;
	});

	// sending a message
	$('#send-message').submit(function () {
		if ($('#message').val()) {
			socket.emit('message', current.id, $('#message').val(), Object.keys($('#message').data('mentions')));
			$('#message').data('mentions', {});
			clear();
			scrollToBottom();
		}
		
		$('#over-limit').hide();
		
		return false;
	});

	$('#message').focus(function() {
		if (current.type == "private") {
			document.title = prettyfor(current, uid);
		} else {
			document.title = current.pretty;
		}
		clearInterval(updateTitleId);
	})
	
	// start autocompleting the user names when encountering a @
	var limit = 10;
	$('#message').typeahead({
		source: function(typeahead, query) {
			var msg = this.query;
			// get caret position
			var end = $('#message').get(0).selectionStart;
			$('#message').data('selectionStart', end);
			// get position of '@'
			var startmention = msg.substring(0, end).lastIndexOf('@');
			var startcommand = msg.substring(0, end).lastIndexOf('/');
			
			var start = startmention > startcommand ? startmention : startcommand;
			var search = startmention > startcommand ? '@' : '/';

			// quit if no '@'
			if (start == -1) {
				typeahead.process([]);
				return;
			}

			// the text in between '@' and caret position
			var filter = msg.substring(start+1, end).toUpperCase();

			if (filter.indexOf($('#message').data('filter-empty')) == 0 && search == $('#message').data('search')) {
				typeahead.process([]);
				return;
			}
			
			// we are doing typeahead for names
			if (search == '@') {
				// query db for all users matching the filter
				getUsers(current.id, filter, limit, function(mapping, online, offline) {
					online.sort();
					offline.sort();
					var ids = online.concat(offline);

					if (!ids.length) {
						$('#message').data('filter-empty', filter);
					} else {
						$('#message').data('filter-empty', null);
					}
					$('#message').data('search', search);
						
					var users = [];
						
					for (var i = 0; i < ids.length; i++) {
						var id = ids[i];
						var name = mapping[id].name;
						var pic = 'https://graph.facebook.com/'+id+'/picture?type=square';
						var html = $('<div>').append($('<img class="avatar" width="30px" height="30px" src='+pic+'>')).append(name);
						
						users.push({
							id:		id,
							value:	html.html(),
							replacement:	name,
							type: 	'@',
						});
					}
					
					typeahead.process(users);
				});
			} else if (search == '/' && start == 0) { // we are doing typeahead for commands
				socket.emit('get commands', filter, current.id, function(commands) {
					
					if (!commands.length && filter.length) {
						$('#message').data('filter-empty', filter);
					} else {
						$('#message').data('filter-empty', null);
					}
					$('#message').data('search', search);
					
					var commandobjects = [];
					for (var i = 0; i < commands.length; i++) {
						var command = commands[i];
						
						var firstLine = $('<div>').addClass('typeahead-firstline').append(
							$('<span>').addClass('typeahead-firstline').append(command.name));
						var secondLine = $('<div>').addClass('typeahead-secondline').addClass('typeahead-secondline').append(command.description);
						var main = $('<div>').addClass('typeahead-main-left').append(firstLine, secondLine);					
						var icon = getLabelOf(command.type).addClass('typeahead-right');
						
						var html = $('<div>').addClass('typeahead-container').append(
							main, icon);
						
						commandobjects.push({
							replacement: 	'/'+command.name+' @',
							value: 			$('<div>').append(html.clone()).html(),
							type: 			'/',
						});
					};
					
					typeahead.process(commandobjects);
				});
			}
		},
		
		items: limit,
		
		matcher: function(item) {
			return true;
		},
		
		highlighter: function(item) {
			return item;
		},
		
		onselect: function(item) {			
			var msg = this.query;
			// get caret position
			// for some reason $('#message').get(0).selectionStart becomes all screwed up
			var end = $('#message').data('selectionStart');
			// get position of '@' or '/'
			var startmention = msg.substring(0, end).lastIndexOf('@');
			var startcommand = msg.substring(0, end).lastIndexOf('/');
			
			var start = startmention > startcommand ? startmention : startcommand;
			
			var replacement = item.replacement;
			
			var transformedMsg = msg.substring(0, start) + '@' + replacement + ' ' + msg.substring(end);

			// calculate the new caret position
			var caretPosition = start + replacement.length + 2; //@ and space

			// set new value for input
			$('#message')
			.val(transformedMsg)
			.focus()
			.get(0).setSelectionRange(caretPosition,caretPosition);

			// save mention
			if (item.type == '@') {
				// use associative array for de-duplication
				$('#message').data('mentions')[item.id] = null;
			}
		}
	});

	// close current chatroom
	$('#close').click(function () {
		// remove chatroom from sidebar
		// load next chatroom in line
		// if no chatroom redirect to dashboard with params
		rooms.splice(rooms.indexOf(current), 1);

		$('#lines').empty();
		$('#online li:not(.nav-header)').remove();
		
		var parent = $('.rooms .active').parents('.rooms');
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
	
	$('#message').keyup(function() {
		var chars = $(this).val().length;
		if (chars > 512) {
			$('#over-limit').show().text('Message too long (-'+(chars-512)+')');
		} else {
			$('#over-limit').hide();
		}
	});
	
	$('a[rel=tooltip]').tooltip();
});

$(window).focus(function() {
	focused = true;
});

$(window).blur(function() {
	focused = false;
})

var init = true;
window.addEventListener('popstate', function(e) {
	if (init) { init = false; return;}
	if (uid != null && name != null) {
		window.location.href = '/dashboard';
	} else {
		window.location.href = '/';
	}
});
