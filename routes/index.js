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

exports.dashboard = function(req, res) {
  res.render('dashboard', {
    title: 'Dashboard',
  });
}

exports.chat = function(req, res) {
  var room = req.params.room;
  // redirect chat/cs188 to chat/ with var room='cs188'
  if (isValid(room)) {
    res.render('chat', { 
      title: 'CalChat', 
      room: room,
    });
  } else {
    // open up previous chat windows?
  }  
};

function isValid(room) {
  return true;
}
