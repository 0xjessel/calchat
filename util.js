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

function getRoomsInfo(roomIds, callback) {
	debug('getRoomsInfo');
	if (!roomIds.length) {
		callback([]);
	}

	var added = 0;
	var rooms = [];
	for (var i = 0; i < roomIds.length; i++) {
		function closure() {
			var roomId = roomIds[i];
			var n = i;
			getRoomInfo(roomId, function(room) {
				added++;

				// preserve order
				rooms[n] = room;

				if (added == roomIds.length) {
					callback(rooms);
				}
			});
		}
		closure();
	};
}

// prepends room to rooms (use this only if rooms exists!)
function prependRoom(room, unreads, rooms) {
	debug('prependRoom', room, rooms);
	var index = -1;
	for (var i = 0; i < rooms.length; i++) {
		if (rooms[i] == room) {
			index = i;
		}
	}
	if (index == -1) {
		rooms.unshift(room);
		if (unreads) {
			unreads.unshift(new Date().getTime());
		}
	} else {
		rooms.unshift(rooms.splice(index, 1)[0]);
		if (unreads) {
			unreads.unshift(unreads.splice(index, 1)[0]);
		}
	}
}

// return true if any form of room is valid
// return false if room cannot possibly be valid
// if true, then you must use rawId, which contains the raw id
function isValid(roomId, callback) {
	debug('isValid', roomId);
	if (!roomId) {
		callback(false);
		return;
	} else {
		roomId = stripHigh(roomId);

		function stringScore(string) {
			string = string.toUpperCase();
			var hash = 0;

			for (var i = 0; i < string.length; i++) {
				hash += (string.charCodeAt(i) - '0'.charCodeAt()) / Math.pow('Z'.charCodeAt() - '0'.charCodeAt() + 1, i);
			}
			return hash;
		}

		// try to find room in the database
		var score = stringScore(roomId);
		client0.zrangebyscore('validrooms', score, score, function(err, rooms) {
			// room is valid if it is the raw id or an abbreviation (ELENG40 or EE40)
			var valid = !err && rooms.length;
			if (valid) {
				var sameLastChars = [];
				for (var i = 0; i < rooms.length; i++) {
					var room = rooms[i];
					// set suggestion to the RAW ID (sometimes followed by # if the input room was an abbreviation)
					var suggestion = rooms[i];

					// remove # at the end
					if (suggestion.charAt(suggestion.length - 1) == '#') {
						suggestion = suggestion.substring(0, suggestion.length - 1);
					}

					if (suggestion == roomId && rooms.length == 1) {
						callback(true, suggestion);
						return;
					}

					var sameLastChar = 0;
					for (var j = 0; j < Math.min(suggestion.length-1, roomId.length-1); j++) {
						var roomIdChar = roomId.charAt(roomId.length-1-j);
						var suggestionChar = suggestion.charAt(suggestion.length-1-j);

						if (roomIdChar == suggestionChar) {
							sameLastChar++;
						} else {
							break;
						}
					}
					sameLastChars.push({
						'sameLastChar'	: sameLastChar,
						'suggestion'	: suggestion,
					});
				};

				sameLastChars.sort(function(a,b) {
					return b.sameLastChar - a.sameLastChar;
				});

				callback(true, sameLastChars[0].suggestion);
			} else {
				// not valid
				callback(false);
			}
		});
	}
}

// transfer user data to session data to access in socket.io
function postAuthenticate(req) {
	if (req.user) {
		req.session.uid = req.user.id;
		req.session.nick = req.user.firstname + ' ' + req.user.lastname.charAt(0);
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
exports.getRoomsInfo = getRoomsInfo;
exports.prependRoom = prependRoom;
exports.isValid = isValid;
exports.postAuthenticate = postAuthenticate;
exports.stripHigh = stripHigh;
exports.stripLow = stripLow;
exports.debug = debug;
