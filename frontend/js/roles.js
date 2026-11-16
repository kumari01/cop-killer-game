/* Role definitions & display helpers for both Classic and Online modes. */
const Roles = (() => {
  const MIN = 4, MAX = 10;
  const SCORES = { 'Cop': 1000, 'Killer': 0 };
  for (let i = 1; i <= 8; i++) SCORES['Person ' + i] = 1000 - i * 100;

  function randInt(n) {
    const c = window.crypto, lim = Math.floor(4294967296 / n) * n, a = new Uint32Array(1);
    do { c.getRandomValues(a); } while (a[0] >= lim);
    return a[0] % n;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function build(n) {
    const r = ['Cop', 'Killer'];
    for (let i = 1; i <= n - 2; i++) r.push('Person ' + i);
    return r;
  }

  return {
    MIN, MAX, SCORES, build, shuffle,
    typeOf: r => r === 'Cop' ? 'cop' : r === 'Killer' ? 'killer' : 'person',
    icon: r => r === 'Cop' ? 'shield' : r === 'Killer' ? 'skull' : 'user',
    scoreFor: r => SCORES[r] != null ? SCORES[r] : 500,
    generate: n => shuffle(build(n))
  };
})();

if (typeof module !== 'undefined') module.exports = Roles;
