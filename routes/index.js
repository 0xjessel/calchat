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
	helper.debug('index', req.session);
	res.render('index', { 
		title: 'CalChat', 
		layout: 'layout-index', 
		loggedIn: req.loggedIn,
		showChatTab: (req.session.rooms && req.session.rooms.length) ? true : false,
		index: 0
	});
};

exports.dashboard = function(req, res) {
	function finished(rooms) {
		res.render('dashboard', {
			title: 'Dashboard',
			layout: 'layout-dashboard',
			loggedIn: req.loggedIn,
			showChatTab: true,
			rooms: rooms,
			index: 1,
		});
	}
	helper.debug('dashboard', req.user);
	if (req.loggedIn) {
		helper.postAuthenticate(req);

		// convert string to array
		var roomIds = req.user.chatrooms.split(',');
		helper.getRoomsInfo(roomIds, function(rooms) {
			if (rooms[0] != null) {
				client2.hget('user:'+req.user.id, 'unread', function (err, unread) {
					if (!err) {
						var unreads = unread.split(',');
						if (unreads.length > 0) {
							var added = 0;
							for (var i = 0; i < rooms.length; i++) {
								function closure() {
									var cur = new Date().getTime();
									var prev = unreads[i];
									var room = rooms[i].id;
									client2.zcount('chatlog:'+room, prev, cur, function (err, count) {
										added++;
										if (!err) {			
											room.unread = count;
										}
										if (added == rooms.length) {
											//succeed
											finished(rooms);
										}
									});
								}
								closure();
							}
						} else {
							// fail
							finished(rooms);
						}
					} else {
						// fail
						finished(rooms);
					}
				});
			} else {
				// fail
				finished(rooms);
			}
		});
	} else {
		// error: cannot access /dashboard if not logged in
		res.redirect('/?error=0');
	}
};

exports.chat = function(req, res) {
	helper.debug('chat', req.user, req.session);
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
		helper.getRoomInfo(rooms[0], function(room) {
			res.redirect('/chat/'+helper.stripLow(room.pretty));
		});
	} else {
		// error: guest did not add any chats yet
		return res.redirect('/?error=1');
	}
};

exports.chatroom = function(req, res) {
	helper.debug('chatroom', req.params, req.session, req.user);
	var room = req.params.room;

	room = sanitize(room).xss();
	room = sanitize(room).entityEncode();
	
	helper.isValid(room, function(valid, rawId) {
		if (valid) {
			if (req.loggedIn) {
				helper.postAuthenticate(req);

				var sessionRooms = undefined;
				var userChatrooms = undefined;
				var unreads = undefined;
				var roomIds = null;

				if (req.session.rooms != undefined) {
					sessionRooms = req.session.rooms;
				}
				if (req.user.chatrooms != "") {
					userChatrooms = req.user.chatrooms.split(',');
				}
				if (req.user.unread != "") {
					unreads = req.user.unread.split(',');
				}
				if (sessionRooms === undefined && userChatrooms === undefined && req.user.unread === undefined) {
					req.send(404);
				}

				if (!sessionRooms) {
					// logging in from /, not first time
					if (userChatrooms) {
						helper.prependRoom(rawId, unreads, userChatrooms);
					// logging in from /, first time
					} else {
						userChatrooms = [rawId];
						unreads = [new Date().getTime()];
					}
				} else {
					req.session.redirectPath = undefined;
					// logging in from /chat, not first time
					if (userChatrooms) {
						sessionRooms.reverse();
						for (var i = 0; i < sessionRooms.length; i++) {
							helper.prependRoom(sessionRooms[i], unreads, userChatrooms);
						}
						req.session.rooms = null;
					// logging in from /chat, first time
					} else {
						userChatrooms = sessionRooms;
					}
				}

				// convert array to string, update db
				client2.hmset('user:'+req.user.id, 'chatrooms', userChatrooms.join(), 'unread', unreads.join(), function() {
					helper.getRoomsInfo(userChatrooms, function(rooms) {
						res.render('chat', {
							title: rooms[0].pretty+' Chatroom',
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
					req.session.rooms = helper.prependRoom(rawId, undefined, req.session.rooms);
				} else {
					req.session.rooms = [rawId];
				}
				req.session.redirectPath = '/chat/'+req.session.rooms[0];

				helper.getRoomsInfo(req.session.rooms, function(rooms) {
					res.render('chat', { 
						title: rooms[0].pretty+' Chatroom',
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
	helper.debug('archives', req.params);
	var room = req.params.room;

	helper.isValid(room, function(valid, rawId) {
		helper.getRoomInfo(rawId, function(room) {
			if (room) {
				res.render('archives', {
					title: room.pretty+' Archives',
					layout: 'layout-archives',
					loggedIn: req.loggedIn,
					showChatTab: true,
					room: room,
					title: room.pretty,
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
	helper.debug('authenticate', req.params);
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
