
/**
 * Module dependencies.
 */

var express = require('express');
var sio = require('socket.io');
//var routes = require('./routes');

var app = module.exports = express.createServer();

// Configuration

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.register('.html', require('jade'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
  app.use(express.errorHandler());
});

// Routes
app.get('/', function(req, res) {
    res.render('index', { title: 'CalChat' });
});

app.get('/chat', function(req, res) {
    res.render('chat', { title: 'CalChat', layout: false });
});

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
