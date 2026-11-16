/* Disconnect management: reconnect timers, game pause/resume, and the host's timeout decision.
 * Rules: one timer per player; every timer carries a sequence number so a stale/duplicate callback is a no-op;
 * room.pause is non-null  <=>  status is 'playing' and at least one player is disconnected. */
const rs = require('./roomService');
const gs = require('./gameService');
const { GameError } = require('../middleware/validation');

function disarm(p) { clearTimeout(p.timer); p.timer = null; p.deadline = null; p.seq++; }
function arm(room, p, ms, onFire) {
  clearTimeout(p.timer);
  const seq = ++p.seq;
  p.deadline = Date.now() + ms;
  p.timer = setTimeout(() => {
    // Stale guard: reconnected, re-armed, removed, or room destroyed since this timer was set.
    if (p.seq !== seq || p.connected || room.players.get(p.id) !== p || rs.getRoom(room.id) !== room) return;
    p.timer = null; p.deadline = null;
    onFire();
  }, ms);
}

// Lobby / between-rounds: remove a player who never came back.
function removeOffline(io, room, p) {
  if (room.status === 'playing' || p.connected || !room.players.has(p.id)) return;
  const name = p.name;
  if (rs.removePlayer(room, p.id)) {
    io.to(room.id).emit('player-removed', { playerId: p.id, playerName: name, reason: 'disconnected' });
    rs.broadcast(io, room);
  }
}

// During a pause the host must be someone who can click the timeout buttons.
function ensureConnectedHost(io, room) {
  const host = room.players.get(room.hostId);
  if (host && host.connected) return true;
  const next = [...room.players.values()].find(p => p.connected);
  if (!next) return false;
  room.hostId = next.id;
  io.to(room.id).emit('host-changed', { playerId: next.id, playerName: next.name });
  return true;
}

// 30s grace ran out (or the player left on purpose): notify everyone and let the host decide. Roles are NOT touched.
function expireInGame(io, room, p) {
  if (room.status !== 'playing' || !room.pause || p.connected || !room.players.has(p.id)) return;
  if (room.pause.expired.has(p.id)) return; // never run the timeout twice
  room.pause.expired.add(p.id); p.timer = null; p.deadline = null;
  if (!ensureConnectedHost(io, room)) return rs.deleteRoom(room); // nobody left to decide
  io.to(room.id).emit('pause-timeout', { playerId: p.id, playerName: p.name, pause: rs.pauseView(room) });
  rs.broadcast(io, room);
}

// Socket dropped (or a player left mid-game when `immediate`).
function handleDisconnect(io, room, p, { immediate = false } = {}) {
  if (!room.players.has(p.id)) return;
  Object.assign(p, { connected: false, socketId: null });
  if (room.status === 'playing') {
    if (!room.pause) room.pause = { expired: new Set() };
    room.pause.expired.delete(p.id);
    if (immediate) disarm(p); else arm(room, p, rs.GAME_GRACE_MS, () => expireInGame(io, room, p));
    ensureConnectedHost(io, room); // only matters once someone's grace has expired
    io.to(room.id).emit('game-paused', { trigger: 'disconnect', playerId: p.id, playerName: p.name, pause: rs.pauseView(room) });
    if (immediate) expireInGame(io, room, p); else rs.broadcast(io, room);
  } else {
    arm(room, p, rs.LOBBY_GRACE_MS, () => removeOffline(io, room, p));
    rs.broadcast(io, room);
  }
}

// Player pressed "Leave": removed at once in lobby / between rounds, treated as a permanent drop mid-game.
function handleLeave(io, room, p) {
  if (room.status === 'playing') return handleDisconnect(io, room, p, { immediate: true });
  const name = p.name;
  if (rs.removePlayer(room, p.id)) { io.to(room.id).emit('player-left', { playerId: p.id, playerName: name }); rs.broadcast(io, room); }
}

// Call AFTER the socket has been re-attached (p.connected === true). Clears the timer; resumes only when everyone is back.
function handleReconnect(io, room, p) {
  disarm(p);
  if (room.status !== 'playing' || !room.pause) return;
  room.pause.expired.delete(p.id);
  if ([...room.players.values()].every(x => x.connected)) {
    room.pause = null;
    io.to(room.id).emit('game-resumed', { playerId: p.id, playerName: p.name });
  } else {
    io.to(room.id).emit('game-paused', { trigger: 'reconnect', playerId: p.id, playerName: p.name, pause: rs.pauseView(room) });
  }
}

function assertDecision(room, pid) {
  if (pid !== room.hostId) throw new GameError('Only the host can do that.');
  if (room.status !== 'playing' || !room.pause) throw new GameError('The game is not paused.');
  if (!rs.pauseView(room).awaitingHost) throw new GameError('Players still have time to reconnect.');
}

// Option 1: end the round, back to the lobby (disconnected players then follow the 15s lobby rule).
function endRoundToLobby(io, room, pid) {
  assertDecision(room, pid);
  const by = room.players.get(pid).name;
  gs.abortToLobby(room);
  room.players.forEach(p => { if (!p.connected) arm(room, p, rs.LOBBY_GRACE_MS, () => removeOffline(io, room, p)); });
  io.to(room.id).emit('round-aborted', { by });
  rs.broadcast(io, room);
}

// Option 2: remove every currently-disconnected player and restart the SAME round with freshly shuffled roles.
function removeAndRestart(io, room, pid) {
  assertDecision(room, pid);
  const gone = [...room.players.values()].filter(p => !p.connected);
  if (room.players.size - gone.length < rs.MIN_PLAYERS) throw new GameError(`At least ${rs.MIN_PLAYERS} connected players are needed to restart the round. End the round instead.`);
  gone.forEach(p => { rs.removePlayer(room, p.id); io.to(room.id).emit('player-removed', { playerId: p.id, playerName: p.name, reason: 'disconnected' }); });
  room.pause = null;
  gs.restartRound(room);
  io.to(room.id).emit('game-started', rs.publicState(room));
  room.players.forEach(p => gs.sendRole(io, room, p));
}

module.exports = { handleDisconnect, handleLeave, handleReconnect, endRoundToLobby, removeAndRestart, disarm };
