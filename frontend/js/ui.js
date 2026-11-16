/* DOM rendering only (screens, lobby, dashboard, result, toasts). */
const UI = (() => {
  const $ = id => document.getElementById(id);
  const icons = () => { if (window.lucide) lucide.createIcons(); };
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  const fmt = n => '₹' + n.toLocaleString('en-IN');
  let suspect = null;

  function show(n) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + n));
  }
  function toast(msg, icon = 'skull', cls = '') {
    const t = el('div', 'toast ' + cls), i = document.createElement('i');
    i.setAttribute('data-lucide', icon); t.append(i, el('span', '', msg));
    $('toasts').appendChild(t); icons();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, 3500);
  }
  function confirmBox(text) {
    return new Promise(res => {
      $('confirm-text').textContent = text; $('confirm').classList.remove('hidden');
      const done = v => { $('confirm').classList.add('hidden'); res(v); };
      $('confirm-yes').onclick = () => done(true); $('confirm-no').onclick = () => done(false);
    });
  }
  function roundsBox(defaultRounds = 3) {
    return new Promise(res => {
      const modal = $('rounds-modal'), input = $('modal-rounds-input');
      if (!modal || !input) return res(defaultRounds);
      input.value = defaultRounds;
      modal.classList.remove('hidden');
      icons();
      const step = d => {
        let val = parseInt(input.value) || 1;
        val = Math.max(1, Math.min(20, val + d));
        input.value = val;
      };
      $('modal-rounds-minus').onclick = () => step(-1);
      $('modal-rounds-plus').onclick = () => step(1);
      const done = val => {
        modal.classList.add('hidden');
        res(val);
      };
      $('modal-rounds-confirm').onclick = () => {
        let val = parseInt(input.value);
        if (isNaN(val) || val < 1) val = 1;
        done(val);
      };
      $('modal-rounds-cancel').onclick = () => done(null);
    });
  }
  const secsLeft = (st, ms) => Math.max(0, Math.ceil((st._rx + ms - Date.now()) / 1000));
  // Connected / Reconnecting… Ns / Disconnected badge shown beside every player.
  function connBadge(p, st) {
    const c = el('span', 'conn ' + (p.connected ? 'on' : 'off'));
    if (p.connected) c.textContent = 'Connected';
    else if (p.reconnectInMs != null && st) {
      c.dataset.deadline = st._rx + p.reconnectInMs; c.dataset.prefix = 'Reconnecting\u2026 ';
      c.textContent = c.dataset.prefix + secsLeft(st, p.reconnectInMs) + 's';
    } else c.textContent = 'Disconnected';
    return c;
  }
  const row = (p, meId, st) => {
    const li = el('li', (p.alive ? '' : 'dead ') + (p.connected ? '' : 'offline'));
    const nm = el('span', 'nm', p.name + (p.id === meId ? ' (you)' : '') + (p.isHost ? ' \u00b7 host' : ''));
    li.append(nm, connBadge(p, st)); return li;
  };
  // Live countdown text: any element with data-deadline (absolute local ms) is refreshed here.
  function tick() {
    const now = Date.now();
    document.querySelectorAll('[data-deadline]').forEach(n => {
      n.textContent = (n.dataset.prefix || '') + Math.max(0, Math.ceil((+n.dataset.deadline - now) / 1000)) + 's';
    });
  }
  function renderLobby(st, meId) {
    $('lobby-code').textContent = st.roomId;
    $('lobby-count').textContent = `${st.total} / ${st.max} players` + (st.connectedCount < st.total ? ` \u00b7 ${st.connectedCount} connected` : '');
    $('lobby-list').replaceChildren(...st.players.map(p => row(p, meId, st)));
    const host = st.hostId === meId, b = $('start-btn');
    const offline = st.players.filter(p => !p.connected).length, tooFew = st.connectedCount < st.minPlayers;
    b.classList.toggle('hidden', !host); b.disabled = offline > 0 || tooFew;
    let note = '';
    if (!host) note = offline ? 'Waiting for a player to reconnect\u2026' : 'Waiting for the host to start\u2026';
    else if (offline) note = `Waiting for ${offline} player${offline > 1 ? 's' : ''} to reconnect (removed after 15s)\u2026`;
    else if (tooFew) note = `Need at least ${st.minPlayers} connected players (${st.connectedCount}/${st.minPlayers})\u2026`;
    $('lobby-note').textContent = note;
  }
  function renderGame(st, meId, role, copUsed) {
    const me = st.players.find(p => p.id === meId);
    $('game-room').textContent = 'Room ' + st.roomId + (st.totalRounds > 1 ? ' \u00b7 Round ' + st.currentRound + '/' + st.totalRounds : '');
    $('g-total').textContent = st.total; $('g-dead').textContent = `${st.deadCount} / ${st.deathLimit}`;
    $('game-list').replaceChildren(...st.players.map(p => {
      const li = row(p, meId, st); li.appendChild(el('span', 'st ' + (p.alive ? 'alive' : 'dead'), p.alive ? 'ALIVE' : 'DEAD')); return li;
    }));
    const alive = !!me && me.alive;
    $('dead-btn').classList.toggle('hidden', !alive || role === 'Cop'); $('elim').classList.toggle('hidden', alive);
    const cop = role === 'Cop' && alive;
    $('cop-panel').classList.toggle('hidden', !(cop && !copUsed));
    $('cop-used').classList.toggle('hidden', !(role === 'Cop' && copUsed));
    if (cop && !copUsed) {
      const others = st.players.filter(p => p.alive && p.id !== meId);
      if (!others.some(p => p.id === suspect)) suspect = null;
      $('cop-list').replaceChildren(...others.map(p => {
        const li = el('li', p.id === suspect ? 'sel' : '', p.name);
        li.onclick = () => { suspect = p.id; renderGame(st, meId, role, copUsed); }; return li;
      }));
      $('guess-btn').disabled = !suspect;
    }
  }
  function renderResult(r, hostId, meId, st) {
    if (!r) return;
    const roundLabel = r.totalRounds > 1 ? ' (Round ' + r.round + '/' + r.totalRounds + ')' : '';
    $('res-title').textContent = (r.winner === 'cop' ? 'COP WINS!' : 'KILLER WINS!') + roundLabel;
    $('res-killer').textContent = 'The Killer was ' + r.killerName + '.';
    $('res-stats').textContent = `${r.deadCount} dead of ${r.total} players`;

    // Per-round scoreboard
    $('res-board').replaceChildren(...(r.scoreboard || []).map(s => {
      const li = el('li', s.alive ? '' : 'dead');
      li.append(el('span', 'nm', `${s.name} \u00b7 ${s.role}`), el('span', 'st ' + (s.score ? 'alive' : 'dead'), fmt(s.score)));
      return li;
    }));

    const host = hostId === meId;

    if (r.nextRound) {
      // More rounds to play — show "Continue to Next Round" to host
      if ($('next-btn')) $('next-btn').classList.toggle('hidden', !host);
      $('again-btn').classList.add('hidden');
      $('res-note').textContent = host ? '' : 'Waiting for the host to continue to next round…';
    } else {
      // All rounds done — show final leaderboard and Play again button
      if ($('next-btn')) $('next-btn').classList.add('hidden');
      if (r.leaderboard && r.leaderboard.length) {
        const title = el('p', 'label', '\uD83C\uDFC6 Final Leaderboard (Total Scores)');
        const lbList = el('ul', 'plist');
        r.leaderboard.forEach((entry, i) => {
          const li = el('li', '');
          li.append(el('span', 'nm', '#' + (i + 1) + ' ' + entry.name), el('span', 'st alive', fmt(entry.score)));
          lbList.appendChild(li);
        });
        $('res-board').appendChild(title);
        $('res-board').appendChild(lbList);
      }
      $('again-btn').classList.toggle('hidden', !host);
      $('res-note').textContent = host ? '' : 'Only the host can start a new game.';
    }
    // Between rounds: same rules as the lobby (nobody disconnected, >= minPlayers connected).
    $('again-btn').textContent = 'Play again';
    if (st && r.nextRound) {
      const off = st.players.some(p => !p.connected), few = st.connectedCount < st.minPlayers;
      if ($('next-btn')) $('next-btn').disabled = off || few;
      if (host && off) $('res-note').textContent = 'Waiting for a disconnected player to reconnect (removed after 15s)\u2026';
      else if (host && few) {
        $('res-note').textContent = `Need at least ${st.minPlayers} connected players to continue.`;
        $('again-btn').textContent = 'Back to lobby'; $('again-btn').classList.remove('hidden');
      } else if (!host && off) $('res-note').textContent = 'Waiting for a disconnected player to reconnect\u2026';
    }
  }
  // GAME PAUSED overlay. Driven purely by server state (st.pause), so every client shows the same thing.
  function renderPause(st, meId) {
    const ov = $('pause-overlay'), pv = st && st.status === 'playing' && st.pause;
    if (!pv) { ov.classList.add('hidden'); return; }
    ov.classList.remove('hidden');
    const waiting = pv.players.filter(p => !p.expired), gone = pv.players.filter(p => p.expired);
    $('pause-names').textContent = pv.awaitingHost
      ? (gone.map(p => p.name).join(', ') + (gone.length > 1 ? ' did not reconnect.' : ' did not reconnect.'))
      : 'Waiting for ' + waiting.map(p => p.name).join(', ') + ' to reconnect\u2026';
    const big = $('pause-count');
    if (waiting.length) {
      big.dataset.deadline = st._rx + Math.min(...waiting.map(p => p.remainingMs)); big.dataset.prefix = '';
      big.textContent = secsLeft(st, Math.min(...waiting.map(p => p.remainingMs))) + 's';
    } else { delete big.dataset.deadline; big.textContent = ''; }
    $('pause-list').replaceChildren(...pv.players.map(p => {
      const li = el('li', 'offline');
      const c = el('span', 'conn off');
      if (p.expired) c.textContent = 'Did not reconnect';
      else { c.dataset.deadline = st._rx + p.remainingMs; c.dataset.prefix = 'Reconnecting\u2026 '; c.textContent = c.dataset.prefix + secsLeft(st, p.remainingMs) + 's'; }
      li.append(el('span', 'nm', p.name), c); return li;
    }));
    const host = st.hostId === meId, ctl = $('pause-host');
    ctl.classList.toggle('hidden', !(host && pv.awaitingHost));
    $('pause-restart-btn').disabled = !pv.canRestart;
    $('pause-restart-btn').textContent = 'Remove ' + (pv.players.length > 1 ? 'disconnected players' : pv.players[0].name) + ' & restart round (new roles)';
    $('pause-note').textContent = !pv.awaitingHost ? 'The game resumes automatically when everyone is back.'
      : host ? (pv.canRestart ? 'Choose how to continue. Roles are never reassigned unless you restart the round.' : `Only ${pv.remainingAfterRemoval} players would remain (minimum ${st.minPlayers}), so the round cannot be restarted.`)
      : 'Waiting for the host to decide\u2026';
    icons();
  }
  const getSuspect = () => suspect;
  function revealRole(role, score) {
    const type = Roles.typeOf(role);
    $('card-back').className = 'face back ' + type;
    $('role-name').textContent = role; $('role-score').textContent = fmt(score);
    const i = el('i'); i.id = 'role-icon'; i.setAttribute('data-lucide', Roles.icon(role));
    $('card-back').querySelector('#role-icon, svg').replaceWith(i); icons();
    $('card').classList.add('flipped');
  }
  function hideRole() { // wipe text first, flip back instantly
    $('role-name').textContent = ''; $('role-score').textContent = ''; $('card-back').className = 'face back';
    const c = $('card'); c.style.transition = 'none'; c.classList.remove('flipped'); void c.offsetWidth; c.style.transition = '';
  }
  return { $, show, toast, confirmBox, roundsBox, renderLobby, renderGame, renderResult, renderPause, tick, getSuspect, revealRole, hideRole, icons };
})();
