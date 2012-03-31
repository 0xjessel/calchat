// socket.io specific code
var opts = {};
opts['sync disconnect on unload'] = false;
var socket = io.connect(null, opts);
var current = rooms[0];
var chatDiv;
var selfAnnounced = false;
var unread = {};
for (var i = 0; i < rooms.length; i++) {
	unread[rooms[i]] = 0;
}

socket.on('connect', function () {
	// join all rooms
	for (var i = 0; i < rooms.length; i++) {
		if (rooms[i] != '') {
			socket.emit('join room', rooms[i]);
		}
	}

	socket.emit('get chatlog', current, function (logs, mentions) {
		renderChatlogs(logs, mentions);

		// send fb name
		socket.emit('set name', uid, name, function(set) {
			if(!set) {
				clear();
			}
		});
	});
});

socket.on('announcement', function (to, msg) {
	if (to == current) {
		$('#lines').append($('<p>').append($('<em>').text(msg)));
		if (!selfAnnounced) {
			// scroll chat to bottom after chatlog and this announcement 
			// only once (in the beginning)
			selfAnnounced = true;
		}
		chatDiv.scrollTop(chatDiv[0].scrollHeight);	
	}
});

socket.on('online', function(room, nicknames) {
	if (room == current) {        
		// empty out sidebar, repopulate with online people
		var onlineSidebar = $('#online');
		$('#online li:not(.nav-header)').remove();

		for (var id in nicknames) {
			var pic = 'https://graph.facebook.com/'+id+'/picture?type=square';
			onlineSidebar.append('<li><a '+ getUserLinkAttributes(id) +'><img class="avatar" width="30px" height="30px" src='+pic+'>'+nicknames[id]+'</a></li>');
		}
	}
});

socket.on('message', message);

socket.on('reconnect', function () {
	$('#lines').empty();
	message(current, 'System', 'Reconnected to the server');
});

socket.on('reconnecting', function () {
	message(current, 'System', 'Attempting to re-connect to the server');
});

socket.on('error', function (e) {
	message(current, 'System', e ? e : 'A unknown error occurred');
});

function message (to, from, msg, mentions) {    
	if (to == current) {
		// append incoming msg to the current room
		var element = renderChatMessage(from, msg, mentions);
		$('#lines').append(element);

		scrollToBottom();
	} else {
		// incr badge
		unread[to]++;
		var badge = $('#'+to+' .badge');

		if (badge.length == 0) {
			$('#'+to).append('<span class="badge badge-error">'+unread[to]+'</span>');
		} else {
			badge.text(unread[to]);
		}
	}
}

function renderChatlogs (logs, mentions) {
	for (timestamp in logs) {
		// not showing timestamp for now

		var entry = logs[timestamp];
		
		var from = entry['from'];
		var text = entry['text'];

		var element = renderChatMessage(from, text, mentions);
		$('#lines').append(element);
	}
	chatDiv.scrollTop(chatDiv[0].scrollHeight);
}

function renderChatMessage(fromUid, msg, mentions) {
	msg = linkify(msg);
	msg = mentionize(msg, mentions);
	
	var from = mentions[fromUid];

	var fromElement = $('<span class="from">').append($('<a '+ getUserLinkAttributes(fromUid) +' class="from">').append(from), ': ');
	var msgElement = $('<span class="message">').append(msg);

	var element = $('<p>').append(fromElement, msgElement);
	return element;
}

function mentionize(msg, mentions) {
	for (id in mentions) {
		var text = '@'+mentions[id];
		msg = msg.replace('#'+id+'$', '<a '+ getUserLinkAttributes(id) +' class="mention">'+text+'</a>');
		// TODO: make the link actually do something
	}
	return msg;
}

function getUserLinkAttributes(id) {
	return 'target="_blank" href="http://www.facebook.com/'+ id +'" ';
}

function clear () {
	$('#message').val('').focus();
};

function scrollToBottom () {
	// scroll to bottom only if already scrolled to bottom
	if (chatDiv[0].scrollHeight - chatDiv.scrollTop() - 80 <= chatDiv.outerHeight()) {
		chatDiv.scrollTop(chatDiv[0].scrollHeight);	
	}
}

function hideMentionSuggestions() {
	$('#user-suggestions').hide();
	$('#message').data('prevFilter', null);
	$('#suggestion-list').data('selected', 0);
}
        
function setMentionSuggestionSelection(selection) {
	selection = Math.max(0, Math.min($('#suggestion-list').children().length-1, selection));
	$('#suggestion-list').data('selected', selection);
            
	// figure out which suggestion is highlighted
	$('#suggestion-list').children().each(function() {
		var suggestionIndex = $(this).data('suggestion-index');
		if (selection == suggestionIndex && !$(this).hasClass('suggestion-hint')) {
			$(this).addClass('suggestion-selected');
		} else {
			$(this).removeClass('suggestion-selected');
		}
	});
}

