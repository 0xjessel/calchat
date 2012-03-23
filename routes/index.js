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
    var rooms = new Array(); // get favorites from redis
    var room = req.params.room;
	// prepend room to rooms, client-side will connect to first room in rooms
	if (typeof(room) !== undefined) {
      rooms.unshift(room);
    }
	
/*	if (rooms.length === 0) {
	  // redirect to dashboard to add some classes to favorites or select a class
      res.redirect('/dashboard'); // add some query param to indicate error
	}
*/	
    // redirect chat/cs188 to chat/ with var room='cs188'
    if (isValid(room)) {
      res.render('chat', { 
        title: 'CalChat', 
        rooms: JSON.stringify(rooms)
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
