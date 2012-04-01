var socket = io.connect();

$(document).ready(function () {
	if (rooms.length == 1 && rooms[0] == "") {
		var alert = $('.alert');
		alert.removeClass('hidden');
		alert.html('<a class="close" data-dismiss="alert">x</a>You haven\'t added any chatrooms yet!  Add a new chatroom in the navbar above or in the Add Chatroom section below.');
	} else {
		var chatroomsList = $('#chatrooms');
		for (var i = 0; i < rooms.length; i++) {
			var room = rooms[i];
			chatroomsList.append('<li><a href="/chat/'+room+'">'+room+'<span id="'+room+'" class="close">x</span></a></li>');
		}
	}
	
	$('.close').click(function () {
		socket.emit('remove room', uid, $(this).attr('id'));
		$(this).parent().parent().remove();
		return false;
	})
});