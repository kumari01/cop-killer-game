/* Role generation: pure logic, no DOM. */
const Roles = (() => {
  const MIN = 4, MAX = 10;
  const SCORES = { 'Cop': 1000, 'Killer': 0 };
  for (let i = 1; i <= 8; i++) SCORES['Person ' + i] = 1000 - i * 100;
  function randInt(n) { // unbiased random in [0, n)
    const c = window.crypto, lim = Math.floor(4294967296 / n) * n, a = new Uint32Array(1);
    do { c.getRandomValues(a); } while (a[0] >= lim);
    return a[0] % n;
  }
  function shuffle(arr) { // Fisher-Yates
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = randInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function build(n) {
    const r = ['Cop', 'Killer'];
    for (let i = 1; i <= n - 2; i++) r.push('Person ' + i);
    return r;
  }
  const typeOf = r => r === 'Cop' ? 'cop' : r === 'Killer' ? 'killer' : 'person';
  return { MIN, MAX, SCORES, build, shuffle, typeOf, generate: n => shuffle(build(n)) };
})();
if (typeof module !== 'undefined') module.exports = Roles;
