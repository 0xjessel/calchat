var redis = require('redis');
var redisUrl = 'db.calchat.net';
var client0 = redis.createClient(null, redisUrl);
client0.select(0);


exports.getPrettyTitle = function(room, callback) {
	isValid(room, function(valid, suggestion) {
		if (valid) {
			client0.hgetall('class:'+room, function(err, reply) {
				if (err == null) {
					callback(reply['department'] + ' ' + reply['number']);
				}
			});
		}
	});
}

// prepends room to rooms (use this only if rooms exists!)
exports.prependRoom = function(room, rooms) {
	var index = -1;
	for (var i = 0; i < rooms.length; i++) {
		if (rooms[i] == room) {
			index = i;
		}
	}
	if (index == -1) {
		rooms.unshift(room);
	} else {
		rooms.unshift(rooms.splice(index, 1)[0]);
	}
	return rooms;
}

// query db to see if room is valid
var isValid = function(room, callback) {
	if (!room) {
		callback(false);
		return;
	} else {
		room = room.toUpperCase();

		if (room == 'CALCHAT') {
			callback(true, room);
			return;
		}

		function stringScore(string) {
			string = string.toUpperCase();
			var hash = 0;

			for (var i = 0; i < string.length; i++) {
				hash += (string.charCodeAt(i) - '0'.charCodeAt()) / Math.pow('Z'.charCodeAt() - '0'.charCodeAt() + 1, i);
			}
			return hash;
		}
		var score = stringScore(room);
		client0.zrangebyscore('courses', score, score, 'limit', 0, 1, function(err, courses) {
			var valid = !err && courses.length && courses[0].charAt(courses[0].length - 1) != '#';
			var suggestion = room;
			if (!valid && courses.length) {
				suggestion = courses[0].substring(0, courses[0].length-1);
			}
			callback(valid, suggestion);
		});
	}
}

exports.isValid = isValid;
