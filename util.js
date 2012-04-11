// Utility functions shared by all server code

var TwilioClient = require('twilio').Client;
var client = new TwilioClient('ACdd4df176cb5b41e6a424f60633982d8e', '8c2cc16d9a8570469569682b92283030', 'http://calchat.net:3000');
var phone = client.getPhoneNumber('+15107468123');

var email = require('./node_modules/mailer');

var redis = require('redis');
var redisUrl = 'db.calchat.net';
var client0 = redis.createClient(null, redisUrl);
client0.select(0);
var client1 = redis.createClient(null, redisUrl);
client1.select(1);
var client2 = redis.createClient(null, redisUrl);
client2.select(2);

// email, SMS, facebook app-generated request
function mentionNotification(to, mid) {
	mentionEmail(to, mid);	
	mentionSMS(to, mid);
}

function mentionEmail(to, mid) {
	getNotificationContent(to, mid, 'email', function(reply) {
		var content = reply;
		var link = 'http://calchat.net:3000/chat/'+content['roomUrl'];
		var msg = 'Hi,\n Message: '+content['txt']+'\n link: '+link;
		var toEmail = content['dest'];
		var subject = content['from']+' mentioned you in '+content['room'];
		sendEmail(toEmail, subject, msg, function() {
			console.log('sweet');				
		})
	});
}

function sendEmail(to, subject, body, callback) {
	console.log('sending email to '+to);
	console.log('subject: '+subject);
	console.log('body: '+body);
	email.send({
		host: "smtp.gmail.com",
		port: "465",
		ssl: true,
		domain: "localhost",
		to: to,
		from: "notifications@calchat.net",
		subject: subject,
		body: body,
		authentication: "login",
		username: "notifications@calchat.net",
		password: "sanrensei"
	}, 
	function(err, result) {
		if (err) { console.log('email: '+err); }
		console.log('email sent!');
		callback();
	});
}

// helper function to send an SMS notification
// to: user id to send message to
// mid: message id that generated the notification
function mentionSMS(to, mid) {
	getNotificationContent(to, mid, 'phone', function(reply) {
		content = reply;
		var footerLink = " - calchat.net:3000/chat/"+content['roomUrl'];
		var msg = content['from']+' mentioned you in '+content['room']+'!  Message: ';
		var msgSize = 160 - msg.length - footerLink.length;							
		var txt = content['txt'];
		if (txt.length > msgSize) {
			txt = txt.substring(0, msgSize - 2);
			txt = txt+'..';
		}
		msg = msg+txt+footerLink;
		// call helper function
		sendSMS(content['dest'], msg, null, function (sms) {
			console.log('done');
		});
	});
}

// to: destination uid
// mid: message id
// type: "email" or "phone"
function getNotificationContent(to, mid, type, callback) {
	var toReturn = {};	
	client2.hget('user:'+to, type, function(err, reply) {
		if (!err && reply != '') {
			toReturn['dest'] = reply;
			client2.hmget('message:'+mid, 'from', 'to', 'text', function(err, replies) {
				if (!err && replies.length) {
					client2.hget('user:'+replies[0], 'nick', function (err, reply) {
						if (!err && reply != '') {
							getRoomInfo(replies[1], null, function(roomInfo) {
								console.log('sldkfjsldkfjlsdkjf');
								console.log(reply);
								var room = roomInfo;
								toReturn['roomUrl'] = room.url;
								toReturn['from'] = reply;
								toReturn['txt'] = replies[2];
								toReturn['room'] = room.pretty;
								if (room.type == "private") {
									toReturn['room'] = "a private chat";
								}
								callback(toReturn);
							});
						}
					});
				}
			});
		}
	});
}

// helper function to send an SMS notification
function sendSMS(number, message, opts, callback) {
	console.log('sending SMS');
	console.log('number: '+number);
	console.log('message: '+message);
	// uses twilio library
	if (number) {
		phone.sendSms(number, message, opts, callback);
	}
}

