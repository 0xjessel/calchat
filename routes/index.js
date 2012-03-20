var util = require('util')

/*
 * GET home page.
 */
exports.index = function(req, res) {
  res.render('index', { 
    title: 'CalChat', 
    loggedIn: req.loggedIn
  });
};

exports.chat = function(req, res) {
  res.send('list of chat rooms available');
};

exports.chatroom = function(req, res) {
  var room = req.params.room;
  if (isValid(room)) {
    res.render('chatroom', { 
      title: 'CalChat Chat', 
      room: req.params.room, 
      layout: false 
    });
  } else {
    res.send(room + ' is an invalid room');
  }  
};

function isValid(room) {
  return true;
}
