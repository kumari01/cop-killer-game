const { scoreFor } = require('./roleService');
// Persons keep fixed scores. Winning special role gets 1000, losing one 0.
function finalScores(room, winner) {
  return [...room.players.values()].map(p => {
    const role = room.roles.get(p.id);
    const score = role === 'Cop' ? (winner === 'cop' ? 1000 : 0) : role === 'Killer' ? (winner === 'killer' ? 1000 : 0) : scoreFor(role);
    return { name: p.name, role, score, alive: p.alive };
  });
}
module.exports = { finalScores };
