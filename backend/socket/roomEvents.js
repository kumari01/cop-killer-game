const rs = require('../services/roomService');
const gs = require('../services/gameService');
const ds = require('../services/disconnectService');
const { GameError, cleanName, cleanRoomId, guard } = require('../middleware/validation');

const payload = (room, p) => ({ roomId: room.id, playerId: p.id, token: p.token, state: rs.publicState(room) });
function attach(socket, room, p) {
  ds.disarm(p); // a (re)connected player never keeps a pending timeout
  Object.assign(p, { socketId: socket.id, connected: true });
  socket.data = { roomId: room.id, playerId: p.id };
  socket.join(room.id);
}
module.exports = io => io.on('connection', socket => {
  socket.on('create-room', guard(socket, ({ name }) => {
    if (socket.data.roomId) throw new GameError('You are already in a room.');
    const { room, player } = rs.createRoom(cleanName(name));
    attach(socket, room, player);
    socket.emit('room-created', payload(room, player));
  }));
  socket.on('join-room', guard(socket, ({ name, roomId }) => {
    if (socket.data.roomId) throw new GameError('You are already in a room.');
    const { room, player } = rs.joinRoom(cleanRoomId(roomId), cleanName(name));
    attach(socket, room, player);
    socket.emit('room-joined', payload(room, player));
    socket.to(room.id).emit('player-joined', { playerId: player.id, playerName: player.name });
    rs.broadcast(io, room);
  }));
  // Existing rejoin event + token auth, now also restores the pause/lobby state.
  socket.on('rejoin', guard(socket, ({ roomId, playerId, token }) => {
    const a = rs.authenticate(typeof roomId === 'string' ? roomId.toUpperCase() : '', playerId, token);
    if (!a) return socket.emit('session-invalid');
    const { room, player } = a;
    const old = player.socketId && io.sockets.sockets.get(player.socketId);
    if (old && old.id !== socket.id) { old.data = {}; old.leave(room.id); old.emit('session-invalid'); } // one connection per player
    attach(socket, room, player);
    ds.handleReconnect(io, room, player);               // clears timer; resumes the game only if everyone is back
    socket.emit('room-joined', payload(room, player));  // fresh public state (pause already resolved)
    if (room.status === 'playing') gs.sendRole(io, room, player); // original private role, only to its owner
    rs.broadcast(io, room);
  }));
  socket.on('leave-room', guard(socket, () => {
    const room = rs.getRoom(socket.data.roomId), p = room && room.players.get(socket.data.playerId);
    if (!p) return;
    socket.leave(room.id); socket.data = {};
    ds.handleLeave(io, room, p);
  }));
  socket.on('disconnect', () => {
    const room = rs.getRoom(socket.data.roomId), p = room && room.players.get(socket.data.playerId);
    if (!p || p.socketId !== socket.id) return; // stale socket: the player already moved to a newer one
    ds.handleDisconnect(io, room, p);
  });
});
