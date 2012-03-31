$(document).ready(function () {
	if (rooms.length == 1) {
		var alert = $('.alert');
		alert.removeClass('hidden');
		alert.html('<a class="close" data-dismiss="alert">x</a>No rooms!');
	}
});