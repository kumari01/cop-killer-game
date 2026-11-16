const rs = require('../services/roomService');
const gs = require('../services/gameService');
const ds = require('../services/disconnectService');
const { GameError, guard } = require('../middleware/validation');

// Identity always comes from the server-side socket session, never from the client payload.
function session(socket) {
  const room = rs.getRoom(socket.data.roomId), player = room && room.players.get(socket.data.playerId);
  if (!player || player.socketId !== socket.id) throw new GameError('You are not in a room.');
  return { room, player };
}

// After a round ends, emit result to everyone.
function handleRoundEnd(io, room, roundResult) {
  const payload = { ...roundResult.result, nextRound: roundResult.nextRound };
  io.to(room.id).emit('game-over', payload);
  rs.broadcast(io, room);
}

module.exports = io => io.on('connection', socket => {
  socket.on('start-game', guard(socket, ({ rounds } = {}) => {
    const { room, player } = session(socket);
    const totalRounds = Number.isInteger(rounds) && rounds > 0 ? rounds : 1;
    gs.start(room, player.id, totalRounds);
    io.to(room.id).emit('game-started', rs.publicState(room));
    room.players.forEach(p => gs.sendRole(io, room, p));
  }));

  socket.on('next-round', guard(socket, () => {
    const { room, player } = session(socket);
    gs.nextRound(room, player.id);
    io.to(room.id).emit('game-started', rs.publicState(room));
    room.players.forEach(p => gs.sendRole(io, room, p));
  }));

  socket.on('report-death', guard(socket, () => {
    const { room, player } = session(socket);
    const r = gs.reportDeath(room, player.id);
    io.to(room.id).emit('player-eliminated', { playerId: player.id, playerName: player.name, deadCount: room.deadCount });
    if (r && r.roundOver) {
      handleRoundEnd(io, room, r);
    } else {
      rs.broadcast(io, room);
    }
  }));

  socket.on('submit-cop-guess', guard(socket, ({ suspectId }) => {
    const { room, player } = session(socket);
    const r = gs.copGuess(room, player.id, suspectId);
    socket.emit('cop-guess-result', { correct: r.correct });
    if (r && r.roundOver) {
      handleRoundEnd(io, room, r);
    } else {
      rs.broadcast(io, room);
    }
  }));

  // Host's decision after a player's 30s reconnect window expires (host-only, validated in disconnectService).
  socket.on('host-end-round', guard(socket, () => {
    const { room, player } = session(socket);
    ds.endRoundToLobby(io, room, player.id);
  }));

  socket.on('host-remove-restart', guard(socket, () => {
    const { room, player } = session(socket);
    ds.removeAndRestart(io, room, player.id);
  }));

  socket.on('restart-game', guard(socket, () => {
    const { room, player } = session(socket);
    gs.restart(room, player.id);
    rs.broadcast(io, room);
  }));
});
