// socket variable already instantiated via geo.js

$(document).ready(function () {

	var container = $('.container-fluid');
	if (rooms.length == 1 && rooms[0].title == null) {
		container.prepend('<div class="alert alert-error"><a class="close" data-dismiss="alert">x</a>You haven\'t added any chatrooms yet!  Search for a chatroom in the navbar above or in the Add Chatroom section below.</div>');
	} else {
		var chatroomsList = $('#chatrooms');
		for (var i = 0; i < rooms.length; i++) {
			var room = rooms[i].title;
			chatroomsList.append('<li><a href="/chat/'+room+'">'+room+'<span id="'+room+'" class="close close-chat">x</span></a></li>');
		}
	}
	
	$('.close-chat').click(function () {
		socket.emit('remove room', uid, $(this).attr('id'));
		$(this).parent().parent().remove();
		return false;
	})
	
	$('.form-search').submit(function () {
		// no validation on text input, needs to be done on server side
		window.location.href = '/chat/'+$('.form-search .search-query').val();
		return false;
	});
	
	getUrlVars(function (errors) {
		if (errors.length) {
			var room = errors["invalid"];
			if (room) {
				container.prepend('<div class="alert alert-error"><a class="close" data-dismiss="alert">x</a>Sorry, '+room+' is an invalid chatroom</div>');
			}
		}
	});
	
	function getUrlVars(callback) {
		var vars = [], hash;
		var hashes = window.location.href.slice(window.location.href.indexOf('?') + 1).split('&');
		for(var i = 0; i < hashes.length; i++) {
			hash = hashes[i].split('=');
			vars.push(hash[0]);
			vars[hash[0]] = hash[1];
		}
		callback(vars);
	}
});