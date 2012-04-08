var redis = require('redis');
var redisUrl = 'db.calchat.net';
var client0 = redis.createClient(null, redisUrl);
client0.select(0);
var client1 = redis.createClient(null, redisUrl);
client1.select(1);
var client2 = redis.createClient(null, redisUrl);
client2.select(2);


// Returns an object containing the id, official name, pretty name, and title
function getRoomInfo(rawId, callback) {
	debug('getRoomInfo', rawId);
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
					id			: rawId,
					url			: stripLow(pretty),
					pretty		: pretty,
					title		: klass.title,
					type		: 'class',
				});
			});
		} else {
			// check if the room is a building
			client0.hgetall('location:'+rawId, function(err, location) {
				if (!err && Object.keys(location).length) {
					callback({
						id			: rawId,
						url			: stripLow(location.name),
						pretty		: location.name,
						title		: location.longname,
						type		: 'building',
					});
				} else {
					// check if room is a special manual input
					client1.hget('validrooms', rawId, function(err, title) {
						if (!err && title) {
							callback({
								id			: rawId,
								url			: stripLow(rawId),
								pretty		: rawId,
								title		: title,
								type		: 'special',
							});
						} else {
							// check if room is a class room
							client0.hget('room:'+rawId+':'+getDayOfWeek(), getLastHalfHour(), function(err, classId) {
								if (!err && classId) {
									getRoomInfo(classId, function(roomObject) {
										console.log(roomObject);
										callback(roomObject);
									});
								} else {
									// check if room is another user id
									if (rawId.indexOf(':') != -1) {
										var uids = rawId.split(':');
										client2.hgetall('user:'+uids[0], function(err, user1) {
											if (!err && Object.keys(user1).length) {
												client2.hgetall('user:'+uids[1], function(err, user2) {
													if (!err && Object.keys(user2).length) {
														var name1 = user1.firstname+' '+user1.lastname[0];
														var name2 = user2.firstname+' '+user2.lastname[0];
														var readable = function(uid) {
															return user1.id == uid || user2.id == uid;
														};
														var other = function(uid) {
															if (uid == user1.id) return user2.id;
															else return user1.id;
														};
														callback({
															id			: rawId,
															url			: stripLow(rawId),
															pretty		: name1+':'+name2,
															title		: 'Private Chat with '+name1+':'+'Private Chat with '+name2,
															type		: 'private',
															readable	: readable,
															other		: other,
														});
													} else {
														callback(null);
													}
												});
											} else {
												callback(null);
											}
										});
									} else {
										callback(null);
									}
								}
							});
						}
					});
				}
			});
		}
	});
}

function getRoomsInfo(roomIds, callback) {
	debug('getRoomsInfo');
	if (!roomIds.length) {
		callback([]);
	}
	
	var temp = {};
	for (var i = 0; i < roomIds.length; i++) {
		var roomId = roomIds[i];
		if (roomId.charAt(roomId.length - 1) == '#') {
			roomId = roomId.substring(0, roomId.length - 1);
		}
		temp[roomId] = null;
	};
	roomIds = Object.keys(temp);

	var added = 0;
	var rooms = [];
	for (var i = 0; i < roomIds.length; i++) {
		function closure() {
			var roomId = roomIds[i];
			if (roomId.charAt(roomId.length - 1) == '#') {
				roomId = roomId.substring(0, roomId.length - 1);
			}

			var n = i;
			getRoomInfo(roomId, function(room) {
				added++;

				// preserve order
				rooms[n] = room;

				if (added == roomIds.length) {
					var ret = [];
					for (var i = 0; i < rooms.length; i++) {
						var r = rooms[i];
						if (r != null) {
							ret.push(r);
						}
					};
					callback(ret);
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
			if (!err && rooms.length) {
				var sameLastChars = [];
				for (var i = 0; i < rooms.length; i++) {
					// set suggestion to the RAW ID (sometimes followed by # if the input room was an abbreviation)
					var suggestion = rooms[i];

					var lastChar = suggestion.charAt(suggestion.length - 1);
					
					// if $ is at the end then it means roomId was 306SODA and you need to redirect to current class held at 306SODA
					console.log('lastChar', lastChar);
					if (lastChar == '$') {
						getRoomInfo(roomId, function(room) {
							if (room) {
								callback(true, room.id);
							} else {
								callback(false);
							}
						});
						return;
					} else {
						if (lastChar == '#') {
								// remove # at the end
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
					}
				};

				sameLastChars.sort(function(a,b) {
					return b.sameLastChar - a.sameLastChar;
				});

				callback(true, sameLastChars[0].suggestion);
			} else {
				// not in validrooms db. Check if it is a private chat to another user
				if (roomId.indexOf(':') != -1) {
					var uids = roomId.split(':');
					client2.exists('user:'+uids[0], function(err, exists) {
						if (!err && exists) {
							client2.exists('user:'+uids[1], function(err, exists) {
								if (!err && exists) {
									callback(true, roomId);
								} else {
									callback(false);
								}
							});
						} else {
							callback(false);
						}
					});
				} else {
					callback(false);
				}
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
	return string.replace(/[^A-Za-z0-9:]/g, '').toUpperCase();
}

function stripLow(string) {
	return string.replace(/[^A-Za-z0-9:]/g, '').toLowerCase();
}

function getDayOfWeek() {
	var now = new Date();
	switch(now.getDay()) {
		case 0:
			return 'Su';
		case 1:
			return 'M';
		case 2:
			return 'Tu';
		case 3:
			return 'W';
		case 4:
			return 'Th';
		case 5:
			return 'F';
		case 6:
			return 'S';
	}
}

function getLastHalfHour() {
	var now = new Date();
	return (now.getHours() + (now.getMinutes() >= 30 ? .5 : 0)).toFixed(1);
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
