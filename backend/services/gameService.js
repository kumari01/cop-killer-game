const { GameError } = require('../middleware/validation');
const roleService = require('./roleService');
const scoreService = require('./scoreService');
const { MIN_PLAYERS } = require('./roomService');

// Shared validation for the first round AND every later round: host identity, no pause,
// nobody registered is disconnected, and at least MIN_PLAYERS connected.
function assertCanDeal(room, pid) {
  if (pid !== room.hostId) throw new GameError('Only the host can start the game.');
  if (room.pause) throw new GameError('The game is paused while a player reconnects.');
  const all = [...room.players.values()], connected = all.filter(p => p.connected);
  if (connected.length < all.length) throw new GameError('Cannot start while a player is disconnected.');
  if (connected.length < MIN_PLAYERS) throw new GameError(`At least ${MIN_PLAYERS} connected players are required (${connected.length} connected).`);
}

// Deal roles to CONNECTED players only and open a round. Never touches round counters.
function dealRound(room) {
  const ids = [...room.players.values()].filter(p => p.connected).map(p => p.id), roles = roleService.generate(ids.length);
  room.roles = new Map(ids.map((id, i) => [id, roles[i]]));
  room.copId = ids.find(id => room.roles.get(id) === 'Cop');
  room.killerId = ids.find(id => room.roles.get(id) === 'Killer');
  room.players.forEach(p => { p.alive = true; });
  Object.assign(room, { status: 'playing', copUsed: false, deadCount: 0, deathLimit: Math.floor(ids.length / 2), result: null });
}

// Start a new game session with host-selected total rounds.
function start(room, pid, totalRounds = 1) {
  if (pid !== room.hostId) throw new GameError('Only the host can start the game.');
  if (room.status !== 'lobby') throw new GameError('Game already started.');
  assertCanDeal(room, pid);
  room.roundResults = [];
  room.totalRounds = totalRounds;
  room.currentRound = 1;
  dealRound(room);
}

// Advance to the next round when host clicks "Continue".
function nextRound(room, pid) {
  if (pid !== room.hostId) throw new GameError('Only the host can advance to the next round.');
  if (room.status !== 'over') throw new GameError('The current round is not over.');
  if (room.currentRound >= room.totalRounds) throw new GameError('All rounds have finished.');
  assertCanDeal(room, pid);
  room.currentRound++;
  dealRound(room);
}

// Host chose "remove disconnected players and restart": same round number, fresh roles for the remaining players.
function restartRound(room) {
  if (room.status !== 'playing') throw new GameError('The game is not active.');
  if (room.players.size < MIN_PLAYERS || [...room.players.values()].some(p => !p.connected)) throw new GameError('Not enough connected players to restart the round.');
  dealRound(room);
}

// Host chose "end the round": back to a clean lobby. No precondition on status; callers validate.
function abortToLobby(room) {
  room.status = 'lobby';
  room.roles = new Map(); room.copId = null; room.killerId = null;
  room.result = null; room.deadCount = 0; room.copUsed = false; room.deathLimit = 0;
  room.currentRound = 0; room.totalRounds = 1; room.roundResults = [];
  room.pause = null;
  room.players.forEach(p => { p.alive = true; });
}

// Finish the current round.
function finish(room, winner) {
  if (room.status !== 'playing' || room.pause) return null;

  room.status = 'over';
  const hasNextRound = room.currentRound < room.totalRounds;

  const result = {
    winner,
    killerId: room.killerId,
    killerName: room.players.get(room.killerId).name,
    deadCount: room.deadCount,
    total: room.players.size,
    round: room.currentRound,
    totalRounds: room.totalRounds,
    nextRound: hasNextRound,
    scoreboard: scoreService.finalScores(room, winner)
  };

  if (!room.roundResults) room.roundResults = [];
  room.roundResults.push(result);

  result.leaderboard = buildLeaderboard(room.roundResults);
  room.result = result;

  return { roundOver: true, nextRound: hasNextRound, result };
}

// Build a cumulative leaderboard from all round results.
function buildLeaderboard(roundResults) {
  const totals = {};
  for (const r of roundResults) {
    for (const s of r.scoreboard) {
      if (!totals[s.name]) totals[s.name] = { name: s.name, score: 0, wins: 0 };
      totals[s.name].score += s.score;
      if ((r.winner === 'cop' && s.role === 'Cop') || (r.winner === 'killer' && s.role === 'Killer')) {
        totals[s.name].wins++;
      }
    }
  }
  return Object.values(totals).sort((a, b) => b.score - a.score);
}

function reportDeath(room, pid) {
  if (room.status !== 'playing') throw new GameError('The game is not active.');
  if (room.pause) throw new GameError('The game is paused while a player reconnects.');
  const p = room.players.get(pid);
  if (pid === room.killerId) throw new GameError("You are the Killer — you can't report yourself as dead.");
  if (pid === room.copId) throw new GameError("You are the Cop — you can't report yourself as dead.");
  if (!p.alive) throw new GameError('You are already dead.');
  p.alive = false;
  room.deadCount++;
  if (room.deadCount >= room.deathLimit) return finish(room, 'killer');
  return { roundOver: false };
}

function copGuess(room, pid, suspectId) {
  if (room.status !== 'playing') throw new GameError('The game is not active.');
  if (room.pause) throw new GameError('The game is paused while a player reconnects.');
  if (pid !== room.copId) throw new GameError('Only the Cop can investigate.');
  if (!room.players.get(pid).alive) throw new GameError('You have been eliminated.');
  if (room.copUsed) throw new GameError('You have already used your guess.');
  const s = typeof suspectId === 'string' && room.players.get(suspectId);
  if (!s || s.id === pid || !s.alive) throw new GameError('Pick another living player.');
  
  // The Cop has only ONE chance to guess the killer!
  room.copUsed = true;
  if (s.id === room.killerId) {
    // Correct guess -> Cop wins!
    const r = finish(room, 'cop');
    return { correct: true, ...r };
  } else {
    // Wrong guess -> Cop used their only chance and failed, so Killer wins!
    const r = finish(room, 'killer');
    return { correct: false, ...r };
  }
}

function restart(room, pid) {
  if (pid !== room.hostId) throw new GameError('Only the host can restart.');
  if (room.status !== 'over') throw new GameError('The game is not finished.');
  abortToLobby(room);
}

// Private delivery: each player gets only their own role.
function sendRole(io, room, p) {
  const role = room.roles.get(p.id);
  if (p.socketId && role) {
    io.to(p.socketId).emit('private-role-assigned', {
      role,
      score: roleService.scoreFor(role),
      copUsed: role === 'Cop' && room.copUsed
    });
  }
}

module.exports = { start, nextRound, restartRound, abortToLobby, reportDeath, copGuess, restart, sendRole };
