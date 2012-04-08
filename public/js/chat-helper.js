var SPECIAL_NONE		= 0;
var SPECIAL_FOUNDER		= 1;

function renderChatMessage(entry, mapping) {
	console.log(mapping);
	var fromUid = entry.from;
	var toRoom = entry.to;
	var msg = entry.text;
	var mentions = entry.mentions;
	var mid = entry.id;

	msg = linkify(msg);
	// msg = mentionize(msg, mapping);
	
	var label = getLabel(fromUid, toRoom, mapping);
	
	if (fromUid == 'System') {
		return $('<p class="system-message">').append(msg);
	} else {
     	var from = mapping[fromUid].name;
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

			var link = $('<div>').append(getUserLink(id).addClass('mention').text('@'+mapping[id].name).clone()).remove().html();

			msg = msg.replace(mapping[id].name, link);
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
	if (uid == id || (uid == null && name == 'null')) {
		return $('<a>').attr('href', 'javascript:void(0)');
	}
	return $('<a>').attr('href', '/chat/'+Math.min(uid, id)+':'+Math.max(uid, id));
}

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
	var label = $('<span>').addClass('label').hide();
	if (special == SPECIAL_FOUNDER) {
		label.addClass('label-inverse').text('FOUNDER').show();
	} else if (gsi) {
		label.addClass('label-warning').text('GSI').show();
	}
	return label;
}
