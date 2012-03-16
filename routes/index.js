var util = require('util')

/*
 * GET home page.
 */
exports.index = function(req, res) {
  res.render('index', { 
    title: 'CalChat' 
  });
};

exports.chat = function(req, res) {
  res.render('chat', { 
    title: 'CalChat Chat', 
    layout: false 
  });
};
