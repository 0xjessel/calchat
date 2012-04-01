$(document).ready(function () {
	var opts = {source: ['cs188', 'calchat', 'ee40', 'cs162', 'ee20', 'ee120', 'cs61a'], items: 4}
	$('.search-query').typeahead(opts);
});