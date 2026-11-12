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
  function renderTurn(num, total) {
    $('turn-text').textContent = `Player ${num}, take the phone.`;
    $('progress').textContent = `Player ${num} of ${total}`;
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
    $('btn-reveal').classList.add('hidden'); $('btn-hide').classList.remove('hidden');
  }
  function hideRole() { // wipe secret text first; flip back without animation
    $('role-name').textContent = ''; $('role-score').textContent = '';
    $('card-back').className = 'face back';
    const c = $('card'); c.style.transition = 'none'; c.classList.remove('flipped'); void c.offsetWidth; c.style.transition = '';
    $('btn-hide').classList.add('hidden'); $('btn-reveal').classList.remove('hidden');
  }
  return { $, show, renderSelect, renderTurn, revealRole, hideRole, icons };
})();
