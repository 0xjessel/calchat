var socket = io.connect();


$(document).ready(function () {
	$('.breadcrumb li a').attr('href', '/chat/'+room.url);

	socket.emit('get chatlog', room.id, begin, end, function(logs, mapping, room) {
	});
	



});