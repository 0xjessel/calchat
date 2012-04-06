var socket = io.connect();

$(document).ready(function () {
	// example navbar search
	var addChatForm = $('.navbar-search');
	// addChatInput includes the input form in /dashboard 
	// so that the typeahead code below populates both inputs
	var addChatInput = $('.search-query');
	var limit = 8;
	addChatInput.typeahead({
		source: function(typeahead, query) {
			if (!query) {
				typeahead.process([]);
				return;
			}

			if (query.indexOf(addChatInput.data('filter-empty')) == 0) {
				typeahead.process([]);
				return;
			}

			socket.emit('get validrooms', query, limit, function(rooms) {
				console.log(rooms);
				if (!rooms.length) {
					addChatInput.data('filter-empty', query);
				} else {
					addChatInput.data('filter-empty', null);
				}

				for (var i = 0; i < rooms.length; i++) {
					var room = rooms[i];

					var firstLine = $('<div>').append(
						$('<span>').append('<p>').addClass('room-pretty').text(room.pretty));

					var name = room.name;
					if (room.pretty != name) {
						firstLine.append(
							$('<span>').append('<p>').addClass('room-name').text(' ('+name+')'));
					}

					var html = $('<div>').append(
						firstLine,
						$('<div>').append('<p>').addClass('room-title').text(room.title));

					room.value = html.html();
				};
				typeahead.process(rooms);
			});
		},
		
		items: limit,
		
		matcher: function(item) {
			return true;
		},

		highlighter: function(item) {
			return item;
		},
		
		onselect: function(item) {
			// item.pretty is the abbrev. form, o/w the pretty form
			addChatInput.val(item.pretty);
			addChatForm.submit();
		},
	});
	
	addChatForm.submit(function () {
		// no validation on text input, done on server side
		window.location.href = '/chat/'+stripLow(addChatInput.val());
		return false;
	});
});

function stripLow(string) {
	return string.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
}
