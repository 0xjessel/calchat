/**
 * Module dependencies.
 */

var express = require('express')
    , sio = require('socket.io')
    , everyauth = require('everyauth')
    , util = require('util')
    , routes = require('./routes');

var app = module.exports = express.createServer();

/**
 * Facebook Connect
*/
var usersByFbId = {};

everyauth.facebook
  .appId('297402036983700')
  .appSecret('aad4c11b1b2ccbad5ea5d3632cc5d920')
  .scope('email, user_about_me, read_friendlists')
  .findOrCreateUser( function(session, accessToken, accessTokenExtra, fbUserMetadata) {
    return usersByFbId[fbUserMetadata.id] || (usersByFbId[fbUserMetadata.id] = fbUserMetadata);
  })
  .redirectPath('/');

// Configuration
app.configure(function() {
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.favicon());
  app.use(express.static(__dirname + '/public'));
  app.use(express.cookieParser());
  app.use(express.session({ secret: 'nelarkonesse' }));
  app.use(everyauth.middleware());
  app.use(app.router);
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
app.get('/chat', routes.chat); 

app.listen(3000);

/**
 * Socket.IO server (single process only)
 */

var io = sio.listen(app)
  , nicknames = {};

io.sockets.on('connection', function (socket) {
  socket.on('user message', function (msg) {
      socket.broadcast.emit('user message', socket.nickname, msg);
  });

  socket.on('nickname', function (nick, fn) {
    if (nicknames[nick]) {
      fn(true);
    } else {
      fn(false);
      nicknames[nick] = socket.nickname = nick;
      socket.broadcast.emit('announcement', nick + ' connected');
      io.sockets.emit('nicknames', nicknames);
    }
  });

  socket.on('disconnect', function () {
    if (!socket.nickname) return;

    delete nicknames[socket.nickname];
    socket.broadcast.emit('announcement', socket.nickname + ' disconnected');
    socket.broadcast.emit('nicknames', nicknames);
  });
});

console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
