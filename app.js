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
		if (err == null) { // no errors
			if (Object.keys(reply).length == 0) { 
				// no user found, create new user
				client2.hmset('user:'+fbUserMetadata.id, {
					'id': fbUserMetadata.id, 
					'firstname': fbUserMetadata.first_name,
					'lastname': fbUserMetadata.last_name,
					'chatrooms': 'CAMPUS,CALCHAT',
					'unread': '',
					'firstlast': fbUserMetadata.first_name+fbUserMetadata.last_name,
					'oauth': accessToken,
					'founder': 0,
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
    	if (!ids) {
    		callback({});
    	}

        var users = {};
		var online = [];
		
        // INFO
        // this for loop is asynchronous (because of redis), so lots of things need to be done:
        for (var i = 0; i < ids.length; i++) {
            // create closure to make sure variables in one loop iteration don't overwrite the previous iterations
            var closure = function() {
                var id = ids[i];
                var name = null;
                var fail = false;
                client2.hget('user:'+id, 'firstname', function(err, firstname) {                    
                    name = firstname;
                    
                    if (!name) {
                        fail = true;
                    }
                });
                
                // 2nd callback function guaranteed to be called after 1st callback function above
                client2.hget('user:'+id, 'lastname', function(err, lastname) {
                    if (!fail) {
                        name = name + ' ' + lastname.charAt(0);
                    }
                });
                
                // use ping to guarantee call order
                client2.ping(function(){
                    if (!fail) {
                        users[id] = name;
                    }
                });
            }
            // immediately call the created closure
            closure();
        }
        
        // use ping to guarantee this callback is executed after all above callbacks have executed
        client2.ping(function(){
            callback(users);
        });
    }
	
	function error(err, socket) {
		socket.emit('error', err);
		helper.debug('Error: '+err);
	}

	function stringScore(string) {
		if (!string) return '-inf';

		string = helper.stripHigh(string);
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
		return '('+stringScore(cap);
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

		if (session.uid !== undefined && session.nick !== undefined) {
			socket.nickname = session.nick;
			
			getChatlog(current, 0, function(logs, mentions, room) {	
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
			getChatlog(current, 0, function(logs, mentions, room) {
				callback(logs, mentions, room);
			});
			io.sockets.in(current).emit('online', current, nicknames[current]);
		}
	});
	
	socket.on('leave room', function (room, callback) {
		helper.debug('leave room', room);
		if (session.uid !== undefined){
			delete nicknames[room][session.uid];
        
			// remove room from user's list of chatrooms
			client2.hget('user:'+session.uid, 'chatrooms', function(err, chatrooms) {
				if (!err){
					var rooms = chatrooms.split(',');
			
					//remove room from rooms
					rooms.splice(rooms.indexOf(room), 1);
					var newRooms = rooms.join();
					client2.hset('user:'+session.uid, 'chatrooms', newRooms, function(err, reply) {
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
		// remove room from user's list of chatrooms
		client2.hget('user:'+session.uid, 'chatrooms', function(err, chatrooms) {
			if (!err) {
				var rooms = chatrooms.split(',');
			
				//remove room from rooms
				rooms.splice(rooms.indexOf(room), 1);
			
				var newRooms = rooms.join();
				client2.hset('user:'+session.uid, 'chatrooms', newRooms);
			} else {
				error(err, socket);
			}
		});	
	});
	
	socket.on('get chatlog', getChatlog);
	function getChatlog(roomId, index, callback) {
		helper.debug('get chatlog', roomId);
		roomId = helper.stripHigh(roomId);

		if (index != -1) {
			//client2.hgetall()
		}

		// get last 30 messages
		client2.zrange('chatlog:'+roomId, -30, -1, function(err, chatlog) {
			if (!err) {
				helper.getRoomInfo(roomId, function(room) {
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
										mentions = mentions.split();
									} else {
										mentions = [];
									}

									allMentions = allMentions.concat(mentions, fromUid);
								
									var entry = {
										'from'		: fromUid,
										'to'		: roomId,
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
				});
			} else {
				error(err, socket);
				callback();
			}
		});
	}

	// emit online users as well as update user's chatroom list
	socket.on('get online', function (room) {
		helper.debug('get online', room);
		if (session.uid !== undefined) {
			// make this chatroom most recent in user's list
			client2.hget('user:'+session.uid, 'chatrooms', function(err, chatrooms) {
				if (!err){
					var rooms = chatrooms.split(',');
			
					// move room to front of rooms
					rooms.unshift(rooms.splice(rooms.indexOf(room), 1));
			
					var newChatrooms = rooms.join();

					client2.hset('user:'+session.uid, 'chatrooms', newChatrooms);
				} else {
					error(err, socket);
				}
			});
		}
		
		// send updated online users list
		socket.emit('online', room, nicknames[room]);
	});

	socket.on('message', function (room, msg, mentions) {
		helper.debug('message', room, msg, mentions);
		var text = msg;
		text = sanitize(text).xss();
		text = sanitize(text).entityEncode();
		if (session.uid !== undefined) {
			var timestamp = new Date().getTime();

			var temp = {};
			for (var i = 0; i < mentions.length; i++) {
				temp[mentions[i]] = null;
			};
			mentions = Object.keys(temp);

			client2.incr('message:id:next', function(err, mid) {
				getUsers(mentions.concat(session.uid), function(mapping) {
					var entry = {
						'from'		: session.uid,
						'to'		: room,
						'text'		: text,
						'mentions'	: mentions,
						'id'		: mid,
					};

					io.sockets.in(room).emit('message', entry, mapping);
				});
			
				if (!err) {
					client2.hmset('message:'+mid, {
						'from'		: session.uid,
						'to'		: room,
						'text'		: text,
						'timestamp'	: timestamp,
						'mentions'	: mentions.join(),
					});
					client2.zadd('chatlog:'+room, timestamp, mid);
			
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
        
		if (session.uid !== undefined) {
			for (room in nicknames) {
				delete nicknames[room][session.uid];
			}
        
			client2.hget('user:'+session.uid, 'chatrooms', function(err, reply) {
				if (!err) {
					if (reply) {
						var rooms = reply.split(',');
						for (var i = 0; i < rooms.length; i++) {
							var room = rooms[i];
							io.sockets.in(room).emit('announcement', room, socket.nickname + ' disconnected');
							io.sockets.in(room).emit('online', room, nicknames[room]);
						}
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
