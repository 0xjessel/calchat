var socket = io.connect('http:www.//calchat.net', null);

// for user.special field
var SPECIAL_NONE		= 0;
var SPECIAL_FOUNDER		= 1;
var SPECIAL_ADMIN		= 2;

$(document).ready(function () {
	var addChatForm = $('.navbar-search');
	// addChatInput includes the input form in /dashboard 
	// so that the typeahead code below populates both inputs
	var addChatInput = $('.search-query');
	var limit = 9;
	addChatInput.typeahead({
		source: function(typeahead, query) {
			if (!query) {
				typeahead.process([]);
				return;
			}
			
			// add room
			var addroomname = stripHigh(query);
			var addroomtitle = stripHigh(query);
			var addroomtitletext = '';
			var addroomdescriptiontext = ' Type : to add a description.';
			var nametitlesplitindex = query.indexOf(':');
			if (nametitlesplitindex != -1) {
				if (nametitlesplitindex != query.length-1) {
					addroomname = stripHigh(query.substring(0, nametitlesplitindex));
					addroomtitle = query.substring(nametitlesplitindex+1);
					addroomtitletext = ' ('+addroomtitle+')';
				} else {
					addroomname = addroomname.substring(0, addroomname.length - 1);
				}
				addroomdescriptiontext = ' Add a description.';
			}
			
			var addroomhtml = getTypeaheadItem('Add '+addroomname+addroomtitletext, 'Create a new private room.'+addroomdescriptiontext, 'new');
			var addroom = {
				id			: addroomname,
				url			: stripLow(addroomname)+'::new::'+addroomtitle,
				pretty		: addroomname,
				title		: addroomtitle,
				type		: 'new',
				value		: $('<div>').append(addroomhtml.clone()).html(),
			}

			if (query.indexOf(addChatInput.data('filter-empty')) == 0) {
				var noresults = [];
				if (isRoomAddable(addroom.id)) {
					noresults = noresults.concat(addroom);
				}
				typeahead.process(noresults);
				return;
			}
			
			var querysplitindex = query.indexOf(':');
			if (querysplitindex != -1) {
				query = query.substring(0, querysplitindex);
			}
			
			addChatInput.data('query', query);
			// query db for valid rooms that begin with query
			socket.emit('get validrooms', query, limit-1, function(rooms) {
				if (query != addChatInput.data('query')) return;
				
				var addroomexists = false;
				if (!rooms.length) {
					addChatInput.data('filter-empty', query);
				} else {
					addChatInput.data('filter-empty', null);
				}

				for (var i = 0; i < rooms.length; i++) {
					var room = rooms[i];
					
					var pretty = room.pretty;
					var title = room.title;
					
					if (room.id == addroom.id) {
						addroomexists = true;
					}
					
					if (room.type == 'private') {
						pretty = prettyfor(room, uid);
					}

					var html = getTypeaheadItem(pretty, title, room.type);

					room.value = $('<div>').append(html.clone()).html();
				};
				
				if (!addroomexists && isRoomAddable(addroom.id)) {
					rooms = rooms.concat(addroom);
				}
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
		window.location.href = '/chat/'+addChatInput.val();
		return false;
	});
});

function getTypeaheadItem(name, description, icontype) {
	var firstLine = $('<div>').addClass('typeahead-firstline').append(
		$('<span>').addClass('typeahead-firstline').append(name));
	var secondLine = $('<div>').addClass('typeahead-secondline').addClass('typeahead-secondline').append(description);
	var main = $('<div>').addClass('typeahead-main').append(firstLine, secondLine);					
	var icon = $('<i>').addClass(getIconClass(icontype)).addClass('typeahead-icon');
	
	var html = $('<div>').addClass('typeahead-container').append(
		icon,
		main);
	
	return html;
}

function stripLow(string) {
	var splitIndex = string.indexOf('::');
	var front = string;
	var back = '';
	if (splitIndex != -1) {
		front = string.substring(0, splitIndex);
		back = string.substring(splitIndex);
	}
	return front.replace(/[^A-Za-z0-9:]/g, '').toLowerCase()+back;
}

function stripHigh(string) {
	var splitIndex = string.indexOf('::');
	var front = string;
	var back = '';
	if (splitIndex != -1) {
		front = string.substring(0, splitIndex);
		back = string.substring(splitIndex);
	}
	return front.replace(/[^A-Za-z0-9:]/g, '').toUpperCase()+back;
}

function isRoomAddable(name) {
	name = stripHigh(name)
	return name.replace(/[^A-Za-z:]/g, '') == name;
}

// helper function to render individual chat messages
// shared by archives.js and chat.js
function renderChatMessage(entry, mapping, enableLink) {
	var fromUid = entry.from;
	var toRoom = entry.to;
	var msg = entry.text;
	var mentions = entry.mentions;
	var mid = entry.id;
	var timestamp = entry.timestamp;

	msg = linkify(msg);
	
	var label = getLabel(fromUid, toRoom, mapping);
	
	if (fromUid == 'System') {
		return $('<p class="system-message">').append(msg);
	} else {
     	var from = mapping[fromUid].name;

		var totalWidth = 0;
		for (var i = 0; i < mentions.length; i++) {
			var id = mentions[i];
			if (id && id in mapping) {
				var link = $('<div>').append(
					getUserLink(id, mapping, enableLink).addClass('mention').text('@'+mapping[id].name).clone()).html();

				msg = msg.replace(mapping[id].name, link);
			}
		}


		var element = $('<p>').addClass('message').append(
			$('<span>').addClass('pic').append($('<img>').addClass('avatar-msg').attr('src', "http://graph.facebook.com/"+fromUid+"/picture").width(18).height(18)),
			$('<div>').addClass('timestamp').append(new Date(parseInt(timestamp)).toLocaleTimeString()),
			$('<span>').addClass('from').append(getUserLink(fromUid, mapping, enableLink).addClass('from').append(from), label, ': '),
			$('<span>').addClass('text').append(msg).attr('id', 'text'+mid)
		);
		return element;
	}
}

// helper function to return a jquery anchor tag for a user's name
function getUserLink(id, mapping, enable) {
	if (!enable || uid == id || (uid == null && name == 'null') || !mapping[id]) {
		return $('<a>').attr('href', 'javascript:void(0)');
	}
	var lowid = Math.min(id,uid);
	var highid = Math.max(id,uid);
	var lowname = lowid == uid ? name : mapping[lowid].name;
	var highname = highid == uid ? name : mapping[highid].name;
	return $('<a>').attr('href', '/chat/'+lowid+':'+highid+'::private::'+lowname+':'+highname);
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
	if (special == SPECIAL_FOUNDER) {
		return getLabelOf('FOUNDER');
	} else if (special == SPECIAL_ADMIN) {
		return getLabelOf('ADMIN');
	} else if (gsi) {
		return getLabelOf('GSI');
	} else {
		return getLabelOf(null);
	}
}

function getLabelOf(type) {
	var label = $('<span>').addClass('label').css('display', 'none');
	
	switch(type) {
		case 'GSI':
		label.addClass('label-warning').text('GSI').show();
		break;
		case 'ADMIN':
		label.addClass('label-important').text('ADMIN').show();
		break;
		case 'FOUNDER':
		label.addClass('label-inverse').text('FOUNDER').show();
		break;
	}
	return label;
}

function getIconClass(type) {
	switch(type) {
		case 'class':
			return 'icon-book';
		case 'building':
			return 'icon-home';
		case 'special':
			return 'icon-gift';
		case 'redirect':
			return 'icon-time';
		case 'new':
			return 'icon-plus';
		case 'private':
			return 'icon-user';
		case 'group':
			return 'icon-glass';
		default:
			return null;
	}
}

function prettyfor(privateRoom, uid) {
	var idsplit = privateRoom.id.split('::')[0].split(':');
	var prettysplit = privateRoom.pretty.split(':');
	return uid == idsplit[1] ? prettysplit[0] : prettysplit[1];
}

function getotherfor(privateRoom, uid) {
	var idsplit = privateRoom.id.split('::')[0].split(':');
	return uid == idsplit[1] ? idsplit[0] : idsplit[1];
}

// helper function to pop up a notification
// type can be 0-3, 0 being positive and 3 being negative
function notify(type, alertClass, title, body, callToAction, hasButton, corner) {
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
	
	var alert = $('<div>').addClass('alert').addClass(alertClass).addClass(alertType).addClass('fade in');

	if (corner) {
		alert.addClass('corner-alert');
	}

	if (callToAction && hasButton) {
		callToAction.addClass(buttonType);
	}

	alert.append($('<a>').addClass('close').attr('data-dismiss', 'alert').attr('href', '#').text('x')
		, $('<h4>').addClass('alert-heading').text(title)
		, $('<p>').addClass('alert-msg').text(body)
		, (callToAction) ? 
		$('<p>').append(callToAction) :
		null);
	return alert;
}
