$(document).ready(function () {
	if (rooms.length == 0) {
		var alert = $('.alert');
		alert.removeClass('hidden');
		alert.html('<a class="close" data-dismiss="alert">x</a>No rooms!');
	}
});