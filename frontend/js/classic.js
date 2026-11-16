/* Classic Mode (Pass & Play on 1 Device) */
const ClassicGame = (() => {
  let count = 6, names = [], roles = [], index = 0;
  return {
    getCount: () => count,
    setCount(n) { count = Math.max(Roles.MIN, Math.min(Roles.MAX, n)); return count; },
    getNames: () => names.slice(),
    setNames(list) { names = list.slice(0, count); },
    start() { roles = Roles.generate(count); index = 0; },
    playerNumber: () => index + 1,
    playerName: () => names[index],
    isFinished: () => index >= roles.length,
    currentRole: () => roles[index],
    advance() { index++; if (index >= roles.length) roles = []; },
    reset() { roles = []; index = 0; }
  };
})();

const ClassicUI = (() => {
  const $ = id => document.getElementById(id);
  let showing = false;

  function renderSelect(n) {
    if (!$('classic-count-num')) return;
    $('classic-count-num').textContent = n;
    $('classic-minus').disabled = n <= Roles.MIN;
    $('classic-plus').disabled = n >= Roles.MAX;
    const frag = document.createDocumentFragment();
    Roles.build(n).forEach(r => {
      const li = document.createElement('li');
      li.className = Roles.typeOf(r);
      li.textContent = r;
      frag.appendChild(li);
    });
    $('classic-preview').replaceChildren(frag);
  }

  function renderNames(n, existing) {
    if (!$('classic-names-list')) return;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < n; i++) {
      const wrap = document.createElement('div');
      wrap.className = 'field';
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.maxLength = 16;
      inp.autocomplete = 'off';
      inp.placeholder = 'Player ' + (i + 1);
      inp.value = existing[i] || '';
      inp.setAttribute('aria-label', 'Name of player ' + (i + 1));
      wrap.appendChild(inp);
      frag.appendChild(wrap);
    }
    $('classic-names-list').replaceChildren(frag);
    $('classic-names-error').textContent = '';
  }

  function readNames() {
    return Array.from($('classic-names-list').querySelectorAll('input'))
      .map((inp, i) => inp.value.trim() || 'Player ' + (i + 1));
  }

  function showError(msg) {
    if ($('classic-names-error')) $('classic-names-error').textContent = msg;
  }

  function renderTurn(name, num, total) {
    if ($('classic-turn-text')) $('classic-turn-text').textContent = `${name}, take the phone.`;
    if ($('classic-progress')) $('classic-progress').textContent = `${num} of ${total}`;
    if ($('classic-btn-pass')) $('classic-btn-pass').disabled = true;
  }

  function revealRole(role) {
    const type = Roles.typeOf(role);
    const back = $('classic-card-back');
    if (!back) return;
    back.className = 'face back ' + type;
    $('classic-role-name').textContent = role;
    $('classic-role-score').textContent = '₹' + Roles.scoreFor(role).toLocaleString('en-IN');
    const i = document.createElement('i');
    i.id = 'classic-role-icon';
    i.setAttribute('data-lucide', Roles.icon(role));
    back.querySelector('#classic-role-icon, svg').replaceWith(i);
    UI.icons();
    $('classic-card').classList.add('flipped');
  }

  function hideRole() {
    const c = $('classic-card');
    if (!c) return;
    $('classic-role-name').textContent = '';
    $('classic-role-score').textContent = '';
    $('classic-card-back').className = 'face back';
    c.style.transition = 'none';
    c.classList.remove('flipped');
    void c.offsetWidth;
    c.style.transition = '';
  }

  function init() {
    const scene = $('classic-card-scene');
    if (!scene) return;
    const hide = () => { if (showing) { hideRole(); showing = false; } };
    const press = () => {
      if (showing || ClassicGame.isFinished()) return;
      showing = true;
      revealRole(ClassicGame.currentRole());
      if ($('classic-btn-pass')) $('classic-btn-pass').disabled = false;
    };

    scene.addEventListener('pointerdown', e => { e.preventDefault(); try { scene.setPointerCapture(e.pointerId); } catch (_) {} press(); });
    ['pointerup', 'pointercancel', 'lostpointercapture', 'blur'].forEach(t => scene.addEventListener(t, hide));
    scene.addEventListener('contextmenu', e => e.preventDefault());
    scene.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); press(); } });
    scene.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') hide(); });

    if ($('classic-minus')) $('classic-minus').onclick = () => renderSelect(ClassicGame.setCount(ClassicGame.getCount() - 1));
    if ($('classic-plus')) $('classic-plus').onclick = () => renderSelect(ClassicGame.setCount(ClassicGame.getCount() + 1));
    if ($('classic-btn-pass')) $('classic-btn-pass').onclick = () => {
      hide();
      ClassicGame.advance();
      if (ClassicGame.isFinished()) {
        UI.show('classic-done');
      } else {
        renderTurn(ClassicGame.playerName(), ClassicGame.playerNumber(), ClassicGame.getCount());
      }
    };
    document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); });
  }

  return { renderSelect, renderNames, readNames, showError, renderTurn, revealRole, hideRole, init };
})();

