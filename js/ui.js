/* DOM handling only. */
const UI = (() => {
  const $ = id => document.getElementById(id);
  const icons = () => { if (window.lucide) lucide.createIcons(); };
  const ICON = { cop: 'shield', killer: 'skull', person: 'user' };
  function show(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
    window.scrollTo(0, 0);
  }
  function renderSelect(n) {
    $('count-num').textContent = n;
    $('minus').disabled = n <= Roles.MIN;
    $('plus').disabled = n >= Roles.MAX;
    const frag = document.createDocumentFragment();
    Roles.build(n).forEach(r => {
      const li = document.createElement('li');
      li.className = Roles.typeOf(r); li.textContent = r; frag.appendChild(li);
    });
    $('preview').replaceChildren(frag);
  }
  function renderNames(n, existing) {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < n; i++) {
      const wrap = document.createElement('div'); wrap.className = 'field';
      const inp = document.createElement('input');
      inp.type = 'text'; inp.maxLength = 16; inp.autocomplete = 'off';
      inp.placeholder = 'Player ' + (i + 1); inp.value = existing[i] || '';
      inp.setAttribute('aria-label', 'Name of player ' + (i + 1));
      wrap.appendChild(inp); frag.appendChild(wrap);
    }
    $('names-list').replaceChildren(frag);
    $('names-error').textContent = '';
  }
  function readNames() {
    return Array.from($('names-list').querySelectorAll('input'))
      .map((inp, i) => inp.value.trim() || 'Player ' + (i + 1));
  }
  const showError = msg => { $('names-error').textContent = msg; };
  function renderTurn(name, num, total) {
    $('turn-text').textContent = `${name}, take the phone.`;
    $('progress').textContent = `${num} of ${total}`;
    $('btn-pass').disabled = true;
  }
  function revealRole(role) {
    const type = Roles.typeOf(role);
    $('card-back').className = 'face back ' + type;
    $('role-name').textContent = role;
    $('role-score').textContent = '₹' + Roles.SCORES[role].toLocaleString('en-IN');
    const old = $('card-back').querySelector('#role-icon, svg');
    const i = document.createElement('i'); i.id = 'role-icon'; i.setAttribute('data-lucide', ICON[type]);
    old.replaceWith(i); icons();
    $('card').classList.add('flipped');
  }
  function hideRole() { // wipe secret text first; flip back without animation
    $('role-name').textContent = ''; $('role-score').textContent = '';
    $('card-back').className = 'face back';
    const c = $('card'); c.style.transition = 'none'; c.classList.remove('flipped'); void c.offsetWidth; c.style.transition = '';
  }
  const enablePass = () => { $('btn-pass').disabled = false; };
  return { $, show, renderSelect, renderNames, readNames, showError, renderTurn, revealRole, hideRole, enablePass, icons };
})();
