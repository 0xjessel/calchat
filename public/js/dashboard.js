// socket variable already instantiated via geo.js

$(document).ready(function () {

	var container = $('.container-fluid');
	if (rooms.length == 1 && rooms[0].title == null) {
		container.prepend('<div class="alert alert-error"><a class="close" data-dismiss="alert">x</a>You haven\'t added any chatrooms yet!  Search for a chatroom in the navbar above or in the Add Chatroom section below.</div>');
	} else {
		var chatroomsList = $('#chatrooms');
		for (var i = 0; i < rooms.length; i++) {
			var room = rooms[i].title;
			chatroomsList.append('<li><a href="/chat/'+stripLow(room)+'">'+room+'<span id="'+room+'" class="close close-chat">x</span></a></li>');
		}
	}

	var path = location.href.split('?');
	if (path.length > 1) {
		var invalid = path[1].split('=');
		if (invalid[0] == 'invalid') {
			container.prepend('<div class="alert alert-error"><a class="close" data-dismiss="alert">x</a><b>Error: </b>\"'+invalid[1]+'\" is an invalid chatroom, please try again.</div>');
		}
	}
	
	$('.close-chat').click(function () {
		socket.emit('remove room', $(this).attr('id'));
		$(this).parent().parent().remove();
		return false;
	})
	
	$('.form-search').submit(function () {
		// no validation on text input, needs to be done on server side
		window.location.href = '/chat/'+$('.form-search .search-query').val();
		return false;
	});
});