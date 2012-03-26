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
var client = redis.createClient();
redis.debug_mode = false;

/**
* Facebook Connect
*/
everyauth.debug = true;

everyauth.everymodule.findUserById(function (userId, callback) {
	// callback has the signature, function (err, user) {...}
	client.hgetall('user:'+userId, callback);
});

everyauth.facebook
.appId('297402036983700')
.appSecret('aad4c11b1b2ccbad5ea5d3632cc5d920')
.scope('email, user_about_me, read_friendlists')
.findOrCreateUser( function(session, accessToken, accessTokenExtra, fbUserMetadata) {
	var promise = this.Promise();
	client.hgetall('user:'+fbUserMetadata.id, function(err, reply) {
		if (err == null) { // no errors
			if (Object.keys(reply).length == 0) { 
				// no user found, create new user
				client.hmset('user:'+fbUserMetadata.id, {
					'id': fbUserMetadata.id, 
					'firstname': fbUserMetadata.first_name,
					'lastname': fbUserMetadata.last_name,
					'recent': '',
					'firstlast': fbUserMetadata.first_name+fbUserMetadata.last_name,
					'oauth': accessToken,
				}, function() {
					client.hgetall('user:'+fbUserMetadata.id, function(err, reply) {
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

	socket.on('message', function (room, msg) {
		console.log(msg + ' to room ' + room);  
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
});

console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
