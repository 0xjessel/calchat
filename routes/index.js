// Routing code

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
		index: 0,
	});
};

// displays /dashboard
exports.dashboard = function(req, res) {
	function finished(rooms) {
		// ask user for phone number if not set
		client2.hmget('user:'+req.user.id, 'phone', 'timestamp', function (err, reply) {
			var hasPhoneNum = false;
			var firstTimeUser = false;
			if (!err && reply[0] && reply[1]) {
				if (reply[0].length == 10) {
					if(helper.isPhoneNum(reply[0])) {
						hasPhoneNum = true;
					}
				}
				if(reply[1] + 30000 > Date.now()){
					firstTimeUser = true;
				}
			}
			res.render('dashboard', {
				title: 'Dashboard',
				layout: 'layout-dashboard',
				loggedIn: req.loggedIn,
				showChatTab: true,
				hasPhoneNum: hasPhoneNum,
				rooms: rooms,
				index: 1,
			});
		});
	}
	helper.debug('dashboard', req.user);
	if (req.loggedIn) {
		helper.postAuthenticate(req);

		// convert string to array
		var roomIds = req.user.chatrooms.split(',');
		helper.getRoomsInfo(roomIds, req.user.id, function(rooms) {
			if (rooms[0] != null) {
				client2.hget('user:'+req.user.id, 'unreads', function (err, unread) {
					if (!err && unread != null) {
						var unreads = unread.split(',');
						if (unreads.length > 0) {
							var added = 0;
							for (var i = 0; i < rooms.length; i++) {
								function closure() {
									var cur = new Date().getTime();
									var prev = unreads[i];
									var room = rooms[i];
									client2.zcount('chatlog:'+room.id, prev, cur, function (err, count) {
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

// redirect /chat to latest /chat/room
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
		helper.getRoomInfo(rooms[0], req.loggedIn ? req.user.id : null, function(room) {
			res.redirect('/chat/'+room.url);
		});
	} else {
		// error: guest did not add any chats yet
		return res.redirect('/?error=1');
	}
};

// displays /chat/room
exports.chatroom = function(req, res) {
	helper.debug('chatroom', req.params, req.session, req.user);
	var room = req.params.room;

	room = sanitize(room).xss();
	room = sanitize(room).entityEncode();
	
	helper.isValid(room, req.loggedIn ? req.user.id : null, function(valid, rawId) {
		if (valid) {
			if (req.loggedIn) {
				helper.postAuthenticate(req);

				var sessionRooms = undefined;
				var userChatrooms = [];
				var unreads = [];

				if (req.session.rooms != undefined) {
					sessionRooms = req.session.rooms;
				}
				if (req.user.chatrooms != "") {
					userChatrooms = req.user.chatrooms.split(',');
				}
				if (req.user.unreads != "") {
					unreads = req.user.unreads.split(',');
				}
				if (sessionRooms === undefined && userChatrooms === undefined && req.user.unreads === undefined) {
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
				client2.hmset('user:'+req.user.id, 'chatrooms', userChatrooms.join(), 'unreads', unreads.join(), function() {
					helper.getRoomsInfo(userChatrooms, req.user.id, function(rooms) {
						res.render('chat', {
							title: rooms[0].pretty,
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
				// not logged in
				if (req.session.rooms && req.session.rooms.length) {
					helper.prependRoom(rawId, undefined, req.session.rooms);
				} else {
					req.session.rooms = [rawId];
				}
				req.session.redirectPath = '/chat/'+req.session.rooms[0];

				helper.getRoomsInfo(req.session.rooms, null, function(rooms) {
					if (rooms.length) {
						res.render('chat', { 
							title: rooms[0].pretty+' Chatroom',
							layout: 'layout-chat',
							loggedIn: req.loggedIn,
							showChatTab: true,
							rooms: rooms,
							index: 2,
						});
					} else {
						res.redirect('/dashboard?invalid='+room);
					}
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

// displays /chat/room/archives
exports.archives = function(req, res) {
	helper.debug('archives', req.params);
	var room = req.params.room;
	
	if (req.loggedIn) {
		helper.isValid(room, req.user.id, function(valid, rawId) {
			if (valid) {
				helper.getRoomInfo(rawId, req.user.id, function(room) {
					if (room) {
						var before = new Date();
						before.setHours(0,0,0,0);
						var after = new Date();
						
						var pretty = room.pretty;
						if (room.type == 'private') {
							var idsplit = room.id.split('::')[0].split(':');
							var prettysplit = room.pretty.split(':');
							pretty = req.user.id == idsplit[1] ? prettysplit[0] : prettysplit[1];
						}
						
						res.render('archives', {
							title: pretty+' Archives',
							layout: 'layout-archives',
							loggedIn: req.loggedIn,
							showChatTab: true,
							room: room,
							title: pretty,
							begin: before.getTime(),
							end: after.getTime(),
							index: 9
						});
					} else {
						res.redirect('home');
					}
				});
			} else {
				res.redirect('home');
			}
		});
	} else {
		res.redirect('home');
	}
}

exports.features = function (req, res) {
	res.render('features', {
		title: 'Features | CalChat',
		layout: 'layout-features',
		loggedIn: req.loggedIn,
		showChatTab: (req.session.rooms && req.session.rooms.length) ? true : false,
		index: 3
	});
}

exports.about = function (req, res) {
	res.render('about', {
		title: 'About | CalChat',
		layout: 'layout-about',
		loggedIn: req.loggedIn,
		showChatTab: (req.session.rooms && req.session.rooms.length) ? true : false,
		index: 4
	});
}

exports.feedback = function (req, res) {
	res.render('feedback', {
		title: 'Feedback | CalChat',
		layout: 'layout-about',
		loggedIn: req.loggedIn,
		showChatTab: (req.session.rooms && req.session.rooms.length) ? true : false,
		index: 6
	});
}

exports.preferences = function (req, res) {
	if (req.loggedIn) {
		res.render('preferences', {
			title: 'Preferences | CalChat',
			layout: 'layout-preferences',
			loggedIn: req.loggedIn,
			user: req.user,
			showChatTab: (req.session.rooms && req.session.rooms.length) ? true : false,
			index: 7
		});
	} else {
		// must be logged in to use preferences
		res.redirect('/?error=0');
	}
}

exports.authenticate = function (req, res, next) {
	helper.debug('authenticate', req.params);
	var room = req.params.room;
	req.session.redirectPath = '/chat/'+room;
	return res.redirect('/auth/facebook');
}

exports.invalid = function(req, res) {
	helper.debug('invalid');
	res.send('Error: Page Not Found', 404);
}
