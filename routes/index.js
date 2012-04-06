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
	helper.debug('index');
	res.render('index', { 
		title: 'CalChat', 
		layout: 'layout-index', 
		loggedIn: req.loggedIn,
		showChatTab: (req.session.rooms && req.session.rooms.length) ? true : false,
		index: 0
	});
};

exports.dashboard = function(req, res) {
	helper.debug('dashboard');
	if (req.loggedIn) {
		// convert string to array
		var roomIds = req.user.chatrooms.split(',');

		helper.getAbbreviatedTitles(roomIds, function(rooms) {
			res.render('dashboard', {
				title: 'Dashboard',
				layout: 'layout-dashboard',
				loggedIn: req.loggedIn,
				showChatTab: true,
				rooms: rooms,
				index: 1
			});
		});
	} else {
		// error: cannot access /dashboard if not logged in
		res.redirect('/?error=0');
	}
};

exports.chat = function(req, res) {
	helper.debug('chat');
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
		res.redirect('/chat/'+helper.stripLow(rooms[0]));
	} else {
		// error: guest did not add any chats yet
		return res.redirect('/?error=1');
	}
};

exports.chatroom = function(req, res) {
	helper.debug('chatroom');
	var room = req.params.room;

	room = sanitize(room).xss();
	room = sanitize(room).entityEncode();
	
	helper.isValid(room, function(valid, rawId) {
		if (valid) {
			if (req.loggedIn) {
				var sessionRooms = req.session.rooms;
				var userChatrooms = req.user.chatrooms;
				var roomIds = null;

				if (!sessionRooms) {
					// logging in from /, not first time
					if (userChatrooms) {
						roomIds = helper.prependRoom(rawId, userChatrooms.split(','));
					// logging in from /, first time
					} else {
						roomIds = [rawId];
					}
				} else {
					req.session.redirectPath = undefined;
					// logging in from /chat, not first time
					if (userChatrooms) {
						sessionRooms.reverse();
						roomIds = userChatrooms.split(',');
						console.log(sessionRooms);
						for (var i = 0; i < sessionRooms.length; i++) {
							roomIds = helper.prependRoom(sessionRooms[i], roomIds);
						}
						req.session.rooms = null;
					// logging in from /chat, first time
					} else {
						roomIds = sessionRooms;
					}
				}

				// convert array to string, update db
				client2.hset('user:'+req.user.id, 'chatrooms', roomIds.join(), function() {
					helper.getAbbreviatedTitles(roomIds, function(rooms) {
						res.render('chat', {
							title: rooms[0].title+' Chatroom',
							layout: 'layout-chat',
							loggedIn: req.loggedIn,
							showChatTab: true,
							rooms: rooms,
							index: 2,
						});
					});
				});
				return;
			} else {
				if (req.session.rooms && req.session.rooms.length) {
					req.session.rooms = helper.prependRoom(rawId, req.session.rooms);
				} else {
					req.session.rooms = [rawId];
				}
				req.session.redirectPath = '/chat/'+req.session.rooms[0];

				helper.getAbbreviatedTitles(req.session.rooms, function(rooms) {
					res.render('chat', { 
						title: rooms[0].title+' Chatroom',
						layout: 'layout-chat',
						loggedIn: req.loggedIn,
						showChatTab: true,
						rooms: rooms,
						index: 2,
					});
				});
				return;
			}
		} else {
			// error: invalid chatroom
			if (req.loggedIn) {
				return res.redirect('/dashboard?invalid='+room);
			} else {
				return res.redirect('/?error=2');
			}
		}
	});
}

exports.archives = function(req, res) {
	helper.debug('archives');
	var room = req.params.room;

	helper.isValid(room, function(valid, rawId) {
		helper.getAbbreviatedTitle(rawId, function(pretty) {
			if (pretty) {
				res.render('archives', {
					title: pretty+' Archives',
					layout: 'layout-archives',
					loggedIn: req.loggedIn,
					showChatTab: true,
					room: rawId,
					title: pretty,
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
	helper.debug('authenticate');
	var room = req.params.room;
	helper.isValid(room, function(valid, rawId) {
		if (valid) {
			// mark says to always use rawId..
			req.session.redirectPath = '/chat/'+room;
			return res.redirect('/auth/facebook');
		} else {
			next();
		}
	});
}

exports.invalid = function(req, res) {
	helper.debug('invalid');
	res.send('Error: Page Not Found', 404);
}
