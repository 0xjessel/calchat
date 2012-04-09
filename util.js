var TwilioClient = require('twilio').Client
var client = new TwilioClient('ACdd4df176cb5b41e6a424f60633982d8e', '8c2cc16d9a8570469569682b92283030', 'http://calchat.net:3000');
var phone = client.getPhoneNumber('+15107468123');

var redis = require('redis');
var redisUrl = 'db.calchat.net';
var client0 = redis.createClient(null, redisUrl);
client0.select(0);
var client1 = redis.createClient(null, redisUrl);
client1.select(1);
var client2 = redis.createClient(null, redisUrl);
client2.select(2);

function mentionSMS(to, mid) {
	// get to's phone number
	client2.hget('user:'+to, 'phone', function (err, reply) {
		if (!err && !reply) {
			var phoneNum = reply;	
			client2.hmget('message:'+mid, 'from', 'to', 'text', function (err, replies) {
				if (!err && replies.length) {
					var fromUid = replies[0];
					client2.hget('user:'+fromUid, 'nick', function (err, reply) {
						if (!err && !reply) {
							var from = reply;
							var room = replies[1];
							var txt = replies[2];
							var footerLink = " - calchat.net:3000/chat/"+room;
							var msg = 'CalChat - '+from+' mentioned you in '+room+'!  Message: ';
							var msgSize = 160 - msg.length;							
							if (txt.length > msgSize) {
								txt = txt.substring(0, msgSize - 2);
								txt = txt+'..';
							}
							msg = msg+txt;
							sendSMS(phoneNum, msg, null, function (sms) {
								console.log('done');
							})
						} else {
							console.log('getting nick from user:fromUid '+err + reply);
						}
					})	
				} else {
					console.log('getting message contents '+err+reply);
				}
			});
		} else {
			// user has no phone number associated
		}
	});
}

function sendSMS(number, message, opts, callback) {
	console.log('sending SMS');
	console.log('number: '+number);
	console.log('message: '+message);
	phone.sendSms(number, message, opts, callback);
}

function sendMultipleSMS(numbers, message, opts, callback) {
	for (var i = 0; i < numbers.length; i++) {
		sendSMS(numbers[i], message, opts, callback);
	}
}

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
										if (roomObject) {
											roomObject.title = 'Current Class: '+roomObject.pretty;
											roomObject.pretty = rawId;
											roomObject.type = 'redirect';
											callback(roomObject);
										} else {
											callback();
										}
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
														var title1 = 'Private Chat with '+name1;
														var title2 = 'Private Chat with '+name2;
														var readable = function(uid) { return user1.id == uid || user2.id == uid; };
														var other = function(uid) { return uid == user1.id ? user2.id : user1.id; };
														var prettyfor = function(uid) { return uid == user2.id ? name1 : name2; };
														var titlefor = function(uid) { return uid == user2.id ? title1 : title1; };
														
														callback({
															id			: rawId,
															url			: stripLow(rawId),
															pretty		: name1+':'+name2,
															title		: title1+':'+title2,
															type		: 'private',
															
															readable	: readable,
															other		: other,
															prettyfor	: prettyfor,
															titlefor	: titlefor,
															
															id1			: user1.id,
															id2			: user2.id,
														});
													} else {
														callback();
													}
												});
											} else {
												callback();
											}
										});
									} else {
										callback();
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
		var lastChar = roomId.charAt(roomId.length - 1);
		if (lastChar == '#' || lastChar == '$') {
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
					if (lastChar == '$') {
						getRoomInfo(suggestion.substring(0, suggestion.length-1), function(room) {
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

function isPhoneNum(n) {
	if (isNumber(parseFloat(n)) && (n.toString().length == 10)) {
		return true;
	}
	return false;
}

function isNumber(n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
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

exports.isPhoneNum = isPhoneNum;
exports.mentionSMS = mentionSMS;
exports.getRoomInfo = getRoomInfo;
exports.getRoomsInfo = getRoomsInfo;
exports.prependRoom = prependRoom;
exports.isValid = isValid;
exports.postAuthenticate = postAuthenticate;
exports.stripHigh = stripHigh;
exports.stripLow = stripLow;
exports.debug = debug;
