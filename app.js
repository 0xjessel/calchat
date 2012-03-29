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
var redisUrl = "calchat.net"
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
					'recent': '',
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
.redirectPath('/');

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
	// app.use(app.router);
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

app.listen(3000);

/**
* Socket.IO server (single process only)
*/

var io = sio.listen(app);
var nicknames = {};

io.sockets.on('connection', function (socket) {
    function getMentions(msgs, callback) {
        var mentions = {};
        
        if (msgs.length == 0) {
            callback(mentions);
        }
        
        var expected = 0;
        var encountered = 0;
        for (var stage in [0,1]) { // first calculate expected, then calculate encountered
            for (var k = 0; k < msgs.length; k++) {
                var msg = msgs[k];
                var slices = msg.split('#');
                for (var i = 0; i < slices.length; i++) {
                    if (stage == 0) {
                        expected++;
                        continue;
                    } else {                        
                        var slice = slices[i];
                        var id = slice.substring(0, slice.indexOf('$'));
                        
                        var firstname = null;
                        client2.hget('user:'+id, 'firstname', function(err, reply){
                            firstname = reply;
                        });
                        var lastname = null;
                        client2.hget('user:'+id, 'lastname', function(err, reply){
                            encountered ++;
                            // this callback is guaranteed to be called after the firstname callback
                            lastname = reply;
                            if (firstname && lastname) {
                                mentions[id] = firstname + ' ' + lastname.charAt(0);
                            }
                            
                            if (encountered == expected) {
                                callback(mentions);
                                return;
                            }
                        });
                    }
                }
            }
        }
    }
    
	socket.on('join room', function (room) {
        socket.get('uid', function (err, uid) {
            console.log('incoming request to join '+room);
            if (!nicknames[room]) {
                nicknames[room] = {};
            }
            socket.join(room);
        });
	});
	
	socket.on('leave room', function (room) {
		socket.get('uid', function (err, uid) {
            delete nicknames[room][uid];
            
			client2.hget('user:'+uid, 'recent', function(err, reply) {
				if (reply) {
					var rooms = reply.split(',');
					for (var i = 0; i < rooms.length; i++) {
						if (room == rooms[i]) {
							rooms.splice(i, 1);
							
                            client2.hset('user:'+uid, 'recent', rooms.join());
						}
					}
				}
			});
            
            client2.srem('users:'+room, uid);
            
            io.sockets.in(room).emit('announcement', room, socket.nickname + ' disconnected');
            io.sockets.in(room).emit('online', room, nicknames[room]);
		});
	});

	socket.on('set name', function (uid, nick, fn) {
		socket.nickname = nick;
		socket.set('uid', uid);
		
		client2.hget('user:'+uid, 'recent', function(err, reply) {
			if (reply) {
				var rooms = reply.split(',');
				for (var i = 0; i < rooms.length; i++) {
					var room = rooms[i];
					if (nicknames[room] && nicknames[room][uid]) {
						fn(true);
					} else {
						fn(false);
						nicknames[room][uid] = socket.nickname;
					}
            
                    client2.sadd('users:'+room, uid);
            
					io.sockets.in(room).emit('announcement', room, nick + ' connected');
					io.sockets.in(room).emit('online', room, nicknames[room]);
				}
			}
		
		});
	});
	
	socket.on('get chatlog', function (room, fn) {
		// get last 30 messages
		client2.zrange('chatlog:'+room, -30, -1, 'withscores', function(err, replies) {
			var toReturn = {};
            var msgs = [];
			for (var i = 0; i < replies.length; i=i+2) {
				toReturn[replies[i+1]] = replies[i];
                msgs.push(replies[i]);
			}
            
            getMentions(msgs, function(mentions){
                fn(toReturn, mentions);
            });
		});
	});

	socket.on('get online', function (room) {
		socket.emit('online', room, nicknames[room]);
	});

	socket.on('message', function (room, msg) {
		console.log(msg + ' to room ' + room);
		client2.zadd('chatlog:'+room, new Date().getTime(), socket.nickname+': '+msg);
        getMentions([msg], function(mentions) {
            io.sockets.in(room).emit('message', room, socket.nickname, msg, mentions);
        });
	});

	socket.on('save chat', function (room) {
        console.log('save chat room');
        console.log(room);
		socket.get('uid', function (err, uid) {
			client2.hget('user:'+uid, 'recent', function(err, reply) {
				if (reply) {
					var rooms = reply.split(',');
					var found = false;
					for (var i = 0; i < rooms.length; i++) {
						if (rooms[i] == room) {
							rooms.unshift(rooms.splice(i, 1).join());
							found = true;
						}
					}
					if (!found) {
						rooms.unshift(room);
					}
					
                    client2.hset('user:'+uid, 'recent', rooms.join());
				}
			});
		});
	})

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
    
    socket.on('get users', function(room, callback){
        client2.smembers('users:'+room, function(err, ids){
            var users = {};
            
            // INFO
            // this for loop is asynchronous (because of redis), so lots of things need to be done:
            for (var i = 0; i < ids.length; i++) {
                // create closure to make sure variables in one loop iteration don't overwrite the previous iterations
                var closure = function() {
                    var id = ids[i];
                    var name = null;
                    client2.hget('user:'+id, 'firstname', function(err, firstname){
                        name = firstname;
                    });
                    // 2nd callback function guaranteed to be called after 1st callback function above
                    client2.hget('user:'+id, 'lastname', function(err, lastname){
                        name = name + ' ' + lastname.charAt(0);
                    });
                    // use ping to guarantee call order
                    client2.ping(function(){
                        users[id] = name;
                    });
                }
                // immediately call the created closure
                closure();
            }
            
            // use ping to guarantee this callback is executed after all above callbacks have executed
            client2.ping(function(){
                callback(users);
            });
        });
    });

	socket.on('disconnect', function () {
		if (!socket.nickname) return;        
        
		socket.get('uid', function (err, uid) {
            for (room in nicknames) {
                delete nicknames[room][uid];
            }
            
			client2.hget('user:'+uid, 'recent', function(err, reply) {
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
