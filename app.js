/**
* Module dependencies.
*/

var express = require('express')
, sio = require('socket.io')
, everyauth = require('everyauth')
, redis = require('redis')
, util = require('util')
, routes = require('./routes');

var app = module.exports = express.createServer();

/**
* Redis
*/
var redisUrl = 'db.calchat.net';
var client0 = redis.createClient(null, redisUrl);
client0.select(0);
var client2 = redis.createClient(null, redisUrl);
client2.select(2);
redis.debug_mode = false;

/**
* Facebook Connect
*/
everyauth.debug = true;
everyauth.everymodule.moduleTimeout(-1); // turn off timeouts (github issue #29)
everyauth.everymodule.findUserById(function (userId, callback) {
	// callback has the signature, function (err, user) {...}
	client2.hgetall('user:'+userId, callback);
});

everyauth.facebook
.appId('297402036983700')
.appSecret('aad4c11b1b2ccbad5ea5d3632cc5d920')
.scope('email, user_about_me, read_friendlists')
.findOrCreateUser( function(session, accessToken, accessTokenExtra, fbUserMetadata) {
	var promise = this.Promise();
	client2.hgetall('user:'+fbUserMetadata.id, function(err, reply) {
		if (err == null) { // no errors
			if (Object.keys(reply).length == 0) { 
				// no user found, create new user
				client2.hmset('user:'+fbUserMetadata.id, {
					'id': fbUserMetadata.id, 
					'firstname': fbUserMetadata.first_name,
					'lastname': fbUserMetadata.last_name,
					'chatrooms': '',
					'firstlast': fbUserMetadata.first_name+fbUserMetadata.last_name,
					'oauth': accessToken,
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
			/*	Object.keys(reply).forEach(function(val) {
			console.log(val+ ' '+reply[val]);
			})*/
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
	app.use(express.static(__dirname + '/public'));
	app.use(express.cookieParser());
	app.use(express.session({ secret: 'nelarkonesse' }));
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
app.get('*', routes.invalid);

app.listen(3000);

/**
* Socket.IO server (single process only)
*/

var io = sio.listen(app);
var nicknames = {};

io.sockets.on('connection', function (socket) {
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
	
	socket.on('initialize', function(uid, nick, rooms, current, callback) {
		if (uid != null && nick != null) {
			socket.nickname = nick;
			socket.set('uid', uid);
		
			joinRooms(rooms);
		
			getChatlog(current, function(logs, mentions) {			
				client2.hget('user:'+uid, 'chatrooms', function(err, reply) {
					if (reply) {
						var rooms = reply.split(',');
						for (var i = 0; i < rooms.length; i++) {
							var room = rooms[i];
							nicknames[room][uid] = socket.nickname;
							client2.sadd('users:'+room, uid);
            
							if (room != current) {
								io.sockets.in(room).emit('announcement', room, nick + ' connected');
								io.sockets.in(room).emit('online', room, nicknames[room]);
							}
						}

						callback(logs, mentions);
					
						// TODO: can we just get rid of that if check on line 213 so we don't need this? 
						io.sockets.in(current).emit('announcement', current, nick + ' connected');
						io.sockets.in(current).emit('online', current, nicknames[current]);
					}
				});
			});
		} else {
			joinRooms(rooms);

			getChatlog(current, function(logs, mentions) {
				callback(logs, mentions);
			});

			io.sockets.in(current).emit('online', current, nicknames[current]);
		}
		
		function joinRooms(rooms) {
			for (var i = 0; i < rooms.length; i++) {
				var room = rooms[i];
				if (!nicknames[room]) {
					nicknames[room] = {};
				}
				socket.join(room);
			}
		}
	});
	
	socket.on('leave room', function (room, callback) {
		socket.get('uid', function (err, uid) {
            delete nicknames[room][uid];
            
			// remove room from user's list of chatrooms
			client2.hget('user:'+uid, 'chatrooms', function(err, chatrooms) {
				var rooms = chatrooms.split(',');
				
				//remove room from rooms
				rooms.splice(rooms.indexOf(room), 1);
				
				var newRooms = rooms.join();
				client2.hset('user:'+uid, 'chatrooms', newRooms, function(err, reply) {
					callback();
				});
			});

            // remove user from chatroom's list of users
            client2.srem('users:'+room, uid);
            
            io.sockets.in(room).emit('announcement', room, socket.nickname + ' disconnected');
            io.sockets.in(room).emit('online', room, nicknames[room]);
		});
	});
	
	// remove room from the dashboard
	socket.on('remove room', function (uid, room) {
		// remove room from user's list of chatrooms
		client2.hget('user:'+uid, 'chatrooms', function(err, chatrooms) {
			var rooms = chatrooms.split(',');
			
			//remove room from rooms
			rooms.splice(rooms.indexOf(room), 1);
			
			var newRooms = rooms.join();
			client2.hset('user:'+uid, 'chatrooms', newRooms);
		});	
	});
	
	socket.on('get chatlog', getChatlog);
	function getChatlog(room, callback) {
		// get last 30 messages
		client2.zrange('chatlog:'+room, -30, -1, function(err, chatlog) {
			if (chatlog.length == 0) {
				callback({}, {});
				return;
			}
			
			var logs = {};
			var mentions = {};
			var added = 0;
			for (var i = 0; i < chatlog.length; i++) {
				var mid = chatlog[i];
				client2.hmget('message:'+mid, 'timestamp', 'from', 'text', function(err, messageReplies) {
					var timestamp = messageReplies[0];
					var fromUid = messageReplies[1];
					var text = messageReplies[2];
						
					var entry = {
						'from'	: fromUid,
						'text'	: text,
					};
					logs[timestamp] = entry;
						
					var messageMentions = getMentions([text], [fromUid]);
					for (var i = 0; i < messageMentions.length; i++) {
						var mention = messageMentions[i];
						if (mention != '') {
							// de-duplicate
							mentions[mention] = mention;
						}
					}
						
					added++;
						
					if (added == chatlog.length) {
						var ids = [];
						for (id in mentions) {
							ids.push(id);
						}
						getUsers(ids, function(mapping) {
							callback(logs, mapping);
						});
					}
				});
			}
		});
	}

	// emit online users as well as update user's chatroom list
	socket.on('get online', function (room) {
		socket.get('uid', function(err, uid) {
			if (uid != null) {
				// make this chatroom most recent in user's list
				client2.hget('user:'+uid, 'chatrooms', function(err, chatrooms) {
					var rooms = chatrooms.split(',');
				
					// move room to front of rooms
					rooms.unshift(rooms.splice(rooms.indexOf(room), 1));
				
					var newChatrooms = rooms.join();
					console.log('get online');
					console.log(newChatrooms);
					client2.hset('user:'+uid, 'chatrooms', newChatrooms);
				});
			}
		});
		
		// send updated online users list
		socket.emit('online', room, nicknames[room]);
	});

	socket.on('message', function (room, text) {
		socket.get('uid', function(err, uid) {
			console.log(text + ' to room ' + room);
			var timestamp = new Date().getTime();
			var mentions = getMentions([text], [uid]);
			
			getUsers(mentions, function(mapping) {
				io.sockets.in(room).emit('message', room, uid, text, mapping);
			});
		
			client2.incr('message:id:next', function(err, mid) {
				client2.hmset('message:'+mid, {
					'from'		: uid,
					'to'		: room,
					'text'		: text,
					'timestamp'	: timestamp,
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
			});
		});
	});

	socket.on('get nearest buildings', function (lat, lng, num) {
		client0.hgetall("location:all", function (err, replies) {
			var locations = new Array(replies.length);
			for (var key in replies) {
				locations.push(key);
			}

			//sort locations from nearest to furthest
			locations.sort(function(a,b) {
				var latA = a.split(",")[0];
				var lngA = a.split(",")[1];
				var distA = dist(lat, lng, latA, lngA);
				var latB = b.split(",")[0];
				var lngB = b.split(",")[1];
				var distB = dist(lat, lng, latB, lngB);

				return distA - distB;
			});

			var buildings = {};
			for (var i = 0; i < num; i++) {
				var location = locations[i];
				var lat2 = location.split(",")[0];
				var lng2 = location.split(",")[1];
				buildings[replies[location]] = dist(lat,lng,lat2,lng2);
			}

			socket.emit('nearest buildings', buildings);
		});
		
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
	});
    
    socket.on('get users', function(room, callback) {
        client2.smembers('users:'+room, function(err, ids) {
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
        });
    });

	socket.on('disconnect', function () {
		if (!socket.nickname) return;
        
		socket.get('uid', function (err, uid) {
            for (room in nicknames) {
                delete nicknames[room][uid];
            }
            
			client2.hget('user:'+uid, 'chatrooms', function(err, reply) {
				if (reply) {
					var rooms = reply.split(',');
					for (var i = 0; i < rooms.length; i++) {
						var room = rooms[i];
						io.sockets.in(room).emit('announcement', room, socket.nickname + ' disconnected');
						io.sockets.in(room).emit('online', room, nicknames[room]);
					}
				}
			});
		});
	});
});

console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