// dom manipulation
$(document).ready(function () {
	$('.chat-title h2').text(current);
	chatDiv = $('#chat');

	// setup chats in left nav sidebar
	var roomsNav = $('#chats');
	for (var i = 0; i < rooms.length; i++) {
		if (i == 0) {
			roomsNav.append('<li class="active"><a href="javascript:void(0)" id="'+rooms[i]+'">'+rooms[i]+'</a></li>');	
		} else {
			roomsNav.append('<li><a href="javascript:void(0)" id="'+rooms[i]+'">'+rooms[i]+'</a></li>');
		}
	}
    
    // set suggestions box width
    $('#user-suggestions').width($('#message').outerWidth()).hide();
    // first suggestion highlighted first
    $('#suggestion-list').data('selected', 0);
	
	$(document).click(function() {
		hideMentionSuggestions();
	});

	$('#chats a').click(function () {
		if ($(this).text() != current) {
			$('#lines').empty();
			$('#online li:not(.nav-header)').remove();
			$(this).find('.badge').remove();

			$('#chats .active').removeClass('active');
			$(this).parent().addClass('active');

			current = $(this).text();
			$('.chat-title h2').text(current);

			socket.emit('get chatlog', current, renderChatlogs);
			socket.emit('get online', current);
		}
		return false;
	});

	$('#send-message').submit(function () {
		// TODO: since we are sending the message to the server and waiting for the reply
		//       we should display some kind of 'Sending…' text

		socket.emit('message', current, $('#message').val());
		clear();
		scrollToBottom();
		return false;
	});

	// @mentions
    $('#message').keydown(function(e) {
        if ($('#user-suggestions').css('display') != 'none') {
            switch(e.which) {
                case 27: //ESC
                case 38: //arrow up
                case 40: //arrow down
                case 13: //ENTER
                    e.preventDefault();
                    break;
            }
        }
    });

	// upon keyup, the val() would have already been updated
	$('#message').keyup(function(e) {        
        var prevSelected = $('#suggestion-list').data('selected');
        
        if ($('#user-suggestions').css('display') != 'none') {
            switch(e.which) {
                case 27: //ESC
                    hideMentionSuggestions();
                    return;
                case 38: //arrow up
                    setMentionSuggestionSelection(prevSelected - 1);
                    return;
                case 40: //arrow down
                    setMentionSuggestionSelection(prevSelected + 1);
                    return;
                case 13: //ENTER
                    $('#suggestion-list').children().get(prevSelected).children.item(0).click();
                    return;
            }
        }

		// filter suggestions
		var msg = $(this).val();
		// get caret position
		var end = $(this).get(0).selectionStart;
		// get position of '@'
		var start = msg.substring(0, end).lastIndexOf('@');

		// did user delete '@'?
		if (start == -1) {
			hideMentionSuggestions();
			return;
		}

		// the text in between '@' and caret position
		var filter = msg.substring(start+1, end);
        
		// recalculate if filter has been changed
		if (filter != $(this).data('prevFilter')) {
			$(this).data('prevFilter', filter);
			
			// clear suggestions box to be repopulated
			$('#suggestion-list').empty();
            
            var displayLoading = setTimeout(function() {
				$('#suggestion-list').empty();
                $('#suggestion-list').append($('<div class="suggestion-hint">').text('Loading...'));
                $('#user-suggestions').show();
            }, 1000);

			socket.emit('get users', current, filter, function(users, online, offline) {
				online.sort();
				offline.sort();
				var ids = online.concat(offline);
				
				clearTimeout(displayLoading);
				$('.suggestion-hint').remove();
				$('#suggestion-list').empty();
				
				for (var i = 0; i < ids.length; i++) {
					var id = ids[i];
					var user = users[id];
                    
					var pic = 'https://graph.facebook.com/'+id+'/picture?type=square';
					var suggestionItem = $('<li>').data('suggestion-index', i).append('<a href="javascript:void(0)" id="user'+id+'"><img class="avatar" width="30px" height="30px" src='+pic+'>'+user+'</a>');
					
					$('#suggestion-list').append(suggestionItem);
					$('#user'+id).data('id', id);
					$('#user'+id).click(function(){
						// get id of clicked suggestion
						var id = $(this).data('id');
						// get text after the caret position
						var after = msg.substring(end);
							
						// turn the '@filter' into '#id ' and keep the before and after text the same
						var transformedMsg = msg.substring(0, start) + '#' + id + '$' + after;

						// calculate the new caret position
						var caretPosition = transformedMsg.length - after.length;

						// hide suggestions box
						hideMentionSuggestions();

						// set new value for input
						$('#message')
						.val(transformedMsg)
						.focus()
						.get(0).setSelectionRange(caretPosition,caretPosition);
					});
				}
                
                if (ids.length) {
                    $('#user-suggestions').show();
                } else {
                    hideMentionSuggestions();
                }
                
                setMentionSuggestionSelection(0);
			});
		}
	});

	$('#archives').click(function () {
		window.location.href = '/'+current+'/archives';
	});

	$('#close').click(function () {
		// remove chatroom from sidebar
		// load next chatroom in line
		// if no chatroom redirect to dashboard with params

		$('#lines').empty();
		$('#online li:not(.nav-header)').remove();
		$('#chats .active').remove();
		var left = current;
		
		var next = $('#chats a:first')
		if (next.length) {
			next.parent().addClass('active');
			current = next.text();
			$('.chat-title h2').text('Loading...');
		}

		socket.emit('leave room', left, function() {
			if (next.length) {
				socket.emit('get chatlog', current, renderChatlogs);
				socket.emit('get online', current);
				$('.chat-title h2').text(current);
			}
		});
		
		if (!next.length) {
			// redirect
			window.location.href = '/dashboard';
		}
	});
	
	$('a[rel=tooltip]').tooltip();
});
