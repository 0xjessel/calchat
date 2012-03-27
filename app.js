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
var client1 = redis.createClient(null, redisUrl);
client1.select(1);
redis.debug_mode = false;

/**
* Facebook Connect
*/
everyauth.debug = true;

everyauth.everymodule.findUserById(function (userId, callback) {
	// callback has the signature, function (err, user) {...}
	client1.hgetall('user:'+userId, callback);
});

everyauth.facebook
.appId('297402036983700')
.appSecret('aad4c11b1b2ccbad5ea5d3632cc5d920')
.scope('email, user_about_me, read_friendlists')
.findOrCreateUser( function(session, accessToken, accessTokenExtra, fbUserMetadata) {
	var promise = this.Promise();
	client1.hgetall('user:'+fbUserMetadata.id, function(err, reply) {
		if (err == null) { // no errors
			if (Object.keys(reply).length == 0) { 
				// no user found, create new user
				client1.hmset('user:'+fbUserMetadata.id, {
					'id': fbUserMetadata.id, 
					'firstname': fbUserMetadata.first_name,
					'lastname': fbUserMetadata.last_name,
					'recent': '',
					'firstlast': fbUserMetadata.first_name+fbUserMetadata.last_name,
					'oauth': accessToken,
				}, function() {
					client1.hgetall('user:'+fbUserMetadata.id, function(err, reply) {
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

// Functions

function dist(lat1, lng1, lat2, lng2) {
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

/**
* Socket.IO server (single process only)
*/

var io = sio.listen(app)
, nicknames = {};

io.sockets.on('connection', function (socket) {
	socket.on('join room', function(room) {
		console.log('incoming request to join '+room);
		if (!nicknames[room]) {
			nicknames[room] = {};
		}
		
		socket.get('rooms', function(err, rooms) {
			if (rooms == null) {
				socket.set('rooms', [room]);
			} else {
				var temp = rooms;
				temp.unshift(room);
				socket.set('rooms', temp);
			}
		});

		socket.join(room);
	});

	socket.on('get chatlog', function (room, fn) {
		// get last 30 messages
		client1.zrange('chatlog:'+room, -30, -1, 'withscores', function(err, replies) {
			var toReturn = {};
			for (var i = 0; i < replies.length; i=i+2) {
				toReturn[replies[i+1]] = replies[i];
			}
			fn(toReturn);
		});
	});
	
	socket.on('get online', function (room) {
		socket.emit('nicknames', room, nicknames[room]);
	});
	
	socket.on('save chat', function(uid, room) {
		client1.hget('user:'+uid, 'recent', function(err, replies) {
			if (replies) {
				var rooms = replies.split(',');
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
			
				client1.hset('user:'+uid, 'recent', rooms.join());
			}
		});
	})

	socket.on('message', function (room, msg) {
		console.log(msg + ' to room ' + room);  
		client1.zadd('chatlog:'+room, new Date().getTime(), socket.nickname+': '+msg);
		socket.broadcast.to(room).emit('message', room, socket.nickname, msg);
	});

	socket.on('set name', function (nick, fn) {
		socket.nickname = nick;
		socket.get('rooms', function(err, rooms) {
			for (var i = 0; i < rooms.length; i++) {
				var room = rooms[i];
				if (nicknames[room] && nicknames[room][nick]) {
					fn(true);
				} else {
					fn(false);
					nicknames[room][nick] = socket.nickname;
				}
				io.sockets.in(room).emit('announcement', room, nick + ' connected');
				io.sockets.in(room).emit('nicknames', room, nicknames[room]);
			}
		});
	});

	socket.on('disconnect', function () {
		if (!socket.nickname) return;

		delete nicknames[socket.nickname];
		
		socket.get('rooms', function(err, rooms) {
			for (var i = 0; i < rooms.length; i++) {
				var room = rooms[i];
				io.sockets.in(room).emit('announcement', socket.nickname + ' disconnected');
				io.sockets.in(room).emit('nicknames', nicknames);
			}
		});
	});
    
    socket.on('get nearest buildings', function(lat, lng, num) {
        client0.hgetall("location:all", function(err, replies) {
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
            
            var buildings = new Array(num);
            for (var i = 0; i < num; i++) {
                var location = locations[i];
                buildings[i] = replies[location];
            }
            
            socket.emit('nearest buildings', buildings);
        });
    });
});

console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
