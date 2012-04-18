// Utility functions shared by all server code
var mURL = 'http://www.calchat.net';
var mChatURL = 'http://www.calchat.net/chat/';

var TwilioClient = require('twilio').Client;
var client = new TwilioClient('ACdd4df176cb5b41e6a424f60633982d8e', '8c2cc16d9a8570469569682b92283030', mURL);
var phone = client.getPhoneNumber('+15107468123');

var email = require('./node_modules/mailer');

var sanitize = require('validator').sanitize;

var request = require('request');

var redis = require('redis');
var redisUrl = 'db.calchat.net';
var client0 = redis.createClient(6379, redisUrl);
client0.select(0);
var client1 = redis.createClient(6379, redisUrl);
client1.select(1);
var client2 = redis.createClient(6379, redisUrl);
client2.select(2);

// email, SMS, facebook app-generated request
function mentionNotification(from, user, mid) {
	if (user.emailenable != 0) {
		mentionEmail(from, user.id, user.name, mid);
	}
	if (user.phoneenable != 0) {
		mentionSMS(user.id, mid);
	}
}

function mentionEmail(from, to, toName, mid) {
	getNotificationContent(to, mid, 'email', function(reply) {
		var content = reply;
		var link = mChatURL+content['roomUrl'];
		var subject = content['from']+' mentioned you in '+content['room'];
		var data = {
			  'fromName': content['from'],
			  'toName': toName,
			  'chatroom': content['room'],
			  'message': content['txt'],
			  'link': link
		};
		var template = './views/templates/mentionEmail.txt';
		sendEmail(subject, content['dest'], template, data, function() {
			console.log('sweet');				
		});
	});
}

