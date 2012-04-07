var redis = require('redis');
var redisUrl = 'db.calchat.net';
var client0 = redis.createClient(null, redisUrl);
client0.select(0);
var client1 = redis.createClient(null, redisUrl);
client1.select(1);


// Returns an object containing the id, official name, pretty name, and title
function getRoomInfo(roomId, callback) {
	debug('getRoomInfo', roomId);
	isValid(roomId, function(valid, rawId) {
		if (valid) {
			// check if the room is a class
			client0.hgetall('class:'+rawId, function(err, klass) {
				if (!err && Object.keys(klass).length) {
					var name = klass.department+' '+klass.number;
					var pretty = null;
					client1.hget('abbreviations', stripHigh(klass.department), function(err, abbreviation) {
						if (!err && abbreviation) {
							// for example, ELENG40 -> EE 40
							pretty = abbreviation+' '+klass.number;
						} else {
							// for example, ANTHRO1 -> ANTHRO 1
							pretty = name;
						}

						callback({
							'id'		: rawId,
							'name'		: name,
							'pretty'	: pretty,
							'title'		: klass.title,
						});
					});
				} else {
					// check if the room is a building
					client0.hgetall('location:'+rawId, function(err, location) {
						if (!err && Object.keys(location).length) {
							callback({
								'id'		: rawId,
								'name'		: location.name,
								'pretty'	: location.name,
								'title'		: location.longname,
							});
						} else {
							// check if room is a special manual input
							client1.hget('validrooms', rawId, function(err, title) {
								if (!err && title) {
									callback({
										'id'		: rawId,
										'name'		: rawId,
										'pretty'	: rawId,
										'title'		: title,
									});
								} else {
									callback(null);
								}
							});
						}
					});
				}
			});
		} else {
			callback(null);
		}
	});
}

function getAbbreviatedTitle(roomId, callback) {
	debug('getAbbreviatedTitle', roomId);
	getRoomInfo(roomId, function(room) {
		callback(room.pretty);
	});
}

function getAbbreviatedTitles(rooms, callback) {
	debug('getAbbreviatedTitles');
	if (!rooms.length) {
		callback([]);
	}

	var added = 0;
	var titles = [];
	for (var i = 0; i < rooms.length; i++) {
		function closure() {
			var room = rooms[i];
			var n = i;
			getAbbreviatedTitle(room, function(title) {
				added++;

				// preserve order
				titles[n] = {
					id: room,
					title: title,
				};

				if (added == rooms.length) {
					callback(titles);
				}
			});
		}
		closure();
	};
}

// prepends room to rooms (use this only if rooms exists!)
function prependRoom(room, rooms) {
	debug('prependRoom', room, rooms);
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

// return true if any form of room is valid
// return false if room cannot possibly be valid
// if true, then you must use rawId, which contains the raw id
function isValid(room, callback) {
	debug('isValid');
	if (!room) {
		callback(false);
		return;
	} else {
		room = stripHigh(room);

		function stringScore(string) {
			string = string.toUpperCase();
			var hash = 0;

			for (var i = 0; i < string.length; i++) {
				hash += (string.charCodeAt(i) - '0'.charCodeAt()) / Math.pow('Z'.charCodeAt() - '0'.charCodeAt() + 1, i);
			}
			return hash;
		}

		// try to find room in the database
		var score = stringScore(room);
		client0.zrangebyscore('validrooms', score, score, 'limit', 0, 1, function(err, rooms) {
			// room is valid if it is the raw id or an abbreviation (ELENG40 or EE40)
			var valid = !err && rooms.length;
			if (valid) {
				// set suggestion to the RAW ID (sometimes followed by # if the input room was an abbreviation)
				var suggestion = rooms[0];

				// remove # at the end
				if (suggestion.charAt(suggestion.length - 1) == '#') {
					suggestion = suggestion.substring(0, suggestion.length - 1);
				}

				// suggestion will always be the RAW ID
				callback(true, suggestion);
			} else {
				// not valid
				callback(false);
			}
		});
	}
}

function stripHigh(string) {
	return string.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function stripLow(string) {
	return string.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
}

function debug() {
	function inner() {
		for(var i = 0; i < arguments.length; i++) {
			console.log(arguments[i]);
		}
	}
	console.log('--');
	inner.apply(null, arguments);
	console.log('--');
}

exports.getRoomInfo = getRoomInfo;
exports.getAbbreviatedTitle = getAbbreviatedTitle;
exports.getAbbreviatedTitles = getAbbreviatedTitles;
exports.prependRoom = prependRoom;
exports.isValid = isValid;
exports.stripHigh = stripHigh;
exports.stripLow = stripLow;
exports.debug = debug;
