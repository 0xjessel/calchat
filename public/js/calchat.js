var socket = io.connect();

$(document).ready(function () {
	// example navbar search
	var addChatForm = $('.navbar-search');
	// addChatInput includes the input form in /dashboard 
	// so that the typeahead code below populates both inputs
	var addChatInput = $('.search-query');
	var limit = 20;
	addChatInput.typeahead({
		source: function(typeahead, query) {
			socket.emit('get courses', query, limit, function(buildings) {
				typeahead.process(buildings);
			});
		},
		
		items: limit,
		
		matcher: function(item) {
			return true;
		},
		
		onselect: function(item) {
			
		},
	});
	
	addChatForm.submit(function () {
		// no validation on text input, needs to be done on server side
		window.location.href = '/chat/'+addChatInput.val();
		return false;
	});
});