// helper function to send multiple SMS notifications
function sendMultipleSMS(numbers, message, opts, callback) {
	for (var i = 0; i < numbers.length; i++) {
		sendSMS(numbers[i], message, opts, callback);
	}
}

// helper function to turn a room id into a room object
// rawId: the room id
// callerId: id of the client who calls the function
// callback: passes a room object containing the id, official name, pretty name, title, etc
function getRoomInfo(rawId, callerId, callback) {
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
									getRoomInfo(classId, callerId, function(roomObject) {
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
									// check if room is a user
									client2.hgetall('user:'+rawId, function(err, user) {
										if (!err && Object.keys(user).length) {
											if (rawId == callerId) {
												callback();
												return;
											}
											rawId = Math.min(rawId,callerId)+':'+Math.max(rawId,callerId);
										}
																				
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
									});
								}
							});
						}
					});
				}
			});
		}
	});
}

// helper function to get multiple room objects at once
// roomIds: list of room ids
// callerId: user id of the client calling this function
// callback: passes a list of room objects
function getRoomsInfo(roomIds, callerId, callback) {
	debug('getRoomsInfo');
	if (!roomIds.length) {
		callback([]);
	}
	
	// deduplicate
	var temp = {};
	for (var i = 0; i < roomIds.length; i++) {
		var roomId = roomIds[i];
		var lastChar = roomId.charAt(roomId.length - 1);
		// cleanup special characters
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
			getRoomInfo(roomId, callerId, function(room) {
				added++;

				// preserve order
				rooms[n] = room;

				// when all room objects have been returned, callback
				if (added == roomIds.length) {
					var ret = [];
					for (var i = 0; i < rooms.length; i++) {
						var r = rooms[i];
						// remove null responses
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

// helper function to prepend room to rooms (use this only if rooms exists!)
function prependRoom(room, unreads, rooms) {
	debug('prependRoom', room, rooms);
	// find if room exists in rooms
	var index = -1;
	for (var i = 0; i < rooms.length; i++) {
		if (rooms[i] == room) {
			index = i;
		}
	}
	// if not exist, move it to the front
	if (index == -1) {
		rooms.unshift(room);
		if (unreads) {
			unreads.unshift(new Date().getTime());
		}
	} else { // if exists, splice it out
		rooms.unshift(rooms.splice(index, 1)[0]);
		if (unreads) {
			unreads.unshift(unreads.splice(index, 1)[0]);
		}
	}
}

// helper function to determine whether a room id is valid
// roomId: id of the room
// callback: passes 2 things
// 		isValid: true if any form of roomid is valid
//		rawId: if isValid, caller must use rawId, the normalized room id
function isValid(roomId, callback) {
	debug('isValid', roomId);
	if (!roomId) {
		callback(false);
		return;
	} else {
		// sanitize input
		roomId = stripHigh(roomId, false);

		// try to find room in the database
		var score = stringScore(roomId);
		client0.zrangebyscore('validrooms', score, score, function(err, rooms) {
			// room is valid if it is the raw id or an abbreviation (ELENG40 or EE40) or a redirect (306SODA)
			if (!err && rooms.length) {
				var sameLastChars = [];
				for (var i = 0; i < rooms.length; i++) {
					// set suggestion to the RAW ID (sometimes followed by # if the input room was an abbreviation)
					var suggestion = rooms[i];

					var lastChar = suggestion.charAt(suggestion.length - 1);
					
					// if $ is at the end then it means roomId was a room like 306SODA and you need to redirect to class held at 306SODA at the current time
					if (lastChar == '$') {
						getRoomInfo(suggestion.substring(0, suggestion.length-1), null, function(room) {
							if (room) {
								callback(true, room.id);
							} else {
								callback(false);
							}
						});
						return;
					} else {
						// a # at the end signifies an abbreviated room id
						if (lastChar == '#') {
								// remove # at the end
								suggestion = suggestion.substring(0, suggestion.length - 1);
						} 

						// in most cases, there will be only one suggestion which matches the room id
						if (suggestion == roomId && rooms.length == 1) {
							callback(true, suggestion);
							return;
						}

						// when there are conflicts (because of stringScore and double precision), generate all suggestions
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

				// pick best suggestion from list
				sameLastChars.sort(function(a,b) {
					return b.sameLastChar - a.sameLastChar;
				});

				callback(true, sameLastChars[0].suggestion);
			} else {
				// not in validrooms db. Check if it is a private chat to another user
				if (roomId.indexOf(':') != -1) {
					var uids = roomId.split(':');
					// both users have to exist
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

//ids: list of user ids
//callback: passes a map of user ids to user objects
function getUsers(ids, callback) {
	debug('getUsers', ids);
	if (!ids || !Object.keys(ids).length) {
		callback({});
	}

	var users = {};
	
    // INFO
    // this for loop is asynchronous (because of redis), so lots of things need to be done:
    var added = 0;
    for (var i = 0; i < ids.length; i++) {
        // create closure to make sure variables in one loop iteration don't overwrite the previous iterations
        function closure() {
        	var id = ids[i];
        	client2.hgetall('user:'+id, function(err, user) {
        		added++;
        		if (!err && Object.keys(user).length) {
            		// create a user object
            		users[id] = {
            			name		: user.firstname+' '+user.lastname.charAt(0),
            			gsirooms	: user.gsirooms,
            			special		: user.special,
            		}
            	} else {
            		debug(err, 'getUsers');
            	}

            	if (added == ids.length) {
            		// return from function when all async have processed
            		callback(users);
            	}
            });
        }
        // immediately call the created closure
        closure();
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

// helper function to simplify autocompletion and typeaheads
// stringScore() takes any string as input, and returns a hash H such that H1 of a string1 that is the beginning of another string2 is always smaller than the H2 of that string2.
// The H3 of - a string3 whose first nth character from the left greater (alphanumerically) than the nth character of a string4 - is always greater than the H4 of that string4
// H('abc') < H('abc0')
// H('abd') > H('abc9f9f9ff9f9f9f')
// these properties are used in zrange db queries
function stringScore(string, strip) {
	if (!string) return '-inf';

	if (strip === undefined || strip) {
		string = stripHigh(string);
	}
	
	var hash = 0;

	for (var i = 0; i < string.length; i++) {
		hash += (string.charCodeAt(i) - '0'.charCodeAt()) / Math.pow('Z'.charCodeAt() - '0'.charCodeAt() + 1, i);
	}
	return hash;
}

// helper function to simplify autocompletion and typeaheads
// capStringScore() returns the hash H of the string that is 'one higher' than the input string
// a string1 is 'one higher' than a string2 when string1 == string2 except for the last characters c1 and c2, and c1 = c2+1
// this gives the nice behavior where stringScore(S) <= stringScore(S . any_string) < capStringScore(S)
// these properties are used in zrange db queries
function capStringScore(string) {
	if (!string) return '+inf';

	string = stripHigh(string);
	var last = string.charAt(string.length - 1);
	var next = String.fromCharCode(last.charCodeAt() + 1);
	var cap = string.substring(0, string.length - 1) + next;
	debug('capStringScore', string, cap);
	return '('+stringScore(cap, false);
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

exports.mentionNotification = mentionNotification;
exports.getUsers = getUsers;
exports.isPhoneNum = isPhoneNum;
exports.getRoomInfo = getRoomInfo;
exports.getRoomsInfo = getRoomsInfo;
exports.prependRoom = prependRoom;
exports.isValid = isValid;
exports.postAuthenticate = postAuthenticate;
exports.stripHigh = stripHigh;
exports.stripLow = stripLow;
exports.stringScore = stringScore;
exports.capStringScore = capStringScore;
exports.debug = debug;
