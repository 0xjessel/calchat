$(document).ready(function () {
	var container = $('.container-fluid');
	if (rooms[0] == null) {
		var alert = $('<div>').addClass('alert').addClass('alert-error');
		alert.html('<a class="close fade in" data-dismiss="alert">&times;</a>You haven\'t added any chatrooms yet!  Search for a chatroom in the navbar above or in the Add Chatroom section below.');
		container.prepend(alert);
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
				$('<span>').addClass('close close-chat').data('room', room.id).html('&times;')));
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
			var alert = $('<div>').addClass('alert').addClass('alert-error');
			alert.html('<a class="close" data-dismiss="alert">&times;</a><b>Error: </b>\"'+invalid[1]+'\" is an invalid chatroom, please try again.');
			container.prepend(alert);
		}
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

	$('.modal-join-chatrooms').submit(function() {
		var item = $(this).data('item');
		var id = item.id;

		var initialRooms = $('#initialsubmit').data('initialRooms');

		console.log('before', initialRooms);

		if (!initialRooms) initialRooms = [];
		if ($.inArray(id, initialRooms) == -1){
			$('.modal-classes-added').append(
				$('<span>').addClass('label label-info label-initialroom').append(
					item.pretty));
			initialRooms.push(id);
			$('#initialsubmit').data('initialRooms', initialRooms);
		}
		console.log('after', initialRooms);
		return false;
	});

	$('#initialsubmit').click(function(event) {
		var initialRooms = $('#initialsubmit').data('initialRooms');
		var phoneNumber = $('.phone-number').val();
		if (isPhoneNumber(phoneNumber) || phoneNumber == '') {
			socket.emit('add rooms', initialRooms, function(){
				socket.emit('phone num', uid, phoneNumber, function() {
					window.firstTime = false;
					window.location.href = '/chat/';
				});
			});
		} else {
			$('.phoneSubmit .control-group').addClass('error');
			$('.phoneSubmit .help-inline').text('invalid phone number');
		}
	    return false;
	});

});