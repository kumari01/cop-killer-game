const crypto = require('crypto');
const { GameError } = require('../middleware/validation');
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', MAX = 10, rooms = new Map();
// Disconnect-management constants (shared by services and the public state).
// (Env overrides exist only so the automated test can run in seconds; defaults are the required 15s / 30s.)
const MIN_PLAYERS = 4, LOBBY_GRACE_MS = Number(process.env.CK_LOBBY_GRACE_MS) || 15000, GAME_GRACE_MS = Number(process.env.CK_GAME_GRACE_MS) || 30000;
const newRoomId = () => { let r; do { r = Array.from({ length: 6 }, () => ALPHA[crypto.randomInt(ALPHA.length)]).join(''); } while (rooms.has(r)); return r; };
// `timer`/`deadline`/`seq` belong to disconnectService: one reconnect timer per player, with a sequence number so stale timers can never fire.
const newPlayer = name => ({ id: crypto.randomBytes(8).toString('hex'), token: crypto.randomBytes(16).toString('hex'), name, alive: true, connected: true, socketId: null, timer: null, deadline: null, seq: 0 });
const getRoom = id => rooms.get(id);

function createRoom(name) {
  const p = newPlayer(name);
  const room = { id: newRoomId(), hostId: p.id, status: 'lobby', players: new Map([[p.id, p]]), roles: new Map(), copId: null, killerId: null, copUsed: false, deathLimit: 0, deadCount: 0, result: null, pause: null };
  rooms.set(room.id, room);
  return { room, player: p };
}
function joinRoom(roomId, name) {
  const room = rooms.get(roomId);
  if (!room) throw new GameError('Room not found.');
  if (room.status !== 'lobby') throw new GameError('This game has already started.');
  if (room.players.size >= MAX) throw new GameError('Room is full.');
  if ([...room.players.values()].some(p => p.name.toLowerCase() === name.toLowerCase())) throw new GameError('That name is taken in this room.');
  const p = newPlayer(name);
  room.players.set(p.id, p);
  return { room, player: p };
}
function authenticate(roomId, playerId, token) {
  const room = rooms.get(roomId), p = room && room.players.get(playerId);
  if (!p || typeof token !== 'string' || token.length !== p.token.length) return null;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(p.token)) ? { room, player: p } : null;
}
function removePlayer(room, pid) {
  const gone = room.players.get(pid);
  if (gone) { clearTimeout(gone.timer); gone.timer = null; gone.deadline = null; gone.seq++; }
  room.players.delete(pid);
  if (room.pause) room.pause.expired.delete(pid);
  if (!room.players.size) { rooms.delete(room.id); return false; }
  // New host: prefer someone who is actually connected.
  if (room.hostId === pid) room.hostId = ([...room.players.values()].find(p => p.connected) || room.players.values().next().value).id;
  return true;
}
// Destroy a room and every timer it owns (used when nobody is left connected).
function deleteRoom(room) {
  room.players.forEach(p => { clearTimeout(p.timer); p.timer = null; p.seq++; });
  rooms.delete(room.id);
}
// Public view of an active pause. Names/countdowns only — NEVER roles (a Killer/Cop disconnect must look identical to anyone else's).
function pauseView(room) {
  if (!room.pause) return null;
  const now = Date.now(), off = [...room.players.values()].filter(p => !p.connected);
  const remaining = room.players.size - off.length;
  return {
    players: off.map(p => ({ id: p.id, name: p.name, expired: room.pause.expired.has(p.id), remainingMs: p.deadline ? Math.max(0, p.deadline - now) : 0 })),
    awaitingHost: off.some(p => room.pause.expired.has(p.id)),
    canRestart: remaining >= MIN_PLAYERS,
    remainingAfterRemoval: remaining
  };
}
// Public state only: never contains roles until the game is over.
function publicState(room) {
  const now = Date.now(), list = [...room.players.values()];
  return {
    roomId: room.id, hostId: room.hostId, status: room.status, total: room.players.size,
    connectedCount: list.filter(p => p.connected).length, minPlayers: MIN_PLAYERS,
    deadCount: room.deadCount, deathLimit: room.deathLimit, max: MAX,
    currentRound: room.currentRound || 0, totalRounds: room.totalRounds || 1,
    players: list.map(p => ({ id: p.id, name: p.name, alive: p.alive, connected: p.connected, isHost: p.id === room.hostId, reconnectInMs: !p.connected && p.deadline ? Math.max(0, p.deadline - now) : null })),
    paused: !!room.pause, pause: pauseView(room),
    result: room.status === 'over' ? room.result : null
  };
}
const broadcast = (io, room) => io.to(room.id).emit('game-state-updated', publicState(room));
module.exports = { createRoom, joinRoom, authenticate, removePlayer, deleteRoom, getRoom, publicState, pauseView, broadcast, MAX, MIN_PLAYERS, LOBBY_GRACE_MS, GAME_GRACE_MS };
