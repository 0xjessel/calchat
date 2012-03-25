var util = require('util')
    , everyauth = require('everyauth')
    , redis = require('redis');

var client = redis.createClient();

/*
 * GET home page.
 */
exports.index = function(req, res) {
  res.render('index', { 
    title: 'CalChat', 
    layout: 'layout-index', 
    loggedIn: req.loggedIn,
    index: 0
  });
};

exports.dashboard = function(req, res) {
  if (req.loggedIn) {
    res.render('dashboard', {
      title: 'Dashboard',
      layout: 'layout-dashboard',
      loggedIn: req.loggedIn,
      index: 1
    });
  } else {
    res.redirect('home');
  }
};

exports.chat = function(req, res) {
  if (req.loggedIn) {		
	if (req.user.recent === '') {
		// redirect to dashboard to add some classes to favorites or select a class
		return res.redirect('/dashboard?error=newbie'); // add some query param to indicate error
	}
	
	// convert string to array
	var rooms = req.user.recent.split(',');
	
    res.render('chat', { 
      title: 'CalChat', 
      layout: 'layout-chat',
      loggedIn: req.loggedIn,
      rooms: rooms,
      index: 2
    });
  } else {
    res.redirect('home');
  }
};

exports.chatroom = function(req, res) {
	if (req.loggedIn) {
		// convert string to array
		var rooms = req.user.recent.split(',');

		var room = req.params.room;
		if (room != undefined && isValid(room)) {
			if (!req.user.recent) {
				// first time, set rooms to be a new array with just the room
				rooms = [room];
			} else {
				// prepend room to rooms, client-side will connect to the first room in rooms
				rooms.unshift(room);
			} 
			// update db
			client.hset('user:'+req.user.id, 'recent', rooms.join(), function() {
				return res.redirect('/chat');
			});
			return;
		} else {
			// room is invalid/error
		}
	}
	res.redirect('home');
}

// query db to see if room is a valid room to join
function isValid(room) {
  return true;
}
