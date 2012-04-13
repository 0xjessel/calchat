$(document).ready(function () {
	var container = $('.container-fluid');
	var path = location.href.split('?');
	if (path.length > 1) {
		var value = path[1].split('=')[1];
		var alert = $('<div>').addClass('alert').addClass('alert-error');
		switch (value) {
			// accessing dashboard while not logged in
			case "0":
				alert.html('<a class="close" data-dismiss="alert">&times;</a><b>Error: </b>Please login to view your dashboard.');
				container.prepend(alert);
				break;
			// accessing /chat without any chatrooms added
			case "1":
				alert.html('<a class="close" data-dismiss="alert">&times;</a><b>Error: </b>You haven\'t added any chatrooms yet!  Add some in the navbar above.');
				container.prepend(alert);
				break;
			// invalid chatroom
			case "2":
				alert.html('<a class="close" data-dismiss="alert">&times;</a><b>Error: </b>Error: </b>Invalid chatroom, please try again.');
				container.prepend(alert);
				break;
			case "3":
				alert.html('<a class="close" data-dismiss="alert">&times;</a><b>Error: </b>Please login to view your preferences.');
				break;
			default:
				break;
		}
	}

	$('a[rel=tooltip]').tooltip();
	$('.carousel').carousel();
});