function sendEmail(subject, to, template, data, callback) {
	console.log('sending email to '+to);
	email.send({
		host: "smtp.gmail.com",
		port: "465",
		ssl: true,
		domain: "localhost",
		to: to,
		from: "notifications@calchat.net",
		subject: subject,
		template: template,
		data: data,
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
		var longUrl = mChatURL+content['roomUrl'];

		// get short url
		getShortUrl(longUrl, function(shortUrl) {
			if (shortUrl) {
				var footerLink = ' - '+shortUrl;	
				var msg = content['from']+' mentioned you in '+content['room']+'!  Message: ';
				var msgSize = 160 - msg.length - footerLink.length;							
				var txt = sanitize(content['txt']).entityDecode();
				if (txt.length > msgSize) {
					txt = txt.substring(0, msgSize - 2);
					txt = txt+'..';
				}
				msg = msg+txt+footerLink;
				// call helper function
				sendSMS(content['dest'], msg, null, function (sms) {
					console.log('done');
				});
			} else {
				console.log('sms: failed to get short url');
			}
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
									if (rawId == callerId) {
										callback();
										return;
									} else if (callerId) {									
										client2.hgetall('user:'+Math.min(rawId,callerId), function(err, user1) {
											if (!err && Object.keys(user1).length) {
												client2.hgetall('user:'+Math.max(rawId,callerId), function(err, user2) {
													if (!err && Object.keys(user2).length) {
														// if room is a user, turn it into a private group chat
														var groupId = Math.min(rawId,callerId)+':'+Math.max(rawId,callerId);
														var title1 = user1.firstname+' '+user1.lastname[0];
														var title2 = user2.firstname+' '+user2.lastname[0];
														var groupDescription = title1+':'+title2;
														rawId = groupId+'::private::'+groupDescription;
														
														// room is a user. convert to a private group chat
														userContinue(rawId, callback);
													} else {
														// room is not a user
														userContinue(rawId, callback);
													}
												});
											} else {
												// room is not a user
												userContinue(rawId, callback);
											}
										});
									} else {
										// did not provide callerId
										userContinue(rawId, callback);
									}
									
									function userContinue(rawId, callback) {
										findOrCreateGroup(rawId, callerId, function(isValid, suggestion, groupObject) {
											if (isValid) {
												// created private group chat based on user
												callback(groupObject);
											} else {
												// remove callback if there are more cases
												callback();
												// check for more cases here
											}
										});
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
function isValid(roomId, callerId, callback) {
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
						getRoomInfo(suggestion.substring(0, suggestion.length-1), callerId, function(room) {
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
				// not in validrooms db. Check if it is a group
				findOrCreateGroup(roomId, callerId, function(isValid, suggestion) {
					if (isValid) {
						callback(isValid, suggestion);
					} else {
						callback(false);
					}
				});
			}
		});
	}
}

//ids: list of user ids
//callback: passes a map of user ids to user objects
function getUsers(ids, callerId, callback) {
	debug('getUsers', ids, callerId);
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
        			var gsirooms = [];
        			var oldgsirooms = user.gsirooms.split(',');
        			for (var i = 0; i < oldgsirooms.length; i++) {
        				var roomId = oldgsirooms[i];
        				gsirooms.push(roomId.split('::')[0]);
        			};
            		// create a user object
            		users[id] = {
            			id 			: id,
            			name		: user.nick,
            			gsirooms	: gsirooms.join(),
            			special		: user.special,
            			emailenable : user.emailenable,
            			phoneenable : user.phoneenable,
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

function getShortUrl(longUrl, callback) {
	var options = {
		uri: 'https://www.googleapis.com/urlshortener/v1/url',
		method: 'POST',
		json: {
			'longUrl': longUrl
		}
	};
	request(options, function(error, response, body) {
		if (!error && response.statusCode == 200) {
			callback(body.id);
		}
	});
}

function stripLow(string) {
	var splitIndex = string.indexOf('::');
	var front = string;
	var back = '';
	if (splitIndex != -1) {
		front = string.substring(0, splitIndex);
		back = string.substring(splitIndex);
	}
	return front.replace(/[^A-Za-z0-9:]/g, '').toLowerCase()+back;
}

function stripHigh(string) {
	var splitIndex = string.indexOf('::');
	var front = string;
	var back = '';
	if (splitIndex != -1) {
		front = string.substring(0, splitIndex);
		back = string.substring(splitIndex);
	}
	return front.replace(/[^A-Za-z0-9:]/g, '').toUpperCase()+back;
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

function findOrCreateGroup(roomId, callerId, callback) {
	debug('findOrCreateGroup', roomId, callerId);
	
	if (roomId.indexOf('::') != -1) {
		var roomsplit = roomId.split('::');
		var groupId = roomsplit[0];
		var key = roomsplit[1];
		var description = groupId;
		
		if (roomsplit.length >= 3) {
			description = roomsplit[2];
		}
		
		client2.hgetall('group:'+groupId, function(err, groupObject) {
			if (!err && Object.keys(groupObject).length) {
				// group exists
				var groupKey = groupObject.key;
				if (groupKey == key) {
					// correct key for existing group
					callback(true, groupId+'::'+key, groupObject);
				} else {
					callback(false);
				}
			} else if (callerId) {
				// group does not exist. create a new group
				// only logged in users can create new groups
				
				if (key == 'new') {
					// create new key if not provided								
					key = generateKey();
				}
				
				var isuserchat = groupId.indexOf(':') != -1;
				var title = isuserchat ? 'Private user chat' : 'Private group chat';
				var type = isuserchat ? 'private' : 'group';
				key = isuserchat ? 'private' : key;
				
				groupObject = {
					id			: groupId+'::'+key,
					url			: stripLow(groupId+'::'+key),
					pretty		: description,
					title		: title,
					type		: type,
					
					key 		: key,
				};
				
				if (!isuserchat) {
					groupObject.creator = callerId;
					// set creator as gsi 
					client2.hget('user:'+callerId, 'gsirooms', function(err, gsirooms) {
						if (gsirooms) {
							var roomIds = gsirooms.split(',');
							var index = roomIds.indexOf(groupId+'::'+key);
							if (index != -1) {
								roomIds.unshift(roomIds.splice(index, 1));
							} else {
								roomIds.unshift(groupId+'::'+key);
							}
							client2.hset('user:'+callerId, 'gsirooms', roomIds.join());
						} else {
							client2.hset('user:'+callerId, 'gsirooms', groupId+'::'+key);
						}
					});
				}
				
				client2.hmset('group:'+groupId, groupObject, function(err) {
					// we are not adding groups to validrooms because there is a secret key
					if (!err) {
						// group created
						callback(true, groupId+'::'+key, groupObject);
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

// generates random key if no seed. else generates predictable key
function generateKey(seed) {
    var chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxy'.split('');
    var length = 12;
    if (seed) {
    	length = seed.length;
    }
    var str = '';
    for (var i = 0; i < length; i++) {
    	var random = Math.random();
    	if (seed) {
    		var c = seed.charCodeAt(i);
    		if (c == 0) random = 0;
    		else random = 1 / c;
    	}
        str += chars[Math.floor(97*random * chars.length) % chars.length];
    }
    return str;
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
