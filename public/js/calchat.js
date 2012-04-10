var socket = io.connect();

$(document).ready(function () {
	var addChatForm = $('.navbar-search');
	// addChatInput includes the input form in /dashboard 
	// so that the typeahead code below populates both inputs
	var addChatInput = $('.search-query');
	var limit = 8;
	addChatInput.typeahead({
		source: function(typeahead, query) {
			if (!query) {
				typeahead.process([]);
				return;
			}

			if (query.indexOf(addChatInput.data('filter-empty')) == 0) {
				typeahead.process([]);
				return;
			}
			// query db for valid rooms that begin with query
			socket.emit('get validrooms', query, limit, function(rooms) {
				if (!rooms.length) {
					addChatInput.data('filter-empty', query);
				} else {
					addChatInput.data('filter-empty', null);
				}

				for (var i = 0; i < rooms.length; i++) {
					var room = rooms[i];
					
					var pretty = room.pretty;
					var title = room.title;
					
					if (room.type == 'private') {
						pretty = prettyfor(room, uid);
						title = titlefor(room, uid);
					}

					var firstLine = $('<div>').addClass('typeahead-firstline').append(
						$('<span>').append('<p>').addClass('room-pretty').text(pretty));
					var secondLine = $('<div>').addClass('typeahead-secondline').append('<p>').addClass('room-title').text(title);
					var main = $('<div>').addClass('typeahead-main').append(firstLine, secondLine);					
					var icon = getIcon(room.type).addClass('typeahead-icon');
					
					var html = $('<div>').append($('<div>').addClass('typeahead-container').append(
						icon,
						main));

					room.value = html.html();
				};
				typeahead.process(rooms);
			});
		},
		
		items: limit,
		
		matcher: function(item) {
			return true;
		},

		highlighter: function(item) {
			return item;
		},
		
		onselect: function(item) {
			// item.pretty is the abbrev. form, o/w the pretty form
			addChatInput.val(item.url);
			addChatForm.submit();
		},
	});
	
	addChatForm.submit(function () {
		// no validation on text input, done on server side
		window.location.href = '/chat/'+stripLow(addChatInput.val());
		return false;
	});
});

function stripLow(string) {
	return string.replace(/[^A-Za-z0-9:]/g, '').toLowerCase();
}

// for user.special field
var SPECIAL_NONE		= 0;
var SPECIAL_FOUNDER		= 1;

// helper function to render individual chat messages
// shared by archives.js and chat.js
function renderChatMessage(entry, mapping) {
	var fromUid = entry.from;
	var toRoom = entry.to;
	var msg = entry.text;
	var mentions = entry.mentions;
	var mid = entry.id;
	var timestamp = entry.timestamp;

	msg = linkify(msg);
	// msg = mentionize(msg, mapping);
	
	var label = getLabel(fromUid, toRoom, mapping);
	
	if (fromUid == 'System') {
		return $('<p class="system-message">').append(msg);
	} else {
     	var from = mapping[fromUid].name;

		var totalWidth = 0;
		for (var i = 0; i < mentions.length; i++) {
			var id = mentions[i];

			var link = $('<div>').append(
				getUserLink(id).addClass('mention').text('@'+mapping[id].name).clone()).html();

			msg = msg.replace(mapping[id].name, link);
		}


		var element = $('<p>').addClass('message').append(
			$('<span>').addClass('pic').append($('<img>').addClass('avatar-msg').attr('src', "http://graph.facebook.com/"+fromUid+"/picture").width(18).height(18)),
			$('<span>').addClass('from').append(getUserLink(fromUid).addClass('from').append(from), label, ': '),
			$('<span>').addClass('text').append(msg).attr('id', 'text'+mid),
			$('<div>').addClass('timestamp').append($('<span>').append(new Date(parseInt(timestamp)).toLocaleTimeString()))
		);
		return element;
	}
}

// helper function to return a jquery anchor tag for a user's name
function getUserLink(id) {
	if (uid == id || (uid == null && name == 'null')) {
		return $('<a>').attr('href', 'javascript:void(0)');
	}
	return $('<a>').attr('href', '/chat/'+Math.min(uid, id)+':'+Math.max(uid, id));
}

// helper function that returns a jquery GSI or FOUNDER label, etc
function getLabel(fromUid, toRoom, mapping) {
	var gsi = false;
	var special = SPECIAL_NONE;
	if (mapping && fromUid in mapping) {
		var from = mapping[fromUid].name;
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
	var label = $('<span>').addClass('label').css('display', 'none');
	if (special == SPECIAL_FOUNDER) {
		label.addClass('label-inverse').text('FOUNDER').show();
	} else if (gsi) {
		label.addClass('label-warning').text('GSI').show();
	}
	return label;
}

function getIcon(type) {
	switch(type) {
		case 'class':
			return $('<i>').addClass('icon-book');
		case 'building':
			return $('<i>').addClass('icon-home');
		case 'special':
			return $('<i>').addClass('icon-gift');
		case 'private':
			return $('<i>').addClass('icon-comment');
		case 'redirect':
			return $('<i>').addClass('icon-time');
		default:
			return null;
	}
}

function prettyfor(privateRoom, uid) {
	var split = privateRoom.pretty.split(':');
	return uid == privateRoom.id2 ? split[0] : split[1];
}

function titlefor(privateRoom, uid) {
	var split = privateRoom.title.split(':');
	return uid == privateRoom.id2 ? split[0] : split[1];
}

function getotherfor(privateRoom, uid) {
	return uid == privateRoom.id2 ? privateRoom.id1 : privateRoom.id2;
}

// helper function to pop up a notification
// type can be 0-3, 0 being positive and 3 being negative
function notify(type, title, body, callToAction, isButton, corner) {
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
	
	var alert = $('<div>').addClass('alert').addClass(alertType).addClass('fade in');

	if (corner) {
		alert.addClass('corner-alert');
	}

	if (callToAction && isButton) {
		callToAction.addClass(buttonType);
	}

	alert.append($('<a>').addClass('close').attr('data-dismiss', 'alert').attr('href', '#').text('x')
		, $('<h4>').addClass('alert-heading').text(title)
		, $('<p>').text(body).addClass('private-msg')
		, (callToAction) ? 
		$('<p>').append(callToAction) :
		null);
	return alert;
}
