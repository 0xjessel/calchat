$(document).ready(function () {
	// example navbar search
	var addChatForm = $('.navbar-search');
	var addChatInput = $('.navbar-search .search-query');
	var opts = {source: ['cs188', 'calchat', 'ee40', 'cs162', 'ee20', 'ee120', 'cs61a'], items: 4}
	addChatInput.typeahead(opts);
	
	addChatForm.submit(function () {
		// no validation on text input, needs to be done on server side
		window.location.href = '/chat/'+addChatInput.val();
		return false;
	});
});