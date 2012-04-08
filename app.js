/**
* Module dependencies.
*/

var express = require('express')
, sio = require('socket.io')
, everyauth = require('everyauth')
, redis = require('redis')
, parseCookie = require('connect').utils.parseCookie
, MemoryStore = express.session.MemoryStore
, sanitize = require('validator').sanitize
, util = require('util')
, routes = require('./routes')
, helper = require('./util.js');

var app = module.exports = express.createServer();
var sessionStore = new MemoryStore();

/**
* Redis
*/
var redisUrl = 'db.calchat.net';
var client0 = redis.createClient(null, redisUrl);
client0.select(0);
var client1 = redis.createClient(null, redisUrl);
client1.select(1);
var client2 = redis.createClient(null, redisUrl);
client2.select(2);
redis.debug_mode = false;

var SPECIAL_NONE		= 0;
var SPECIAL_FOUNDER		= 1;

/**
* Facebook Connect
*/
everyauth.everymodule.moduleTimeout(-1); // turn off timeouts (github issue #29)
everyauth.everymodule.findUserById(function (userId, callback) {
	// callback has the signature, function (err, user) {...}
	client2.hgetall('user:'+userId, callback);
});

everyauth.facebook.sendResponse(function(res, data) {
	res.redirect(data.session.redirectPath || this.redirectPath());
});

everyauth.facebook
.appId('297402036983700')
.appSecret('aad4c11b1b2ccbad5ea5d3632cc5d920')
.scope('email, user_about_me, read_friendlists')
.findOrCreateUser( function(session, accessToken, accessTokenExtra, fbUserMetadata) {
	var promise = this.Promise();
	var timeStamp = new Date().getTime();
	client2.hgetall('user:'+fbUserMetadata.id, function(err, reply) {
		if (!err) { // no errors
			if (Object.keys(reply).length == 0) { 
				// no user found, create new user
				client2.hmset('user:'+fbUserMetadata.id, {
					'id': fbUserMetadata.id, 
					'firstname': fbUserMetadata.first_name,
					'lastname': fbUserMetadata.last_name,
					'chatrooms': 'CALCHAT',
					'unread': timeStamp,
					'firstlast': fbUserMetadata.first_name+fbUserMetadata.last_name,
					'oauth': accessToken,
					'special': SPECIAL_NONE,
					'timestamp' : timeStamp,
					'gsirooms' : "",
				}, function() {
					client2.hgetall('user:'+fbUserMetadata.id, function(err, reply) {
						if (err == null) {
							promise.fulfill(reply);
						}
					})
				});
			} else { 
				promise.fulfill(reply);
			}
		} else {
			promise.fail(err);
			console.log('Error: '+err);
		}
	});
	return promise;
})
.redirectPath('/dashboard');

// App Configuration
app.configure(function() {
	app.set('views', __dirname + '/views');
	app.set('view engine', 'jade');
	app.use(express.bodyParser());
	app.use(express.methodOverride());
	app.use(express.favicon(__dirname + '/public/img/ico/favicon.ico', { maxAge: 2592000000 }));
	app.use(express.static(__dirname + '/public'));
	app.use(express.cookieParser());
	app.use(express.session({store: sessionStore
								, secret: 'nelarkonesse'
								, key: 'express.sid' }));
	app.use(everyauth.middleware());
});

everyauth.helpExpress(app);

app.configure('development', function(){
	app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
	app.use(express.errorHandler());
});

// Routes
app.get('/', routes.index);
app.get('/dashboard', routes.dashboard);
app.get('/chat', routes.chat);
app.get('/chat/:room', routes.chatroom); 
app.get('/chat/:room/archives', routes.archives);
app.get('/authenticate/:room', routes.authenticate);
app.get('*', routes.invalid);

app.listen(3000);

/**
* Socket.IO server (single process only)
*/
var io = sio.listen(app);
var nicknames = {};

io.set('log level', 1);
io.set('authorization', function(data, accept) {
	if (data.headers.cookie) {
		data.cookie = parseCookie(data.headers.cookie);
		data.sessionID = data.cookie['express.sid'];
		sessionStore.get(data.sessionID, function (err, session){
			if (err || !session) {
				accept('Error', false);
			} else {
				data.session = session;
				accept(null, true);
			}
		});
	} else {
		return accept('No cookie transmitted', false);
	}
	accept(null, true);
});

