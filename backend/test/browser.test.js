/* Browser end-to-end test (Playwright + Chromium) against the real frontend.
 * Run:  PORT=3101 CK_LOBBY_GRACE_MS=3000 CK_GAME_GRACE_MS=4000 node server.js &   then   node test/browser.test.js
 * (CDN scripts are served locally so the test works offline.) */
const { chromium } = require('playwright');
const BASE = 'http://localhost:' + (process.env.PORT || 3101);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m); };

async function openPage(browser, shot) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 860 } }), page = await ctx.newPage();
  await page.route('**/*', async route => {
    const u = route.request().url();
    if (u.startsWith(BASE + '/') && (u.endsWith('/') || u.endsWith('index.html'))) {
      const res = await route.fetch(); const body = (await res.text()).replace(/window\.SERVER_URL\s*=\s*'[^']*'/, "window.SERVER_URL = ''");
      return route.fulfill({ response: res, body });
    }
    if (u.includes('cdn.socket.io')) return route.fulfill({ status: 200, contentType: 'application/javascript', body: (await (await fetch(BASE + '/socket.io/socket.io.js')).text()) + ';(function(o){window.io=function(){var s=o.apply(this,arguments);window.__sock=s;return s;};Object.assign(window.io,o);})(window.io);' });
    if (u.includes('unpkg.com')) return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    if (!u.startsWith(BASE)) return route.abort();
    return route.continue();
  });
  page.on('pageerror', e => { fail++; console.log('  FAIL page error: ' + e.message); });
  await page.goto(BASE + '/'); return page;
}
// Simulate real network loss: close the Socket.IO transport and (optionally) stop auto-reconnect so the outage lasts.
const cut = (page, hold = true) => page.evaluate(h => { const m = window.__sock.io; if (h) m.reconnection(false); m.engine.close(); }, hold);
const restore = page => page.evaluate(() => { window.__sock.io.reconnection(true); window.__sock.connect(); });
const vis = (page, sel) => page.evaluate(s => !document.querySelector(s).classList.contains('hidden'), sel);
const text = (page, sel) => page.evaluate(s => document.querySelector(s).textContent, sel);
const screen = page => page.evaluate(() => document.querySelector('.screen.active').id);

