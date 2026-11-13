/* Navigation and event wiring. */
(() => {
  let showing = false;   // role currently visible (finger held down)
  const turn = () => UI.renderTurn(Game.playerName(), Game.playerNumber(), Game.getCount());
  function hide() { if (showing) { UI.hideRole(); showing = false; } }

  const go = {
    start: () => { UI.renderSelect(Game.getCount()); UI.show('select'); },
    home: () => { hide(); Game.reset(); UI.show('home'); },
    names: () => { UI.renderNames(Game.getCount(), Game.getNames()); UI.show('names'); },
    generate: () => {
      const list = UI.readNames();
      if (new Set(list.map(n => n.toLowerCase())).size !== list.length) { UI.showError('Each player needs a different name.'); return; }
      Game.setNames(list); Game.start(); UI.show('ready');
    },
    'reveal-start': () => { UI.hideRole(); turn(); UI.show('reveal'); },
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

  // Press and hold the card to reveal; release to hide. Repeatable during your own turn.
  const scene = UI.$('card-scene');
  function press() { if (showing || Game.isFinished()) return; showing = true; UI.revealRole(Game.currentRole()); UI.enablePass(); }
  scene.addEventListener('pointerdown', e => { e.preventDefault(); try { scene.setPointerCapture(e.pointerId); } catch (_) {} press(); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => scene.addEventListener(t, hide));
  scene.addEventListener('contextmenu', e => e.preventDefault());
  scene.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); press(); } });
  scene.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') hide(); });
  scene.addEventListener('blur', hide);

  UI.$('btn-pass').onclick = () => {
    hide(); Game.advance();
    if (Game.isFinished()) UI.show('done'); else turn();
  };
  // Privacy: hide if the tab/app is backgrounded.
  document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); });

  UI.renderSelect(Game.getCount());
  UI.icons();
})();
