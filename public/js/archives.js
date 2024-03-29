var socket = io.connect('http://www.calchat.net');
var chatDiv;
var today = begin;

$(document).ready(function () {
    chatDiv = $('#chat');
	$('.breadcrumb li a').attr('href', '/chat/'+room.url);

	getArchive(begin, end);
	
	// go back a day
	$('#goBack').click(function() {
		var newBegin = new Date(begin);
		newBegin.setDate(newBegin.getDate()-1);
		var newEnd = new Date(end);
		newEnd.setDate(newEnd.getDate()-1)
		begin = newBegin.getTime();
		end = newEnd.getTime();;
		$('.breadcrumb li.active').text(new Date(end).toDateString());	
		getArchive(begin, end);
		var cur = new Date();
		cur.setHours(0,0,0,0);
		cur = cur.getTime();
		if (begin < cur) {
			$('#goForward').removeClass('hidden');
		}	
	});

	// go forward a day
	$('#goForward').click(function() {
		var newBegin = new Date(begin);
		newBegin.setDate(newBegin.getDate()+1);
		var newEnd = new Date(end);
		newEnd.setDate(newEnd.getDate()+1);
		begin = newBegin.getTime();
		end = newEnd.getTime();
		$('.breadcrumb li.active').text(new Date(end).toDateString());	
		getArchive(begin, end);
		if (today == begin) {
			$('#goForward').addClass('hidden');
		}	
	});
});

// query the db for messages between start to finish
function getArchive(start, finish) {
	var lines = $('#lines');
	lines.empty();
	socket.emit('get chatlog', room.id, start, finish, function(logs, mapping, room) {
		if (Object.keys(logs).length == 0) {
			logs[new Date().getTime()] = {
				'from'	: 'System',
				'to'	: room.id,
				'text'	: 'No messages for this day'
			};
		}
		for (timestamp in logs) {
			// not showing timestamp for now
			var entry = logs[timestamp];
			var element = renderChatMessage(entry, mapping, false);
			lines.append(element);
		}
		chatDiv.scrollTop(chatDiv[0].scrollHeight);	
	});
}