/* Navigation and event wiring. */
(() => {
  let revealed = false;
  const go = {
    start: () => { UI.renderSelect(Game.getCount()); UI.show('select'); },
    home: () => { Game.reset(); UI.hideRole(); revealed = false; UI.show('home'); },
    generate: () => { Game.start(); UI.show('ready'); },
    'reveal-start': () => { UI.hideRole(); UI.renderTurn(Game.playerNumber(), Game.getCount()); UI.show('reveal'); },
    finish: () => go.home(),
    again: () => go.start()
  };
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-action]');
    if (b && go[b.dataset.action]) go[b.dataset.action]();
  });
  const step = d => UI.renderSelect(Game.setCount(Game.getCount() + d));
  UI.$('minus').onclick = () => step(-1);
  UI.$('plus').onclick = () => step(1);
  UI.$('btn-reveal').onclick = () => { if (revealed || Game.isFinished()) return; revealed = true; UI.revealRole(Game.currentRole()); };
  UI.$('btn-hide').onclick = () => {
    if (!revealed) return;
    UI.hideRole(); revealed = false; Game.advance();
    if (Game.isFinished()) UI.show('done'); else UI.renderTurn(Game.playerNumber(), Game.getCount());
  };
  // Privacy: hide a shown role if the tab/app is backgrounded.
  document.addEventListener('visibilitychange', () => { if (document.hidden && revealed) { UI.hideRole(); revealed = false; } });
  UI.renderSelect(Game.getCount());
  UI.icons();
})();
