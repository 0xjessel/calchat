var util = require('util')
, everyauth = require('everyauth')
, redis = require('redis');

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
		title: 'CalChat', 
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
			title: 'CalChat',
			layout: 'layout-dashboard',
			loggedIn: req.loggedIn,
			showChatTab: true,
			rooms: rooms,
			index: 1
		});
	} else {
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
			title: 'CalChat', 
			layout: 'layout-chat',
			loggedIn: req.loggedIn,
			showChatTab: true,
			rooms: rooms,
			index: 2
		});
	} else {
		return res.redirect('/?error=1');
	}
};

exports.chatroom = function(req, res) {
	var room = req.params.room;
	room = room.toUpperCase();
	
	isValid(room, function(valid) {
		console.log('valid: '+valid);

		if (valid) {		
			if (req.loggedIn) {
				// convert string to array
				var rooms = req.user.chatrooms.split(',');

				if (!req.user.chatrooms) {
					// first time, set rooms to be a new array with just the room
					rooms = [room];
				} else {
					var found = false;
					// check if room already exists inside rooms
					for (var i = 0; i < rooms.length; i++) {
						if (rooms[i] == room) {
							// move room to front of array and return
							rooms.unshift(rooms.splice(i, 1).join());
							found = true;
						}
					}

					if (!found) {
						// prepend room to rooms, client-side will connect to the first room in rooms
						rooms.unshift(room);
					}
				} 
				// update db
				client2.hset('user:'+req.user.id, 'chatrooms', rooms.join(), function() {
					return res.redirect('/chat');
				});
				return;
			} else {
				if (req.session.rooms && req.session.rooms.length) {
					var rooms = req.session.rooms;
					rooms.unshift(room);
				} else {
					req.session.rooms = [room];
				}
				return res.redirect('/chat');
			}
		} else {
			if (req.loggedIn) {
				return res.redirect('/dashboard?error=2');
			} else {
				return res.redirect('/?error=2');
			}
		}
	});
}

exports.archives = function(req, res) {
	if (req.loggedIn) {
		var room = req.params.room;

		res.render('archives', { 
			title: 'CalChat', 
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
	res.send('what you say??', 404);
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
		client0.zcount('courses', score, score, function(err, count) {
			console.log('room: '+room+' is '+!err&&count);
			callback(!err && count);
		});
	}
}
