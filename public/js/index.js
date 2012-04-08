$(document).ready(function () {
	var container = $('.container-fluid');
	var path = location.href.split('?');
	if (path.length > 1) {
		var value = path[1].split('=')[1];
		switch (value) {
			// accessing dashboard while not logged in
			case "0":
				container.prepend('<div class="alert alert-error"><a class="close" data-dismiss="alert">x</a><b>Error: </b>Please login to view your dashboard.</div>');
				break;
			// accessing /chat without any chatrooms added
			case "1":
				container.prepend('<div class="alert alert-error"><a class="close" data-dismiss="alert">x</a><b>Error: </b>You haven\'t added any chatrooms yet!  Add some in the navbar above.</div>');
				break;
			// invalid chatroom
			case "2":
				container.prepend('<div class="alert alert-error"><a class="close" data-dismiss="alert">x</a><b>Error: </b>Invalid chatroom, please try again.</div>');
				break;
			default:
				break;
		}
	}

	$('a[rel=tooltip]').tooltip();

});