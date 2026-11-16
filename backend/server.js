const path = require('path'), http = require('http');
const express = require('express'), cors = require('cors'), { Server } = require('socket.io');
const origin = process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(',') : true;
const app = express();
app.use(cors({ origin }));
app.get('/healthz', (_, res) => res.send('ok'));
app.use(express.static(path.join(__dirname, '..', 'frontend'))); // lets one service host both
const server = http.createServer(app);
const io = new Server(server, { cors: { origin } });
require('./socket/roomEvents')(io);
require('./socket/gameEvents')(io);
server.listen(process.env.PORT || 3001, () => console.log('Cop & Killer on :' + (process.env.PORT || 3001)));