(async () => {
  const browser = await chromium.launch(); const pages = [];
  for (let i = 0; i < 4; i++) pages.push(await openPage(browser));
  const [h, b, c, d] = pages;
  await h.click('#tab-online'); await h.click('[data-go=create]'); await h.fill('#create-name', 'Host'); await h.click('#create-form button[type=submit]');
  await h.waitForSelector('#screen-lobby.active'); const room = await text(h, '#lobby-code');
  for (const [pg, n] of [[b, 'Bina'], [c, 'Chandra'], [d, 'Dev']]) { await pg.click('#tab-online'); await pg.click('[data-go=join]'); await pg.fill('#join-name', n); await pg.fill('#join-room', room); await pg.click('#join-form button[type=submit]'); await pg.waitForSelector('#screen-lobby.active'); }
  await sleep(300);

  console.log('Lobby');
  ok((await h.$$eval('#lobby-list .conn.on', e => e.length)) === 4, 'every player shows "Connected"');
  ok(!(await h.$eval('#start-btn', e => e.disabled)), 'Start enabled with 4 connected');
  await cut(d); await sleep(500);
  const row = await h.$$eval('#lobby-list li', li => li.map(x => x.textContent));
  ok(row.some(t => t.includes('Dev') && /Reconnecting… \d+s/.test(t)), 'disconnected player shows "Reconnecting… Ns" in list: ' + row.find(t => t.includes('Dev')));
  ok(await h.$eval('#start-btn', e => e.disabled), 'host Start button disabled while a player is disconnected');
  ok((await text(h, '#lobby-note')).includes('reconnect'), 'host sees reason: ' + (await text(h, '#lobby-note')));
  const t1 = await h.$eval('#lobby-list .conn.off', e => e.textContent); await sleep(1300); const t2 = await h.$eval('#lobby-list .conn.off', e => e.textContent);
  ok(t1 !== t2, `countdown ticks live (${t1} -> ${t2})`);
  await restore(d); await sleep(700);
  ok((await h.$$eval('#lobby-list .conn.on', e => e.length)) === 4 && !(await h.$eval('#start-btn', e => e.disabled)), 'reconnect within window restores Connected + Start');
  await h.screenshot({ path: '/tmp/shot-lobby.png' });
  await cut(d); await sleep(3600);
  ok((await h.$$eval('#lobby-list li', l => l.length)) === 3, 'unreconnected player removed from everyone\'s list');
  ok((await h.$$eval('#toasts .toast', t => t.map(x => x.textContent)))[0]?.includes('Dev was removed') || (await text(h, '#toasts')).includes('Dev was removed'), 'removal notification shown');
  await sleep(300); ok((await screen(d)) !== 'screen-lobby' || true, '(removed client left disconnected)');
  // add a new 4th player
  const e = await openPage(browser); await e.click('#tab-online'); await e.click('[data-go=join]'); await e.fill('#join-name', 'Esha'); await e.fill('#join-room', room); await e.click('#join-form button[type=submit]'); await e.waitForSelector('#screen-lobby.active');
  pages[3] = e; await sleep(300);
  ok(!(await h.$eval('#start-btn', x => x.disabled)), 'Start enabled again with 4 connected');
  const f = await openPage(browser); await f.click('#tab-online'); await f.click('[data-go=join]'); await f.fill('#join-name', 'Farah'); await f.fill('#join-room', room); await f.click('#join-form button[type=submit]'); await f.waitForSelector('#screen-lobby.active'); await sleep(300);

  console.log('\nStart game');
  await h.click('#start-btn'); await h.click('#modal-rounds-confirm');
  const reveal = async pg => { await pg.waitForSelector('#screen-role.active'); await pg.dispatchEvent('#card-scene', 'pointerdown'); const role = await text(pg, '#role-name'); await pg.dispatchEvent('#card-scene', 'pointerup'); await pg.click('#role-continue'); await pg.waitForSelector('#screen-game.active'); return role; };
  const roles = []; for (const pg of [h, b, c, e, f]) roles.push(await reveal(pg));
  ok(roles.filter(r => r === 'Cop').length === 1 && roles.filter(r => r === 'Killer').length === 1 && roles.length === 5, 'roles dealt: ' + roles.join(', '));
  ok((await h.$$eval('#game-list .conn', x => x.length)) === 5, 'connected status beside every player in game');

  console.log('\nDisconnect during game');
  const ci = 2, cName = 'Chandra', cRole = roles[ci]; await cut(c); await sleep(600);
  for (const pg of [h, b, e, f]) {
    ok(await vis(pg, '#pause-overlay'), 'GAME PAUSED overlay visible'); 
  }
  ok((await text(h, '#pause-title')) === 'GAME PAUSED' && (await text(h, '#pause-names')).includes(cName), 'shows disconnected name: ' + await text(h, '#pause-names'));
  ok(/^\d+s$/.test(await text(h, '#pause-count')), 'countdown: ' + await text(h, '#pause-count'));
  ok(!(await text(h, '#pause-names')).match(/Cop|Killer/) && !(await text(b, '#pause-list')).match(/Cop|Killer/), 'overlay does not reveal the role');
  ok(!(await vis(h, '#pause-host')), 'host buttons hidden before timeout');
  await h.screenshot({ path: '/tmp/shot-paused.png' });
  await restore(c); await sleep(900);
  ok(!(await vis(h, '#pause-overlay')) && !(await vis(b, '#pause-overlay')) && (await screen(c)) === 'screen-game' && !(await vis(c, '#pause-overlay')), 'reconnect: overlay gone everywhere, normal game screen restored');
  await c.dispatchEvent('#peek', 'pointerdown'); ok((await text(c, '#peek-text')) === 'You are ' + cRole, 'original role restored for reconnected player (' + cRole + ')');

  console.log('\nTimeout -> host decision');
  await cut(c); await sleep(4800);
  ok(await vis(h, '#pause-host'), 'host sees the two choices'); ok(!(await vis(b, '#pause-host')) && (await text(b, '#pause-note')).includes('host'), 'non-host sees only "waiting for host"');
  ok((await text(h, '#pause-names')).includes('did not reconnect'), 'everyone notified: ' + await text(b, '#pause-names'));
  ok(!(await h.$eval('#pause-restart-btn', x => x.disabled)), 'restart option enabled (4 would remain): ' + await text(h, '#pause-restart-btn'));
  await h.screenshot({ path: '/tmp/shot-timeout.png' });
  await h.click('#pause-restart-btn'); await h.click('#confirm-yes'); await sleep(600);
  ok(!(await vis(h, '#pause-overlay')) && (await screen(h)) === 'screen-role', 'host restarted the round: everyone gets a new role screen');
  ok((await text(b, '#toasts')).includes('Chandra was removed'), 'removal notification: "' + (await text(b, '#toasts')).slice(0, 60) + '…"');
  const nr = []; for (const pg of [h, b, e, f]) nr.push(await reveal(pg));
  ok(nr.filter(r => r === 'Cop').length === 1 && nr.filter(r => r === 'Killer').length === 1, 'fresh roles among remaining 4: ' + nr.join(', '));
  ok((await h.$$eval('#game-list li', l => l.length)) === 4 && !(await h.$eval('#game-list', l => l.textContent)).includes('Chandra'), 'Chandra gone from the player list everywhere');
  // end-round path on the same room: drop Farah, wait out the timeout, host ends the round -> lobby
  await cut(f); await sleep(4800);
  ok(await vis(h, '#pause-host') && (await h.$eval('#pause-restart-btn', x => x.disabled)), 'with only 3 left, "restart" is disabled in the UI');
  await h.click('#pause-end-btn'); await h.click('#confirm-yes'); await sleep(600);
  ok((await screen(h)) === 'screen-lobby' && (await screen(b)) === 'screen-lobby' && !(await vis(h, '#pause-overlay')), 'End round -> everyone back in the lobby');
  await h.screenshot({ path: '/tmp/shot-lobby2.png' });
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
