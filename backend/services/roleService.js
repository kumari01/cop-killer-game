const crypto = require('crypto');
function shuffle(a) { // Fisher-Yates, crypto randomness
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function generate(n) {
  const r = ['Cop', 'Killer'];
  for (let i = 1; i <= n - 2; i++) r.push('Person ' + i);
  return shuffle(r);
}
const scoreFor = role => role === 'Cop' ? 1000 : role === 'Killer' ? 0 : 1000 - 100 * Number(role.split(' ')[1]);
module.exports = { generate, scoreFor };