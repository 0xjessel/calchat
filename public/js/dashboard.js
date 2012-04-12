$(document).ready(function () {
	var container = $('.container-fluid');
	if (rooms[0] == null) {
		container.prepend('<div class="alert alert-error"><a class="close fade in" data-dismiss="alert">x</a>You haven\'t added any chatrooms yet!  Search for a chatroom in the navbar above or in the Add Chatroom section below.</div>');
	} else {
		var chatroomsList = $('#chatrooms');
		var privateList = $('#privatechats');
		// add all chats and unread badges that the client is in
		for (var i = 0; i < rooms.length; i++) {
			var room = rooms[i];
			
			var icon = $('<i>').addClass(getIconClass(room.type)).addClass('chats-icon');

			var unread = room.unread;
			var unreadBadge = $('<span>').css('display', 'none').addClass('badge').addClass('badge-error').text(unread);
			
			if (unread > 0) {
				unreadBadge.show();
			}

			var pretty = room.pretty;
			if (room.type == 'private') {
				pretty = prettyfor(room, uid);
			}

			var li = $('<li>').append($('<a>').attr('href', '/chat/'+room.url).append(
				icon,
				$('<span>').addClass('chats-name').append(pretty),
				unreadBadge,
				$('<span>').addClass('close close-chat').data('room', room.id).text('x')));
			if (room.type == 'private' || room.type == 'group') {
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
		var callToAction = $('<form>').addClass('form-inline').addClass('phoneSubmit');
		callToAction.append(
			$('<input>').attr('type', 'text').attr('placeholder', 'Phone Number').addClass('input-medium').addClass('phone-number'),
			$('<button>').attr('type', 'submit').addClass('btn').addClass('btn-submit').text('Save')
		);
		container.prepend(
			notify(1, 
				'notify-phoneNum',
				"Important!", 
				"Enter your phone number (e.g. 5553234764) to be notified when someone @mentions you", 
				callToAction, 
				false,
				false));
	}

	$('.phoneSubmit').submit(function () {
		socket.emit('phone num', uid, $('.phone-number').val(), function () {
			$('.alert-info a').click();
		});
		return false;
	});
	
	$('.close-chat').click(function () {
		socket.emit('remove room', $(this).data('room'), function(success) {
			alert('check');
		});
		$(this).parent().parent().remove();
		return false;
	});
	
	$('.join-chatrooms').submit(function () {
		// no validation on text input, needs to be done on server side
		window.location.href = '/chat/'+$('.form-search .search-query').val();
		return false;
	});

	$("#initialsubmit").click(function(event) {
	    alert('hihihi');
	});

});