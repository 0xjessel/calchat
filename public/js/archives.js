var socket = io.connect();

$(document).ready(function () {
    var chatDiv = $('#chat');
	$('.breadcrumb li a').attr('href', '/chat/'+room.url);

	getArchive(begin, end);

	$('.prev').click(function() {
		var begin = new Date(begin);
		begin.setDate(begin.getDate()-1);
		var end = new Date(end);
		end.setDate(end.getDate()-1);
		getArchive(begin, end);
	});
});

function getArchive(start, finish) {
	socket.emit('get chatlog', room.id, start, finish, function(logs, mapping, room) {
		for (timestamp in logs) {
			// not showing timestamp for now
			var entry = logs[timestamp];
			var element = renderChatMessage(entry, mapping);
			$('#lines').append(element);
		}
		chatDiv.scrollTop(chatDiv[0].scrollHeight);	
	});
}