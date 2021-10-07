//   Minimal BIBFRAME Editor Node.js server. To run from the command-line:
//   node server-bfe.js

var express = require('express');
var app = express();
var port = process.env.PORT || 8000;

app.use(express.static(__dirname + '/'));
app.listen(port);

console.log('BIBFRAME Editor running');
console.log('Press Ctrl + C to stop.'); 
