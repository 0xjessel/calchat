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

			socket.emit('get courses', query, limit, function(courses) {
				if (!courses.length) {
					addChatInput.data('filter-empty', query);
				} else {
					addChatInput.data('filter-empty', null);
				}

				for (var i = 0; i < courses.length; i++) {
					var course = courses[i];

					var firstLine = $('<div>').append(
						$('<span>').append('<p>').addClass('course-pretty').text(course.pretty));

					var name = course.department+' '+course.number;
					if (course.pretty != name) {
						firstLine.append(
							$('<span>').append('<p>').addClass('course-name').text(' ('+name+')'));
					}

					var html = $('<div>').append(
						firstLine,
						$('<div>').append('<p>').addClass('course-title').text(course.title));

					course.value = html.html();
				};
				typeahead.process(courses);
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
