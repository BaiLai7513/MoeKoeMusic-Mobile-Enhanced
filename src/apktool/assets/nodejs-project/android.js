// MoeKoe Music Android entry.
// The Android service starts Node with this file. It pins the server to the
// local loopback and the single-port design port 6521.
process.env.PORT = process.env.PORT || '6521';
process.env.HOST = process.env.HOST || '127.0.0.1';
require('./app.js');