io.sockets.on('connection', function (socket) {
	var session = socket.handshake.session;
	helper.debug('connect');
	// msgs: list of messages to parse for ids. uids: list of ids to include
    function getMentions(msgs, uids) {
        var ids = {};
		
		if (uids) {
			for (var i = 0; i < uids.length; i++) {
				var uid = uids[i];
				ids[uid] = uid;
			}
		}
		
        // find all ids
        for (var k = 0; k < msgs.length; k++) {
            var msg = msgs[k];
            var slices = msg.split('#');
            for (var i = 0; i < slices.length; i++) {
                var slice = slices[i];
                var id = slice.substring(0, slice.indexOf('$'));
                // nicely removes duplicates
				if (id != '') {
                	ids[id] = id;
				}
            }
        }
        
        var idsList = [];
        for (id in ids) {
            idsList.push(id);
        }
		
		return idsList;
    }
    
    function getUsers(ids, callback) {
		helper.debug('getUsers', ids);
    	if (!ids || !Object.keys(ids).length) {
    		callback({});
    	}

        var users = {};
		
        // INFO
        // this for loop is asynchronous (because of redis), so lots of things need to be done:
        var added = 0;
        for (var i = 0; i < ids.length; i++) {
            // create closure to make sure variables in one loop iteration don't overwrite the previous iterations
            function closure() {
                var id = ids[i];
                client2.hgetall('user:'+id, function(err, user) {
                	added++;
                	if (!err && Object.keys(user).length) {
                		users[id] = {
                			name		: user.firstname+' '+user.lastname.charAt(0),
                			gsirooms	: user.gsirooms,
                			special		: user.special,
                		}
                	} else {
                		error(err, socket);
                	}

                	if (added == ids.length) {
                		callback(users);
                	}
                });
            }
            // immediately call the created closure
            closure();
        }
    }
	
	function error(err, socket) {
		socket.emit('error', err);
		helper.debug('Error: '+err);
	}

	function stringScore(string, strip) {
		if (!string) return '-inf';

		if (strip === undefined || strip) {
			string = helper.stripHigh(string);
		}
		
		var hash = 0;

		for (var i = 0; i < string.length; i++) {
			hash += (string.charCodeAt(i) - '0'.charCodeAt()) / Math.pow('Z'.charCodeAt() - '0'.charCodeAt() + 1, i);
		}
		return hash;
	}

	function capStringScore(string) {
		if (!string) return '+inf';

		string = helper.stripHigh(string);
		var last = string.charAt(string.length - 1);
		var next = String.fromCharCode(last.charCodeAt() + 1);
		var cap = string.substring(0, string.length - 1) + next;
		helper.debug('capStringScore', string, cap);
		return '('+stringScore(cap, false);
	}
	
	function getSockets(uids, exceptuid) {
		var sockets = [];
		for (var key in io.sockets.sockets) {
			var socket = io.sockets.socket(key);
			if (socket.uid != exceptuid && uids.indexOf(socket.uid) != -1) {
				sockets.push(socket);
			}
		}
		return sockets;
	}

	socket.on('initialize', function(roomIds, current, callback) {
		helper.debug('initialize', roomIds, current);

		// join rooms
		for (var i = 0; i < roomIds.length; i++) {
			var roomId = roomIds[i];
			if (!nicknames[roomId]) {
				nicknames[roomId] = {};
			}
			socket.join(roomId);
		}

		if (session !== undefined && session.uid !== undefined && session.nick !== undefined) {
			socket.nickname = session.nick;
			socket.uid = session.uid;
			
			getChatlog(current, function(logs, mentions, room) {	
				client2.hget('user:'+session.uid, 'chatrooms', function(err, chatrooms) {
					if (!err) {
						if (chatrooms) {
							var roomIds = chatrooms.split(',');
							for (var i = 0; i < roomIds.length; i++) {
								var roomId = roomIds[i];
								nicknames[roomId][session.uid] = socket.nickname;
								client2.zadd('users:'+roomId, stringScore(socket.nickname), session.uid);

								if (roomId != current) {
									io.sockets.in(roomId).emit('announcement', roomId, session.nick + ' connected');
									io.sockets.in(roomId).emit('online', roomId, nicknames[roomId]);
								}
							}

							callback(logs, mentions, room);
						} else {
							callback();
						}
						
							// TODO: can we just get rid of that if check on line 213 so we don't need this? 
							io.sockets.in(current).emit('announcement', current, session.nick + ' connected');
							io.sockets.in(current).emit('online', current, nicknames[current]);
						} else {
							error(err, socket);
							callback();
						}
					});

			});
		} else {
			getChatlog(current, function(logs, mentions, room) {
				callback(logs, mentions, room);
			});
			io.sockets.in(current).emit('online', current, nicknames[current]);
		}
	});
	
	socket.on('leave room', function (room, callback) {
		helper.debug('leave room', room);
		if (session !== undefined && session.uid !== undefined){
			delete nicknames[room][session.uid];

			client2.hmget('user:'+session.uid, 'unread', 'chatrooms', function (err, reply) {

				if (!err && reply[0] != null && reply[1] != null) {
					var rooms = reply[1].split(',');
					var index = rooms.indexOf(room);

					rooms.splice(index, 1);

					var unreads = reply[0].split(',');
					unreads.splice(index, 1);

					client2.hmset('user:'+session.uid, 'chatrooms', rooms.join(), 'unread', unreads.join(), function (err, reply) {
						callback();
					});
				} else {
					error(err, socket);
					callback();
				}
			});

			// remove user from chatroom's list of users
			client2.zrem('users:'+room, session.uid);
        
			io.sockets.in(room).emit('announcement', room, socket.nickname + ' disconnected');
			io.sockets.in(room).emit('online', room, nicknames[room]);
		} else {
			error("session.uid undefined", socket);
			callback();
		}
	});
	
	// remove room from the dashboard
	socket.on('remove room', function (room) {
		helper.debug('remove room', room);

		// remove room from user's list of chatrooms and unread
		client2.hmget('user:'+session.uid, 'chatrooms', 'unread', function(err, reply) {
			if (!err && reply[0] != null && reply[1] != null) {

				var rooms = reply[0].split(',');
				var unreads = reply[1].split(',');
				//remove room from rooms
				var index = rooms.indexOf(room);
				if (index != -1) {
					rooms.splice(index, 1);
					unreads.splice(index, 1)
				}
		
				client2.hmset('user:'+session.uid, 'chatrooms', rooms.join(), 'unread', unreads.join());
			} else {
				error(err, socket);
			}
		});	
	});
	
	socket.on('get chatlog', getChatlog);
	function getChatlog(roomId, callback) {
		helper.debug('get chatlog', roomId);
		roomId = helper.stripHigh(roomId);

		if (session !== undefined && session.uid !== undefined) {
			// make this chatroom most recent in user's list
			client2.hmget('user:'+session.uid, 'chatrooms', 'unread', function(err, reply) {
				if (!err && reply[0] != null && reply[1] != null){
					var rooms = reply[0].split(',');
					var unreads = reply[1].split(',');
			
					// move room to front of rooms
					var index = rooms.indexOf(roomId);
					rooms.unshift(rooms.splice(index, 1));
					unreads.unshift(unreads.splice(index, 1));
					client2.hmset('user:'+session.uid, 'chatrooms', rooms.join(), 'unread', unreads.join());
				} else {
					error(err, socket);
				}
			});
		}

		// get last 30 messages
		helper.getRoomInfo(roomId, function(room) {
			if (room.type == 'private') {
				if (!session || !session.uid) {
					error('No permissions: Guests cannot access '+room.id, socket);
					callback({}, {}, room);
					return;
				}
				
				if(!room.readable(session.uid)) {
					// not permitted
					error('No permissions: '+session.uid+' cannot access '+room.id, socket);
					callback({}, {}, room);
					return;
				}
			}
			
			client2.zrange('chatlog:'+room.id, -30, -1, function(err, chatlog) {
				if (!err) {
						if (chatlog.length == 0) {
							callback({}, {}, room);
							return;
						}
					
						var logs = {};
						var allMentions = [];
						var added = 0;
						for (var i = 0; i < chatlog.length; i++) {
							function closure() {
								var mid = chatlog[i];
								client2.hmget('message:'+mid, 'timestamp', 'from', 'text', 'mentions', function(err, message) {
									added++;
									if (!err){
										var timestamp = message[0];
										var fromUid = message[1];
										var text = message[2];
										var mentions = message[3]; // turn into array later

										if (mentions) {
											mentions = mentions.split(',');
										} else {
											mentions = [];
										}

										allMentions = allMentions.concat(mentions, fromUid);
									
										var entry = {
											'from'		: fromUid,
											'to'		: room.id,
											'text'		: text,
											'mentions'	: mentions,
											'id'		: mid,
										};
										logs[timestamp] = entry;
									} else {
										error(err, socket);
									}
									
									if (added == chatlog.length) {
										getUsers(allMentions, function(mapping) {
											callback(logs, mapping, room);
										});
									}
								});
							}
							closure();
						}
				} else {
					error(err, socket);
					callback({}, [], room);
				}
			});
		});
	}

	// emit online users as well as update user's chatroom list
	socket.on('get online', function (room) {
		helper.debug('get online', room);
		
		// send updated online users list
		socket.emit('online', room, nicknames[room]);
	});

	socket.on('message', function (roomId, msg, mentions) {
		helper.debug('message', roomId, msg, mentions);
		
		console.log(io.sockets.in(roomId));
		
		var text = msg;
		text = sanitize(text).xss();
		text = sanitize(text).entityEncode();
		if (session !== undefined && session.uid !== undefined) {
			var timestamp = new Date().getTime();
			var isGSI = false;
			getUsers(mentions.concat(session.uid), function(mapping){
				helper.getRoomInfo(roomId, function(room) {
					var user = mapping[session.uid];
					var rooms = user.gsirooms.split(',');
					for (var i = 0; i < rooms.length; i++){
						if (rooms[i] == roomId){
							isGSI = true;
						}
					}
					if (isGSI && msg.charAt(0) == '/') {
						var commandEnd = msg.indexOf(' ');
						if (commandEnd == -1) commandEnd = msg.length;
						var command = msg.substring(1, commandEnd);
						var commandMsg = msg.substring(commandEnd).trim();
						
						switch(command.toUpperCase()) {
							case 'KICK':
							case 'BAN':
							
							var othersockets = getSockets(mentions, session.uid);
							for (var i = 0; i < othersockets.length; i++) {
								var s = othersockets[i];
								s.emit(command.toLowerCase(), room, user, commandMsg);
							};
							
							var capitalcommand = command.charAt(0).toUpperCase()+command.substring(1);
							socket.emit('announcement', roomId, capitalcommand+' '+othersockets.length+' user(s) with message: '+commandMsg);
							
							return;
							default:
							break;
						}
					}
					var temp = {};
					for (var i = 0; i < mentions.length; i++) {
						temp[mentions[i]] = null;
					};
					mentions = Object.keys(temp);

					client2.incr('message:id:next', function(err, mid) {
						if (!err) {
							var entry = {
								'from'		: session.uid,
								'to'		: roomId,
								'text'		: text,
								'mentions'	: mentions,
								'id'		: mid,
							};
							
							if (room.type == 'private') {
								var other = room.other(session.uid);
								var othersocket = getSockets([other])[0];
								if (othersocket) {
									othersocket.emit('private chat', roomId, entry, mapping);
								}

								client2.hmget('user:'+other, 'chatrooms', 'unread', function(err, user) {
									if (!err) {
										var roomsArray = user[0].split(',');
										var unreadsArray = user[1].split(',');
										helper.prependRoom(roomId, unreadsArray, roomsArray);
										client2.hmset('user:'+other, 'chatrooms', roomsArray.join(), 'unreads', unreadsArray.join());
									}
								});
							}
							
							io.sockets.in(roomId).emit('message', entry, mapping);
							
							client2.hmset('message:'+mid, {
								'from'		: session.uid,
								'to'		: roomId,
								'text'		: text,
								'mentions'	: mentions.join(),
								'timestamp'	: timestamp,
							});
							client2.zadd('chatlog:'+roomId, timestamp, mid);
							
							for (var i = 0; i < mentions.length; i++) {
								var id = mentions[i];
								client2.exists('user:'+id, function(err, exists) {
									if (exists) {
										client2.zadd('mentions:'+id, timestamp, mid);
									}
								});
							}
						} else {
							error(err, socket);
						}
					});
				});
			});
		} else {
			error("session.uid not defined", socket);
		}
	});

	socket.on('get nearest buildings', function (lat, lng, limit, callback) {
		function dist (lat1, lng1, lat2, lng2) {
			var R = 6371; // km
			var dLat = (lat2-lat1) * Math.PI / 180;
			var dLon = (lng2-lng1) * Math.PI / 180;
			var lat1 = lat1 * Math.PI / 180;
			var lat2 = lat2 * Math.PI / 180;

			var a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.sin(dLon/2) * Math.sin(dLon/2) * Math.cos(lat1) * Math.cos(lat2); 
			var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
			var d = R * c;
			return d;
		}

		helper.debug('get nearest buildings', lat, lng, limit);
		client0.hgetall("location:all", function (err, locations) {
			if (!err) {
				var coordinates = [];
				for (var key in locations) {
					coordinates.push(key);
				}

				//sort coordinates from nearest to furthest
				coordinates.sort(function(a,b) {
					var latA = a.split(",")[0];
					var lngA = a.split(",")[1];
					var distA = dist(lat, lng, latA, lngA);
					var latB = b.split(",")[0];
					var lngB = b.split(",")[1];
					var distB = dist(lat, lng, latB, lngB);

					return distA - distB;
				});

				var buildings = [];
				var added = 0;
				for (var i = 0; i < limit; i++) {
					function closure() {						
						var coordinate = coordinates[i];
						var lat2 = coordinate.split(",")[0];
						var lng2 = coordinate.split(",")[1];
						var id = locations[coordinate];
						var distance = dist(lat,lng,lat2,lng2);

						client0.hgetall('location:'+id, function(err, location) {
							added++;
							if (!err) {
								location.distance = distance;
								location.pretty = location.name;
								buildings.push(location);
							} else {
								error(err, socket);
							}

							if (added == limit) {
								callback(buildings);
							}
						});
					}
					closure();
				}
			} else {
				error(err, socket);
				callback();
			}
		});
	});
    
	socket.on('get users', function(room, filter, limit, callback) {
		helper.debug('get users', room, filter, limit);
		client2.zrangebyscore('users:'+room, stringScore(filter), capStringScore(filter), 'limit', 0, limit, function(err, ids) {
			if (!err) {
				getUsers(ids, function(users) {
					var online = [];
					var offline = [];
				
					for (id in users) {					
						if (nicknames[room][id]) {
							online.push(id);
						} else {
							offline.push(id);
						}
					}
					callback(users, online, offline);
				});
			} else {
				callback();
			}
		});
	});
	
	socket.on('get validrooms', function(query, limit, callback) {		
		helper.debug('get validrooms', query, limit);
		query = helper.stripHigh(query);
		
		if (!query || !limit) {
			callback([]);
		} else {
			helper.debug(stringScore(query), capStringScore(query));
			client0.zrangebyscore('validrooms', stringScore(query), capStringScore(query), 'limit', 0, limit, function(err, ids) {
				if (!err) {
					if (ids.length == 0) {
						callback([]);
						return;
					}

					var rooms = {};
					var added = 0;
					for (var i = 0; i < ids.length; i++) {
						// use closure so var id isn't changed by next loop iteration before callback
						var closure = function() {
							var id = ids[i];

							// check if id is an abbreviation
							if (id.charAt(id.length - 1) == '#') {
								id = id.substring(0, id.length - 1);
							}

							helper.getRoomInfo(id, function(room) {
								added++;
								rooms[id] = room;

								if (added == ids.length) {
									var objects = [];
									for (id in rooms) {
										objects.push(rooms[id]);
									}
									callback(objects);
								}
							});
						}
						closure();
					}
				} else {
					error(err, socket);
					callback();
				}
			});
		}
	});

	socket.on('disconnect', function () {
		helper.debug('disconnect');
		if (!socket.nickname) return;
        
		if (session && session.uid !== undefined) {
			for (room in nicknames) {
				delete nicknames[room][session.uid];
			}

			client2.hmget('user:'+session.uid, 'chatrooms', 'unread', function(err, reply) {
				if (!err && reply[0] != null && reply[1] != null) {
					var rooms = reply[0].split(',');
					var unreads = reply[1].split(',');
					var time = new Date().getTime();

					// do not run if array is [''] (which happens b/c ''.split(',') becomes [''])
					if (rooms.length && reply[0]) {
						for (var i = 0; i < rooms.length; i++) {
							var room = rooms[i];

							// update unreads to time of d/c
							unreads[i] = time;

							io.sockets.in(room).emit('announcement', room, socket.nickname + ' disconnected');
							io.sockets.in(room).emit('online', room, nicknames[room]);
						}
						client2.hset('user:'+session.uid, 'unread', unreads.join());
					}
				} else {
					error(err, socket);
				}
			});
		} else {
			error("session.uid not defined", socket);
		}
	});
});

console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
