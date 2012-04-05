var util = require('util')
, helper = require('../util.js')
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
		res.redirect('/chat/'+rooms[0]);
	} else {
		// error: guest did not add any chats yet
		return res.redirect('/?error=1');
	}
};

exports.chatroom = function(req, res) {
	var room = req.params.room;
	room = helper.strip(room);
	
	room = sanitize(room).xss();
	room = sanitize(room).entityEncode();
	
	helper.isValid(room, function(valid, suggestion) {
		if (valid) {		
			if (req.loggedIn) {
				var sessionRooms = req.session.rooms;
				var userChatrooms = req.user.chatrooms;
				var rooms = null;
				console.log(sessionRooms);
				console.log(userChatrooms);

				if (!sessionRooms) {
					// logging in from /, not first time
					if (userChatrooms) {
						rooms = helper.prependRoom(room, userChatrooms.split(','));
					// logging in from /, first time
					} else {
						rooms = [room];
					}
				} else {
					req.session.redirectPath = undefined;
					// logging in from /chat, not first time
					if (userChatrooms) {
						rooms = userChatrooms.split(',');
						for (var i = 0; i < sessionRooms.length; i++) {
							rooms = helper.prependRoom(sessionRooms[i], rooms);
						}
					// logging in from /chat, first time
					} else {
						rooms = sessionRooms;
					}

				}
				console.log(rooms);

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
					req.session.rooms = helper.prependRoom(room, req.session.rooms);
				} else {
					req.session.rooms = [room];
				}
				req.session.redirectPath = '/chat/'+req.session.rooms[0];
				res.render('chat', { 
					title: 'CalChat - Chat', 
					layout: 'layout-chat',
					loggedIn: req.loggedIn,
					showChatTab: true,
					rooms: req.session.rooms,
					index: 2
				});
				return;
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
	var room = req.params.room;
	helper.isValid(room, function(valid, suggestion) {
		helper.getPrettyTitle(suggestion, function(pretty, err) {
			if (!err) {
				room = pretty;
				res.render('archives', { 
					title: 'CalChat - '+room+' Archives', 
					layout: 'layout-archives',
					loggedIn: req.loggedIn,
					showChatTab: true,
					room: room,
					today: new Date().toDateString(),
					index: 3 //wtf should this be
				});
			} else {
				console.log('archives failed to get pretty title');
				res.redirect('home');
			}
		});
	});
}

exports.authenticate = function (req, res, next) {
	var room = req.params.room;
	helper.isValid(room, function(valid, suggestion) {
		if (valid) {
			// mark says to always use suggestion..
			req.session.redirectPath = '/chat/'+suggestion;
			return res.redirect('/auth/facebook');
		} else {
			next();
		}
	});
}

exports.invalid = function(req, res) {
	res.send('Error: Page Not Found', 404);
}
