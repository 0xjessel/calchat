// socket variable already instantiated via geo.js

$(document).ready(function () {

	var container = $('.container-fluid');
	if (rooms[0] == null) {
		container.prepend('<div class="alert alert-error"><a class="close fade in" data-dismiss="alert">x</a>You haven\'t added any chatrooms yet!  Search for a chatroom in the navbar above or in the Add Chatroom section below.</div>');
	} else {
		var chatroomsList = $('#chatrooms');
		var privateList = $('#privatechats');
		for (var i = 0; i < rooms.length; i++) {
			var room = rooms[i];
			
			var icon = getIcon(room.type).addClass('chats-icon');

			var unread = room.unread;
			var unreadBadge = $('<span>').css('display', 'none').addClass('badge').addClass('badge-error').text(unread);
			
			if (unread > 0) {
				unreadBadge.show();
			}

			var pretty = room.pretty;
			var isPrivate = (room.type == 'private');
			if (isPrivate) {
				pretty = pretty.split(':');
				pretty = (pretty[0] == name) ? pretty[1] : pretty[0];
			}

			var li = $('<li>').append($('<a>').attr('href', '/chat/'+room.url).append(
				icon,
				$('<span>').addClass('chats-name').append(pretty),
				unreadBadge,
				$('<span>').addClass('close close-chat').data('room', room.id).text('x')));
			if (isPrivate) {
				privateList.append(li);
			} else {
				chatroomsList.append(li);
			}
		}
	}

	var path = location.href.split('?');
	if (path.length > 1) {
		var invalid = path[1].split('=');
		if (invalid[0] == 'invalid') {
			container.prepend('<div class="alert alert-error"><a class="close" data-dismiss="alert">x</a><b>Error: </b>\"'+invalid[1]+'\" is an invalid chatroom, please try again.</div>');
		}
	}

	if (!hasPhoneNum) {
		container.prepend(notify(1, "Important!", "Enter your phone number (e.g. 5553234764) to be notified when someone @mentions you", "something", "soda"));
	}
	
	$('.close-chat').click(function () {
		socket.emit('remove room', $(this).data('room'));
		$(this).parent().parent().remove();
		return false;
	});
	
	$('.form-search').submit(function () {
		// no validation on text input, needs to be done on server side
		window.location.href = '/chat/'+$('.form-search .search-query').val();
		return false;
	});
});