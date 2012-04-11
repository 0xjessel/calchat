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

// for the user: special field
var SPECIAL_NONE		= 0;
var SPECIAL_FOUNDER		= 1;
var SPECIAL_ADMIN		= 2;

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
.scope('email, user_about_me')
.findOrCreateUser( function(session, accessToken, accessTokenExtra, fbUserMetadata) {
	var promise = this.Promise();
	var timeStamp = new Date().getTime();
	// try to find user in db
	client2.hgetall('user:'+fbUserMetadata.id, function(err, reply) {
		if (!err) { // no errors
			if (Object.keys(reply).length == 0) { 
				// no user found, create new user
				client2.hmset('user:'+fbUserMetadata.id, {
					'id': fbUserMetadata.id, 
					'firstname': fbUserMetadata.first_name,
					'lastname': fbUserMetadata.last_name,
					'email': fbUserMetadata.email,
					'phone': "",
					'chatrooms': 'CALCHAT',
					'unread': timeStamp,
					'nick': fbUserMetadata.first_name+' '+fbUserMetadata.last_name.charAt(0),
					'oauth': accessToken,
					'special': SPECIAL_NONE,
					'timestamp' : timeStamp,
					'gsirooms' : "",
				}, function() {
					// add user to validrooms so other users can search for him
					client0.zadd('validrooms',
						helper.stringScore(fbUserMetadata.first_name+fbUserMetadata.last_name.charAt(0)),
						fbUserMetadata.id);
					// fetch the user we just saved to db
					client2.hgetall('user:'+fbUserMetadata.id, function(err, reply) {
						if (err == null) {
							promise.fulfill(reply);
						}
					})
				});
			} else { 
				// fetch the user we just saved to db
				promise.fulfill(reply);
			}
		} else {
			// there were errors getting user from db
			promise.fail(err);
			console.log('Error: '+err, 'auth');
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
app.get('/features', routes.features);
app.get('/about', routes.about);
app.get('*', routes.invalid);

app.listen(3000);

/**
* Socket.IO server (single process only)
*/
var io = sio.listen(app);
var nicknames = {};

io.set('transports', ['xhr-polling']);
io.set('polling duration', 10);
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

// client connects
io.sockets.on('connection', function (socket) {
	var session = socket.handshake.session;
	helper.debug('connect');
	
	// msgs: list of messages to parse for ids. uids: list of ids to include
	// return: list of ids
    function getMentions(msgs, uids) {
        var ids = {};
		
		//deduplication
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
        
        // turn deduplication assoc array into list
        var idsList = [];
        for (id in ids) {
            idsList.push(id);
        }
        
		return idsList;
    }
	
	function error(err, socket, msg) {
		socket.emit('error', err);
		helper.debug('Error: '+err+': '+msg);
	}
	
	//uids: list of user ids. exceptuid: exclude this user id
	//returns: list of sockets which correspond to the uids
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
	
	// sent by client when it loads /chat/..
	// roomIds: list of room ids that the user wants to join. current: active chatroom id
	// callback: same callback as get chatlog. see getChatlog()
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

		// if the user is logged in
		if (session !== undefined && session.uid !== undefined && session.nick !== undefined) {
			socket.nickname = session.nick;
			socket.uid = session.uid;
			
			getChatlog(current, null, null, function(logs, mentions, room) {	
				client2.hget('user:'+session.uid, 'chatrooms', function(err, chatrooms) {
					if (!err) {
						if (chatrooms) {
							// add the client to the user list of each chatroom
							var roomIds = chatrooms.split(',');
							for (var i = 0; i < roomIds.length; i++) {
								var roomId = roomIds[i];
								nicknames[roomId][session.uid] = socket.nickname;
								client2.zadd('users:'+roomId, helper.stringScore(socket.nickname), session.uid);
							}

							callback(logs, mentions, room);
						} else {
							callback();
						}
						
						// send renewed online list to all chatrooms
						for (var i = 0; i < roomIds.length; i++) {
							// use closure to prevent iteration i vars from being overwritten by iteration i+1
							(function closure() {
								var roomId = roomIds[i];
								
								// mapping is needed to convert user ids to user names
								helper.getUsers(Object.keys(nicknames[roomId]), function(mapping) {
									io.sockets.in(roomId).emit('online', roomId, mapping);
								});
							})();
						}
					} else {
						error(err, socket, 'initialize');
						callback();
					}
				});
			});
		} else { // the user is not logged in
			// allow guests to view chat rooms
			getChatlog(current, null, null, function(logs, mentions, room) {
				callback(logs, mentions, room);
			});
			helper.getUsers(Object.keys(nicknames[current]), function(mapping) {
				io.sockets.in(current).emit('online', current, mapping);
			});
		}
	});
	
	// called from chat.js
	// room: removes client from room
	// callback: empty
	socket.on('leave room', function (room, callback) {
		helper.debug('leave room', room);
		helper.getUsers(Object.keys(nicknames[room]), function(mapping) {
			// can only leave room if logged in
			if (session !== undefined && session.uid !== undefined){
				// removes the client's nickname
				delete nicknames[room][session.uid];

				client2.hmget('user:'+session.uid, 'unread', 'chatrooms', function (err, reply) {
					// removes room from client's list of chatrooms
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
						error(err, socket, 'leave room');
						callback();
					}
				});

				// remove user from chatroom's list of users
				client2.zrem('users:'+room, session.uid);
	        	// broadcast new online users list
				io.sockets.in(room).emit('online', room, mapping);
			} else {
				error("session.uid undefined", socket, 'leave room');
				callback();
			}
		});
	});
	
	// called from dashboard.js
	// almost same code as 'leave room' except doesn't have to worry about disconnecting the socket
	// room: remove client from this room
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
				error(err, socket, 'remove room');
			}
		});	
	});
	
	// client requests the chatlog for a room
	// roomId: the room that the client wants to access
	// min, max: optional: If specified, only messages between the min and max timestamps are returned.
	// if min and max are not specified, getChatlog returns the 30 newest messages
	// callback: passes 3 things
	// 		logs: associative array of timestamp to message object
	//		mapping: associative array of user ids to user objects. This is needed for the @mentions function
	//		room: object representing the chat room
	socket.on('get chatlog', getChatlog);
	function getChatlog(roomId, min, max, callback) {
		helper.debug('get chatlog', roomId);
		// sanitize input
		roomId = helper.stripHigh(roomId);

		// reset unread counts for logged in users
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
					error(err, socket, 'get chatlog');
				}
			});
		}

		// get last 30 messages or all messages between min and max
		helper.getRoomInfo(roomId, null, function(room) {
			if (room.type == 'private') {
				// guest users cannot see private chats
				if (!session || !session.uid) {
					error('No permissions: Guests cannot access '+room.id, socket);
					callback({}, {}, room);
					return;
				}
				
				// clients cannot see private chats that they do not belong to
				if(!room.readable(session.uid)) {
					// not permitted
					error('No permissions: '+session.uid+' cannot access '+room.id, socket);
					callback({}, {}, room);
					return;
				}
			}
			
			// optional min and max parameters are provided. Return messages between min and max timestamps
			if (min && max) {
				client2.zrangebyscore('chatlog:'+room.id, min, max, function(err, chatlog) {
					if (!err) {
						getLogs(chatlog, callback);
					} else {
						error(err, socket, 'get chatlog');
						callback({}, [], room);
					}
				});
			} else { // return the 30 most recent messages
				client2.zrange('chatlog:'+room.id, -30, -1, function(err, chatlog) {
					if (!err) {
						getLogs(chatlog, callback);
					} else {
						error(err, socket, 'get chatlog');
						callback({}, [], room);
					}
				});
			}
			
			// helper function
			// chatlog: list of message ids
			// callback: passes same 3 things as getChatlog()
			function getLogs(chatlog, callback) {
				if (chatlog.length == 0) {
					callback({}, {}, room);
					return;
				}
			
				var logs = {};
				var allMentions = [];
				var added = 0;
				// for each message id, turn it into a message object
				for (var i = 0; i < chatlog.length; i++) {
					function closure() {
						var mid = chatlog[i];
						// fetch message data from db
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
							
								//create message object
								var entry = {
									'from'		: fromUid,
									'to'		: room.id,
									'text'		: text,
									'mentions'	: mentions,
									'id'		: mid,
									'timestamp'	: timestamp,
								};
								logs[timestamp] = entry;
							} else {
								error(err, socket, 'get chatlog');
							}
							
							// when all messages have been added, callback
							if (added == chatlog.length) {
								helper.getUsers(allMentions, function(mapping) {
									callback(logs, mapping, room);
								});
							}
						});
					}
					closure();
				}
			}
		});
	}

	// client tells server he joined a room
	socket.on('get online', function (room) {
		helper.debug('get online', room);
		
		helper.getUsers(Object.keys(nicknames[room]), function(mapping) {
			// send updated online users list
			socket.emit('online', room, mapping);
		});
	});

	// client sends a message
	// roomId: room id the message is sent to
	// msg: text content of the message
	// mentions: list of user ids that were mentioned in this message
	socket.on('message', function (roomId, msg, mentions) {
		helper.debug('message', roomId, msg, mentions);
		
		var timestamp = new Date().getTime();
		
		// sanitize input to prevent malicious code
		msg = sanitize(msg).xss();
		msg = sanitize(msg).entityEncode();
		
		// reject long messages
		if (msg.length > 256) {
			socket.emit('error', 'Message not sent. Message length too long.');
			return;
		}
		// client can only send messages if he has logged in
		if (session !== undefined && session.uid !== undefined) {
			helper.getRoomInfo(roomId, session.uid, function(room) {
				// check for ban
				client2.hget('banlist:'+room.id, session.uid, function(err, ban) {
					if (!err && ban != null) {
						// banned
						var banlength = timestamp - ban;
						var totalbanlength = 5 * 60 * 1000;
						if (ban == -1 || banlength < totalbanlength) { // 5 minutes
							var banlengthstring = ban == -1 ? 'ever' : Math.round((totalbanlength-banlength)/(60*1000))+' minutes';
							socket.emit('error', 'Message not sent. You\'ve been banned from chatting in this room for '+banlengthstring+'.');
							return;
						}
					}
					
					helper.getUsers(mentions.concat(session.uid), function(mapping){
						var user = mapping[session.uid];
						var commandreceivers = mentions.filter(function(mention) {
							// if you are not a Founder, you cannot execute a command against a Founder
							return mapping[session.uid].special == SPECIAL_FOUNDER || mapping[mention].special != SPECIAL_FOUNDER;
						});
						
						// check for commands
						// we received a command if the user is a gsi of this room and the first character is the special char /
						if (msg.charAt(0) == '/') {
							var commandend = msg.indexOf(' ');
							if (commandend == -1) commandend = msg.length;
							var command = msg.substring(1, commandend);
							var commandmsg = msg.substring(commandend).trim();
							
							getCommands(command, socket.uid, roomId, function(commands) {
								for (var i = 0; i < commands.length; i++) {
									var command = commands[i];
									
									// COMMANDLIST
									switch(command.name) {
										case 'KICK':
										case 'BAN':
										case 'WARN':
										case 'FORGIVE':
										case 'ADMIN':
										case 'GSI':
										case 'DEMOTE':
										
										// send command message to each mentioned socket
										var othersockets = getSockets(commandreceivers, session.uid);
										for (var i = 0; i < othersockets.length; i++) {
											var s = othersockets[i];
											s.emit('command', command.name.toLowerCase(), room, user, commandmsg);
										};
										
										// update the banlist
										for (var i = 0; i < commandreceivers.length; i++) {
											var mention = commandreceivers[i];
											if (command.name == 'BAN' || command.name == 'WARN') {
												// ban is permanent while warn is temporary
												client2.hset('banlist:'+room.id, mention, command.name == 'BAN' ? -1 : timestamp);
											} else if (command.name == 'FORGIVE') {
												client2.hdel('banlist:'+room.id, mention);
											} else if (command.name == 'ADMIN') {
												client2.hset('user:'+mention, 'special', 2);
											} else if (command.name == 'GSI') {
												// add roomId to existing gsirooms
												client2.hget('user:'+mention, 'gsirooms', function(err, gsirooms) {
													if (gsirooms) {
														var roomIds = gsirooms.split(',');
														var index = roomIds.indexOf(roomId);
														if (index != -1) {
															roomIds.unshift(roomIds.splice(index, 1));
														} else {
															roomIds.unshift(roomId);
														}
														client2.hset('user:'+mention, 'gsirooms', roomIds.join());
													} else {
														client2.hset('user:'+mention, 'gsirooms', roomId);
													}
												});
											} else if (command.name == 'DEMOTE') {
												// remove this room id from gsirooms, set user special field to 0
												client2.hget('user:'+mention, 'gsirooms', function(err, gsirooms) {
													var roomIds = [''];
													if (gsirooms) {
														roomIds = gsirooms.split(',');
														var index = roomIds.indexOf(roomId);
														if (index != -1) {
															roomIds.splice(index, 1);
														}
													}
													client2.hmset('user:'+mention, 'gsirooms', roomIds.join(), 'special', 0);
												});
											}
										};
										
										var commandsdone = commandreceivers.length;
										if (command.name == 'KICK') {
											commandsdone = othersockets.length;
										}
										
										// announce back to the gsi that his command has been done
										var capitalcommand = command.name.charAt(0)+command.name.substring(1);
										socket.emit('announcement', roomId, capitalcommand+' '+commandsdone+' user(s) with message: '+commandmsg);
										
										// DO NOT CONTINUE once we've processed a command
										return;
										default:
										break;
									}		
								};
								
								// since we haven't returned yet, we must have not processed a command
								handleMessage();
							});
						} else { // no command
							handleMessage();
						}
						
						function handleMessage() {
							// CONTINUE only if we have not processed a command
							// deduplicate mentions
							var temp = {};
							for (var i = 0; i < mentions.length; i++) {
								temp[mentions[i]] = null;
							};
							mentions = Object.keys(temp);

							// get the next unique message id
							client2.incr('message:id:next', function(err, mid) {
								if (!err) {
									// create message object
									var entry = {
										'from'		: session.uid,
										'to'		: roomId,
										'text'		: msg,
										'mentions'	: mentions,
										'id'		: mid,
										'timestamp' : timestamp,
									};
									
									// send the special 'private chat' message to the receiving client
									if (room.type == 'private') {
										var other = room.other(session.uid);
										var othersocket = getSockets([other])[0];
										if (othersocket) {
											// the client will be notified in a special way for private chats
											othersocket.emit('private chat', roomId, entry, mapping);
										}
										
										// update unread counts
										client2.hmget('user:'+other, 'chatrooms', 'unread', function(err, user) {
											if (!err) {
												var roomsArray = user[0].split(',');
												var unreadsArray = user[1].split(',');
												helper.prependRoom(roomId, unreadsArray, roomsArray);
												client2.hmset('user:'+other, 'chatrooms', roomsArray.join(), 'unreads', unreadsArray.join());
											}
										});
									}
									
									// general broadcast to all clients in a room of the new message
									io.sockets.in(roomId).emit('message', entry, mapping);
									
									// save the message to the database
									client2.hmset('message:'+mid, {
										'from'		: session.uid,
										'to'		: roomId,
										'text'		: msg,
										'mentions'	: mentions.join(),
										'timestamp'	: timestamp,
									});
									// add the message id to the db chatlog
									client2.zadd('chatlog:'+roomId, timestamp, mid);
									
									// @mentions send persistent notifications
									for (var i = 0; i < mentions.length; i++) {
										var id = mentions[i];
										client2.zadd('mentions:'+id, timestamp, mid);
										
										// only send offline notifications if user is offline
										for (chatroom in nicknames) {
											// user is not online
											if (nicknames[chatroom][id] == undefined) {
												// hook to send notifications when mention'd
												helper.mentionNotification(id, mid);
												break;
											}
										}
									}
									
									// @mentions send temporary notifications
									var othersockets = getSockets(mentions);
									for (var i = 0; i < othersockets.length; i++) {
										othersockets[i].emit('command', 'mention', room, user, msg);
									};
								} else {
									error(err, socket, 'message');
								}
							});
						}
					});
				});
			});
		} else {
			error("session.uid not defined", socket, 'message');
		}
	});

	// client asks for the nearest buildings for chatroom recommendation
	socket.on('get nearest buildings', function (lat, lng, limit, callback) {
		// distance function
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
		
		// get known locations from db
		client0.hgetall("location:all", function (err, locations) {
			if (!err) {
				// create coordinates array for sorting
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
				// get the locations of the closest coordinates
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
								error(err, socket, 'get nearest building');
							}

							// when all locations have been retrieved, callback
							if (added == limit) {
								callback(buildings);
							}
						});
					}
					closure();
				}
			} else {
				error(err, socket, 'get nearest building');
				callback();
			}
		});
	});
    
    // client asks for the users of a given chat room during @mentions
    // room: room id
    // filter: string that specifies the beginning of all returned users' names
    // limit: maximum number of users to return
    // callback: returns 3 things
    // 		mapping: an associative array from user id to user object. Contains all user ids from online and offline
    // 		online: list of user ids who are online
    // 		offline: list of user ids who are offline
	socket.on('get users', function(room, filter, limit, callback) {
		helper.debug('get users', room, filter, limit);
		// query db for users whose names start with filter
		client2.zrangebyscore('users:'+room, helper.stringScore(filter), helper.capStringScore(filter), 'limit', 0, limit, function(err, ids) {
			if (!err) {
				helper.getUsers(ids, function(users) {
					var online = [];
					var offline = [];
					
					// sort users into online and offline
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
	
	// gives possible commands for client
	socket.on('get commands', function(filter, roomId, callback) {
		getCommands(filter, socket.uid, roomId, callback);
	});
	function getCommands(filter, uid, roomId, callback) {
		helper.debug('get commands', uid, filter, roomId);
		
		helper.getUsers([uid], function(mapping) {
			console.log(mapping);
			if (Object.keys(mapping).length) {
				var user = mapping[uid];
				var commands = [];
				var isGSI = false;
				var gsirooms = user.gsirooms.split(',');
				for (var i = 0; i <  gsirooms.length; i++){
					if (gsirooms[i] == roomId){
						isGSI = true;
						break;
					}
				}
				
				// COMMANDLIST
				// kick, ban, warn, unban
				if (isGSI || (user.special > 0 && user.special <= SPECIAL_ADMIN)) {
					commands = commands.concat({
						name: 			'KICK',
						description: 	'Boots the @users from the room. The @users can join back immediately.',
						type: 			'GSI',
					}, {
						name: 			'WARN',
						description: 	'Temporarily silences the @users. The @users can still view messages. The @users can speak again after 5 minutes.',
						type: 			'GSI',
					}, {
						name: 			'BAN',
						description: 	'Permanently silences the @users. The @users can still view messages. The @users can never speak again.',
						type: 			'GSI',
					}, {
						name: 			'FORGIVE',
						description: 	'Allows the @users to talk again.',
						type: 			'GSI',
					});
				}
				
				if (user.special > 0 && user.special <= SPECIAL_ADMIN) {
					commands = commands.concat({
						name: 			'ADMIN',
						description: 	'Gives administrator priviledges to the @users.',
						type: 			'ADMIN',
					}, {
						name: 			'GSI',
						description: 	'Gives GSI priviledges to the @users.',
						type: 			'ADMIN',
					}, {
						name: 			'DEMOTE',
						description: 	'Removes all priviledges from the @users.',
						type: 			'ADMIN',
					});
				}
				commands = commands.filter(function(command) { return command.name.indexOf(filter) == 0});
				callback(commands);
			}
		});
	};
	
	// client sets his phone number
	// uid: client's id
	// phoneNum: client's entered phone number
	socket.on('phone num', function(uid, phoneNum, callback) {
		if (helper.isPhoneNum(phoneNum)) {
			// save phone number to db
			client2.hset('user:'+uid, 'phone', phoneNum, callback);
		}
	});

	// client queries server for valid chatrooms when entering autocompletions in the navbar
	socket.on('get validrooms', function(query, limit, callback) {		
		helper.debug('get validrooms', query, limit);
		// sanitize the input
		query = helper.stripHigh(query);
		
		if (!query || !limit) {
			callback([]);
		} else {
			// query db for chat rooms whose names start with the query
			client0.zrangebyscore('validrooms', helper.stringScore(query), helper.capStringScore(query), function(err, ids) {
				if (!err) {
					if (ids.length == 0) {
						callback([]);
						return;
					}
					
					// turn room ids into room objects
					helper.getRoomsInfo(ids, socket.uid, function(rooms) {
						callback(rooms.slice(0, limit));
					});
				} else {
					error(err, socket, 'get validrooms');
					callback();
				}
			});
		}
	});

	// client disconnects from the server
	socket.on('disconnect', function () {
		helper.debug('disconnect');
		if (!socket.nickname) return;
        
        // clean up if client was logged on
		if (session && session.uid !== undefined) {
			for (room in nicknames) {
				delete nicknames[room][session.uid];
			}

			// set unread start timestamp so we can calculate how many messages the client missed
			client2.hmget('user:'+session.uid, 'chatrooms', 'unread', function(err, reply) {
				if (!err && reply[0] != null && reply[1] != null) {
					var rooms = reply[0].split(',');
					var unreads = reply[1].split(',');
					var time = new Date().getTime();

					// do not run if array is [''] (which happens b/c ''.split(',') becomes [''])
					if (rooms.length && reply[0]) {
						for (var i = 0; i < rooms.length; i++) {
							(function closure() {
								var room = rooms[i];
								helper.getUsers(Object.keys(nicknames[room]), function(mapping) {

									// update unreads to time of d/c
									unreads[i] = time;

									// broadcast to other clients in the room of the new online users list
									io.sockets.in(room).emit('online', room, mapping);
								});
							})();
						}
						client2.hset('user:'+session.uid, 'unread', unreads.join());
					}
				} else {
					error(err, socket, 'disconnect');
				}
			});
		} else {
			error("session.uid not defined", socket, 'disconnect');
		}
	});
});

console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
