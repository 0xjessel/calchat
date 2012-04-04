var util = require('util')
, everyauth = require('everyauth')
, redis = require('redis')
, sanitize = require('validator').sanitize;

var redisUrl = 'db.calchat.net';
var client0 = redis.createClient(null, redisUrl);
client0.select(0);
var client2 = redis.createClient(null, redisUrl);
client2.select(2);

/*
* GET home page.
*/
exports.index = function(req, res) {
	res.render('index', { 
		title: 'CalChat - Connecting Students On Campus', 
		layout: 'layout-index', 
		loggedIn: req.loggedIn,
		showChatTab: (req.session.rooms && req.session.rooms.length) ? true : false,
		index: 0
	});
};

exports.dashboard = function(req, res) {
	if (req.loggedIn) {
		// convert string to array
		var rooms = req.user.chatrooms.split(',');

		res.render('dashboard', {
			title: 'CalChat - Dashboard',
			layout: 'layout-dashboard',
			loggedIn: req.loggedIn,
			showChatTab: true,
			rooms: rooms,
			index: 1
		});
	} else {
		// error: cannot access /dashboard if not logged in
		res.redirect('/?error=0');
	}
};

exports.chat = function(req, res) {
	if (req.loggedIn) {		
		if (req.user.chatrooms === '') {
			// redirect to dashboard to add some classes to favorites or select a class
			return res.redirect('/dashboard');
		}

		// convert string to array
		var rooms = req.user.chatrooms.split(',');
	} else {
		// guest user
		var rooms = req.session.rooms;
	}
	if (rooms && rooms.length) {
		res.render('chat', { 
			title: 'CalChat - Chat', 
			layout: 'layout-chat',
			loggedIn: req.loggedIn,
			showChatTab: true,
			rooms: rooms,
			index: 2
		});
	} else {
		// error: guest did not add any chats yet
		return res.redirect('/?error=1');
	}
};

exports.chatroom = function(req, res) {
	function strip(string) {
		return string.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
	}

	var room = req.params.room;
	room = sanitize(room).xss();
	room = sanitize(room).entityEncode();
	
	isValid(room, function(valid, suggestion) {
		if (valid) {		
			if (req.loggedIn) {
				// convert string to array
				var rooms = req.user.chatrooms.split(',');

				if (!req.user.chatrooms) {
					// first time, set rooms to be a new array with just the room
					rooms = [room];
				} else {
					rooms = prependRoom(room, rooms);
				} 
				// convert array to string, update db
				client2.hset('user:'+req.user.id, 'chatrooms', rooms.join(), function() {
					res.render('chat', { 
						title: 'CalChat - Chat', 
						layout: 'layout-chat',
						loggedIn: req.loggedIn,
						showChatTab: true,
						rooms: rooms,
						index: 2
					});
				});
				return;
			} else {
				if (req.session.rooms && req.session.rooms.length) {
					req.session.rooms = prependRoom(room, req.session.rooms);
				} else {
					req.session.rooms = [room];
				}
				res.render('chat', { 
					title: 'CalChat - Chat', 
					layout: 'layout-chat',
					loggedIn: req.loggedIn,
					showChatTab: true,
					rooms: rooms,
					index: 2
				});
			}
		} else {
			// error: invalid chatroom

			if (suggestion) {
				return res.redirect('/chat/'+suggestion);
			} else {
				if (req.loggedIn) {
					return res.redirect('/dashboard?invalid='+room);
				} else {
					return res.redirect('/?error=2');
				}
			}
		}
	});
}

exports.archives = function(req, res) {
	if (req.loggedIn) {
		var room = req.params.room;

		res.render('archives', { 
			title: 'CalChat - '+room+' Archives', 
			layout: 'layout-archives',
			loggedIn: req.loggedIn,
			room: room,
			index: 3 //wtf should this be
		});
	} else {
		res.redirect('home');
	}
}

exports.invalid = function(req, res) {
	res.send('Error: Page Not Found', 404);
}

// prepends room to rooms (use this only if rooms exists!)
function prependRoom(room, rooms) {
	var index = -1;
	for (var i = 0; i < rooms.length; i++) {
		if (rooms[i] == room) {
			index = i;
		}
	}
	if (index == -1) {
		rooms.unshift(room);
	} else {
		rooms.unshift(rooms.splice(index, 1)[0]);
	}
	return rooms;
}

// query db to see if room is valid
function isValid(room, callback) {
	if (!room) {
		callback(false);
	} else {
		function stringScore(string) {
			string = string.toUpperCase();
			var hash = 0;

			for (var i = 0; i < string.length; i++) {
				hash += (string.charCodeAt(i) - '0'.charCodeAt()) / Math.pow('Z'.charCodeAt() - '0'.charCodeAt() + 1, i);
			}
			return hash;
		}
		var score = stringScore(room);
		client0.zrangebyscore('courses', score, score, 'limit', 0, 1, function(err, courses) {
			callback(!err && courses.length && courses[0].charAt(courses[0].length - 1) != '#', courses[0]);
		});
	}
}
