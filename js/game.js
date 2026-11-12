/* Game state. Secret roles live only in this closure: never stored, logged or sent. */
const Game = (() => {
  let count = 6, roles = [], index = 0;
  return {
    getCount: () => count,
    setCount(n) { count = Math.max(Roles.MIN, Math.min(Roles.MAX, n)); return count; },
    start() { roles = Roles.generate(count); index = 0; },
    playerNumber: () => index + 1,
    isFinished: () => index >= roles.length,
    currentRole: () => roles[index],
    advance() { index++; if (index >= roles.length) roles = []; },
    reset() { roles = []; index = 0; }
  };
})();
