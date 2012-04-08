var socket = io.connect();
var chatDiv;

$(document).ready(function () {
    chatDiv = $('#chat');
	$('.breadcrumb li a').attr('href', '/chat/'+room.url);

	getArchive(begin, end);

	$('#goBack').click(function() {
		var newBegin = new Date(begin);
		newBegin.setDate(newBegin.getDate()-1);
		var newEnd = new Date(end);
		newEnd.setDate(newEnd.getDate()-1);
		getArchive(newBegin, newEnd);
		begin = newBegin.getTime();
		end = newEnd.getTime();
	});

	$('#goForward').click(function() {
		var newBegin = new Date(begin);
		newBegin.setDate(newBegin.getDate()+1);
		var newEnd = new Date(end);
		newEnd.setDate(newEnd.getDate()+1);
		getArchive(newBegin, newEnd);
		begin = newBegin.getTime();
		end = newEnd.getTime();
	});
});

function getArchive(start, finish) {
	var lines = $('#lines');
	lines.empty();
	socket.emit('get chatlog', room.id, start, finish, function(logs, mapping, room) {
		console.log(logs);
		for (timestamp in logs) {
			// not showing timestamp for now
			var entry = logs[timestamp];
			var element = renderChatMessage(entry, mapping);
			lines.append(element);
		}
		chatDiv.scrollTop(chatDiv[0].scrollHeight);	
	});
}