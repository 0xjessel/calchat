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
  if (req.loggedIn) {
    res.render('dashboard', {
      title: 'Dashboard',
    });
  } else {
    res.redirect('home');
  }
};
  
exports.chat = function(req, res) {
  if (req.loggedIn) {
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
  } else {
    res.redirect('home');
  }
};

function isValid(room) {
  return true;
}
