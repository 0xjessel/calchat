$(document).ready(function () {
	if (rooms.length == 1) {
		var alert = $('.alert');
		alert.removeClass('hidden');
		alert.html('<a class="close" data-dismiss="alert">x</a>You haven\'t added any chatrooms yet!  Add a new chatroom in the navbar above or in the Add Chatroom section below.');
	}
});