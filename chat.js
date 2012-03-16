var http = require('http'),
    sys  = require('sys'),
    fs   = require('fs'),
    io   = require('socket.io');

var server = http.createServer(function(request, response) {
  response.writeHead(200, {
    'Content-Type': 'text/html'
  });
  
  var rs = fs.createReadStream(__dirname + '/views/template.html');
  sys.pump(rs, response);
  
});

var socket = io.listen(server);

socket.on('connection', function(client) {
  
  var username;
  
  client.emit('updatechat', 'Welcome to this socket.io chat server!');
  client.emit('updatechat', 'Please input your username: ');
  
  client.on('sendchat', function(message) {
    if (!username) {
      username = message;
      client.emit('updatechat', 'Welcome, ' + username + '!');
      return;
    }
    console.log(message); 
    socket.sockets.emit('updatechat', username + ' sent: ' + message);
  });
  
});

server.listen(4000);
