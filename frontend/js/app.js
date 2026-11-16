/* Wiring: server events, navigation, user actions for both Classic and Online modes. */
(() => {
  let me = null, st = null, role = null, score = 0, copUsed = false, needsRole = false, held = false;
  const $ = UI.$;

  // Stamp every server state with its arrival time so countdowns tick correctly on this device.
  const stamp = s => Object.assign({}, s, { _rx: Date.now() });

  function render() {
    if (!st) { UI.renderPause(null); return UI.show('home'); }
    if (st.status === 'lobby') {
      needsRole = false; role = null;
      UI.renderLobby(st, me.playerId);
      UI.show('lobby');
    } else if (st.status === 'playing') {
      if (needsRole) UI.show('role');
      else { UI.renderGame(st, me.playerId, role, copUsed); UI.show('game'); }
    } else {
      UI.renderResult(st.result, st.hostId, me.playerId, st);
      UI.show('result');
    }
    UI.renderPause(st, me.playerId);
  }

  function leave() {
    Net.emit('leave-room');
    Net.clear();
    me = st = role = null;
    UI.hideRole();
    UI.renderPause(null);
    UI.show('home');
  }

  const joined = d => {
    me = { roomId: d.roomId, playerId: d.playerId, token: d.token };
    Net.save(me);
    st = stamp(d.state);
    render();
  };

  // Socket Events
  Net.on('connect', () => { const s = Net.load(); if (s) Net.emit('rejoin', s); });
  Net.on('session-invalid', () => { Net.clear(); me = st = role = null; UI.renderPause(null); UI.show('home'); });
  Net.on('disconnect', () => { if (me) UI.toast('Connection lost. Reconnecting\u2026', 'wifi-off', 'info'); });
  Net.on('room-created', joined);
  Net.on('room-joined', joined);
  Net.on('player-joined', d => UI.toast(d.playerName + ' joined', 'user-plus', 'info'));
  Net.on('player-left', d => UI.toast(d.playerName + ' left', 'log-out', 'info'));
  Net.on('game-state-updated', s => { st = stamp(s); if (me) render(); });
  Net.on('game-started', s => {
    st = stamp(s); needsRole = true; role = null; copUsed = false;
    $('role-continue').disabled = true;
    render();
  });
  Net.on('private-role-assigned', d => {
    role = d.role; score = d.score; copUsed = d.copUsed;
    if (!needsRole) render();
  });
  Net.on('game-paused', d => { if (me && d.trigger === 'disconnect') UI.toast(d.playerName + ' disconnected \u2014 game paused', 'pause-circle', 'info'); });
  Net.on('game-resumed', d => { if (me) UI.toast(d.playerName + ' reconnected \u2014 game resumed', 'play-circle', 'info'); });
  Net.on('pause-timeout', d => { if (me) UI.toast(d.playerName + ' did not reconnect in time', 'user-x', 'info'); });
  Net.on('player-removed', d => { if (me) UI.toast(d.playerName + ' was removed (disconnected)', 'user-minus', 'info'); });
  Net.on('round-aborted', d => { if (me) UI.toast(d.by + ' ended the round. Back to the lobby.', 'log-out', 'info'); });
  Net.on('host-changed', d => { if (me) UI.toast(d.playerName + ' is now the host', 'crown', 'info'); });
  Net.on('player-eliminated', d => UI.toast(d.playerName + ' is DEAD!'));
  Net.on('cop-guess-result', d => {
    if (!d.correct) {
      copUsed = true;
      UI.toast("Wrong guess. You can't investigate again.", 'search-x', 'info');
      render();
    }
  });
  Net.on('game-over', r => {
    if (!st) return;
    st = Object.assign({}, st, { status: 'over', result: r });
    render();
  });
  Net.on('error-message', m => UI.toast(m, 'alert-circle', 'info'));

  // Mode Switcher Tabs
  const tabClassic = $('tab-classic'), tabOnline = $('tab-online');
  const panelClassic = $('panel-classic'), panelOnline = $('panel-online');

  function switchMode(mode) {
    const isClassic = mode === 'classic';
    tabClassic?.classList.toggle('active', isClassic);
    tabOnline?.classList.toggle('active', !isClassic);
    panelClassic?.classList.toggle('hidden', !isClassic);
    panelOnline?.classList.toggle('hidden', isClassic);
    UI.icons();
  }

  if (tabClassic) tabClassic.onclick = () => switchMode('classic');
  if (tabOnline) tabOnline.onclick = () => switchMode('online');

  // Unified click handler for actions and navigation
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-action]');
    if (a) {
      const act = a.dataset.action;
      if (act === 'leave') return leave();
      if (act === 'classic-start' || act === 'classic-again') {
        ClassicGame.reset();
        ClassicUI.renderSelect(ClassicGame.getCount());
        return UI.show('classic-select');
      }
      if (act === 'classic-names') {
        ClassicUI.renderNames(ClassicGame.getCount(), ClassicGame.getNames());
        return UI.show('classic-names');
      }
      if (act === 'classic-generate') {
        const list = ClassicUI.readNames();
        if (new Set(list.map(n => n.toLowerCase())).size !== list.length) {
          return ClassicUI.showError('Each player needs a different name.');
        }
        ClassicGame.setNames(list);
        ClassicGame.start();
        return UI.show('classic-ready');
      }
      if (act === 'classic-reveal-start') {
        ClassicUI.hideRole();
        ClassicUI.renderTurn(ClassicGame.playerName(), ClassicGame.playerNumber(), ClassicGame.getCount());
        return UI.show('classic-reveal');
      }
    }

    const g = e.target.closest('[data-go]');
    if (g) {
      const target = g.dataset.go;
      if (target === 'home') {
        ClassicGame.reset();
        ClassicUI.hideRole();
      }
      UI.show(target);
    }
  });

  // Online Room Forms
  $('create-form').onsubmit = e => {
    e.preventDefault();
    Net.emit('create-room', { name: $('create-name').value });
  };
  $('join-form').onsubmit = e => {
    e.preventDefault();
    Net.emit('join-room', { name: $('join-name').value, roomId: $('join-room').value });
  };

  // Online Game Controls
  $('start-btn').onclick = async () => {
    const rounds = await UI.roundsBox(3);
    if (rounds !== null && rounds > 0) Net.emit('start-game', { rounds });
  };
  $('next-btn')?.addEventListener('click', () => Net.emit('next-round'));
  $('again-btn').onclick = () => Net.emit('restart-game');

  // Pause screen host controls
  $('pause-end-btn').onclick = async () => {
    if (await UI.confirmBox('End the current round and return everyone to the lobby?')) Net.emit('host-end-round');
  };
  $('pause-restart-btn').onclick = async () => {
    if (await UI.confirmBox('Remove the disconnected player(s) and restart this round with newly assigned roles?')) Net.emit('host-remove-restart');
  };

  setInterval(UI.tick, 250);

  // Copy & Share Room ID
  const copyRoomId = async (showToast = true) => {
    const id = st?.roomId;
    if (!id) return false;
    try {
      await navigator.clipboard.writeText(id);
    } catch (_) {
      const inp = document.createElement('input');
      inp.value = id;
      document.body.appendChild(inp);
      inp.select();
      document.execCommand('copy');
      inp.remove();
    }
    if (showToast) UI.toast(`Room ID copied: ${id}`, 'copy', 'info');
    return true;
  };

  const shareRoom = async () => {
    const id = st?.roomId;
    if (!id) return;
    await copyRoomId(false);
    const text = `hey im playing cop and killer join in this room : ${id}`;
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    UI.toast(`Room ID copied: ${id}`, 'copy', 'info');
  };

  ['copy-code', 'lobby-code', 'game-room'].forEach(id => {
    const el = $(id);
    if (el) el.onclick = () => copyRoomId(true);
  });
  if ($('share-code')) $('share-code').onclick = shareRoom;

  // Join Room Paste & Code Cleanup
  const cleanRoomCode = raw => {
    if (!raw) return '';
    const m = String(raw).match(/:\s*([A-Za-z0-9]{4,8})/i) || String(raw).match(/\b([A-HJ-NP-Za-hj-np-z2-9]{6})\b/);
    return (m ? m[1] : raw).trim().toUpperCase().slice(0, 6);
  };

  const joinRoomInput = $('join-room');
  joinRoomInput?.addEventListener('paste', e => {
    const text = (e.clipboardData || window.clipboardData)?.getData('text');
    if (text) {
      e.preventDefault();
      joinRoomInput.value = cleanRoomCode(text);
    }
  });

  $('paste-room')?.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        joinRoomInput.value = cleanRoomCode(text);
        return UI.toast('Pasted Room ID', 'clipboard', 'info');
      }
    } catch (_) {}
    joinRoomInput?.focus();
  });

  // In-Game Actions
  $('dead-btn').onclick = async () => {
    if (role === 'Killer' || role === 'Cop') {
      return UI.toast(`You are the ${role} — you can't report yourself as dead.`, 'shield-x', 'info');
    }
    if (await UI.confirmBox("Report that you're dead? This can't be undone.")) Net.emit('report-death');
  };

  $('guess-btn').onclick = async () => {
    const id = UI.getSuspect();
    if (id && await UI.confirmBox('Submit this guess? You only get one.')) {
      Net.emit('submit-cop-guess', { suspectId: id });
    }
  };

  // Hold-to-reveal on secret role card
  const scene = $('card-scene');
  const hide = () => { if (held) { held = false; UI.hideRole(); } };
  const press = () => {
    if (held || !role) return;
    held = true;
    UI.revealRole(role, score);
    $('role-continue').disabled = false;
  };

  scene.addEventListener('pointerdown', e => { e.preventDefault(); try { scene.setPointerCapture(e.pointerId); } catch (_) {} press(); });
  ['pointerup', 'pointercancel', 'lostpointercapture', 'blur'].forEach(t => scene.addEventListener(t, hide));
  scene.addEventListener('contextmenu', e => e.preventDefault());
  scene.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); press(); } });
  scene.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') hide(); });
  $('role-continue').onclick = () => { hide(); needsRole = false; render(); };

  // Hold-to-peek on game screen
  const peek = $('peek'), peekOff = () => { $('peek-text').textContent = ''; };
  peek.addEventListener('pointerdown', e => { e.preventDefault(); try { peek.setPointerCapture(e.pointerId); } catch (_) {} if (role) $('peek-text').textContent = 'You are ' + role; });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => peek.addEventListener(t, peekOff));
  peek.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('visibilitychange', () => { if (document.hidden) { hide(); peekOff(); } });

  // Init
  ClassicUI.init();
  UI.icons();
})();
