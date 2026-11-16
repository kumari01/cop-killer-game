/* End-to-end test of the disconnect system. No extra deps: a tiny Socket.IO v4 client built on `ws`.
 * Run:  CK_LOBBY_GRACE_MS=1500 CK_GAME_GRACE_MS=3000 node test/disconnect.test.js   (npm run test:disconnect) */
const http = require('http'), WebSocket = require('ws'), { Server } = require('socket.io');
const GAME_MS = Number(process.env.CK_GAME_GRACE_MS) || 30000, LOBBY_MS = Number(process.env.CK_LOBBY_GRACE_MS) || 15000;
const server = http.createServer(), io = new Server(server);
require('../socket/roomEvents')(io); require('../socket/gameEvents')(io);
const sleep = ms => new Promise(r => setTimeout(r, ms));

class Client {
  constructor(port, label) { this.label = label; this.port = port; this.log = []; this.handlers = {}; this.state = null; this.role = null; this.me = null; }
  connect() {
    return new Promise(res => {
      this.ws = new WebSocket(`ws://localhost:${this.port}/socket.io/?EIO=4&transport=websocket`);
      this.ws.on('message', raw => {
        const m = raw.toString();
        if (m[0] === '0') this.ws.send('40');
        else if (m === '2') this.ws.send('3');
        else if (m.startsWith('40')) res();
        else if (m.startsWith('42')) {
          const [ev, data] = JSON.parse(m.slice(2));
          this.log.push([ev, data]);
          if (ev === 'game-state-updated') this.state = data;
          if (ev === 'room-created' || ev === 'room-joined') { this.me = { roomId: data.roomId, playerId: data.playerId, token: data.token }; this.state = data.state; }
          if (ev === 'private-role-assigned') this.role = data.role;
          if (ev === 'game-started') { this.role = null; this.state = data; }
          if (ev === 'session-invalid') this.invalid = true;
        }
      });
    });
  }
  emit(ev, data) { this.ws.send('42' + JSON.stringify(data === undefined ? [ev] : [ev, data])); }
  drop() { this.ws.terminate(); }            // abrupt network loss
  events(name) { return this.log.filter(l => l[0] === name).map(l => l[1]); }
  clear() { this.log = []; }
}

let pass = 0, fail = 0;
const ok = (c, msg) => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + msg); };

async function newRoom(port, n) {
  const cs = []; const host = new Client(port, 'P1'); await host.connect(); host.emit('create-room', { name: 'P1' }); await sleep(80); cs.push(host);
  for (let i = 2; i <= n; i++) { const c = new Client(port, 'P' + i); await c.connect(); c.emit('join-room', { name: 'P' + i, roomId: host.me.roomId }); await sleep(60); cs.push(c); }
  await sleep(80); return cs;
}
const rejoin = async (port, c) => { const n = new Client(port, c.label); n.me = c.me; await n.connect(); n.emit('rejoin', c.me); await sleep(150); return n; };
const byRole = (cs, r) => cs.find(c => c.role === r);

(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  console.log(`Grace periods: lobby ${LOBBY_MS}ms, game ${GAME_MS}ms\n`);

  console.log('1. Lobby: min players / start validation');
  let cs = await newRoom(port, 3);
  cs[0].emit('start-game', { rounds: 1 }); await sleep(100);
  ok(cs[0].events('error-message').some(m => /At least 4/.test(m)), 'host cannot start with 3 players');
  const c4 = new Client(port, 'P4'); await c4.connect(); c4.emit('join-room', { name: 'P4', roomId: cs[0].me.roomId }); await sleep(100); cs.push(c4);
  cs[1].emit('start-game', { rounds: 1 }); await sleep(100);
  ok(cs[1].events('error-message').some(m => /Only the host/.test(m)), 'non-host cannot start');
  ok(cs[0].state.connectedCount === 4 && cs[0].state.minPlayers === 4, 'state reports 4 connected / min 4');

  console.log('\n2. Lobby: disconnect -> Reconnecting -> reconnect restores');
  cs[2].drop(); await sleep(150);
  let p3 = cs[0].state.players.find(p => p.name === 'P3');
  ok(p3 && !p3.connected && p3.reconnectInMs > 0 && p3.reconnectInMs <= LOBBY_MS, 'P3 marked disconnected with countdown');
  cs[0].emit('start-game', { rounds: 1 }); await sleep(100);
  ok(cs[0].events('error-message').some(m => /disconnected/.test(m)), 'start rejected while someone is disconnected');
  const r3 = await rejoin(port, cs[2]); cs[2] = r3;
  p3 = cs[0].state.players.find(p => p.name === 'P3');
  ok(p3.connected && p3.reconnectInMs === null, 'P3 restored to connected, countdown cleared');
  await sleep(LOBBY_MS + 400);
  ok(cs[0].state.players.length === 4, 'old timer did NOT remove the reconnected player (no duplicate/stale timeout)');

  console.log('\n3. Lobby: failed reconnect -> auto removal + broadcast');
  cs[3].drop(); await sleep(LOBBY_MS + 500);
  ok(cs[0].state.players.length === 3 && !cs[0].state.players.some(p => p.name === 'P4'), 'P4 removed after grace, list broadcast');
  ok(cs[0].events('player-removed').some(e => e.playerName === 'P4'), 'player-removed notification sent');
  const c4b = await rejoin(port, { me: cs[3].me, label: 'P4' }); ok(c4b.invalid, 'removed player token is rejected on rejoin'); c4b.drop();
  cs.forEach(c => c.drop()); await sleep(50);

  console.log('\n4. Active game: pause, gating, secrecy, reconnect');
  cs = await newRoom(port, 5);
  cs[0].emit('start-game', { rounds: 2 }); await sleep(200);
  ok(cs.every(c => c.role), 'all 5 got a private role');
  const roles = cs.map(c => c.role);
  ok(roles.filter(r => r === 'Cop').length === 1 && roles.filter(r => r === 'Killer').length === 1, 'exactly one Cop and one Killer');
  ok(cs.every(c => c.log.every(([ev, d]) => ev === 'private-role-assigned' || !/"(Cop|Killer|Person \d)"|"role"/.test(JSON.stringify(d)))), 'no role appears in ANY public event/state sent to ANY client');
  const cop = byRole(cs, 'Cop'), killer = byRole(cs, 'Killer'), person = cs.find(c => c.role.startsWith('Person'));
  person.emit('report-death'); await sleep(100);
  ok(cs[0].state.deadCount === 1, 'death reporting works before pause');
  const victimId = person.me.playerId;

  // Killer disconnects
  const killerName = killer.label, killerRoleBefore = killer.role; killer.drop(); await sleep(200);
  const others = cs.filter(c => c !== killer);
  ok(others.every(c => c.state.paused && c.state.pause.players.some(p => p.name === killerName)), 'ALL clients paused, showing the disconnected name');
  ok(others.every(c => c.events('game-paused').length >= 1), 'game-paused event broadcast to all');
  const pv = others[0].state.pause; ok(pv.players[0].remainingMs > 0 && pv.players[0].remainingMs <= GAME_MS, 'pause countdown present');
  ok(!JSON.stringify(others.map(c => c.state)).match(/"(Cop|Killer)"/), 'paused public state carries no roles (Killer disconnect is not revealed)');
  const deadBefore = others[0].state.deadCount;
  const aliveOther = others.find(c => c.role.startsWith('Person') && c !== person);
  if (aliveOther) { aliveOther.clear(); aliveOther.emit('report-death'); await sleep(100); ok(aliveOther.events('error-message').some(m => /paused/.test(m)) && others[0].state.deadCount === deadBefore, 'death report rejected while paused'); }
  cop.clear(); const suspect = cs.find(c => c !== cop && c.me.playerId !== victimId && c !== killer);
  cop.emit('submit-cop-guess', { suspectId: suspect.me.playerId }); await sleep(100);
  ok(cop.events('error-message').some(m => /paused/.test(m)) && others[0].state.status === 'playing' && !cop.events('cop-guess-result').length, 'Cop guess rejected while paused, round not advanced');
  const liveHost = others.find(c => c.me.playerId === others[0].state.hostId) || others[0]; // a still-connected socket
  liveHost.clear(); liveHost.emit('next-round'); await sleep(80);
  ok(liveHost.events('error-message').length >= 1, 'round advancement rejected while paused');

  // Killer reconnects in time
  const killerNew = await rejoin(port, killer); cs[cs.indexOf(killer)] = killerNew;
  ok(killerNew.role === killerRoleBefore, 'Killer got the SAME private role back');
  ok(cs.every(c => c.state && !c.state.paused && c.state.status === 'playing'), 'game resumed for everyone');
  ok(cs[0].events('game-resumed').length >= 1, 'game-resumed event sent');
  ok(cs[0].state.players.find(p => p.id === victimId).alive === false && cs[0].state.deadCount === 1, 'dead/alive status preserved');
  await sleep(GAME_MS + 400);
  ok(cs[0].state.status === 'playing' && !cs[0].events('pause-timeout').length && cs.every(c => c.state.players.length === 5), 'no spurious timeout after reconnect');

  console.log('\n5. Cop disconnect + dead player disconnect');
  const cop2 = byRole(cs, 'Cop'), copRole = cop2.role; cop2.drop(); await sleep(150);
  ok(cs.filter(c => c !== cop2).every(c => c.state.paused), 'Cop disconnect pauses everyone');
  const cop2n = await rejoin(port, cop2); cs[cs.indexOf(cop2)] = cop2n;
  ok(cop2n.role === copRole && !cs[0].state.paused, 'Cop restored with original role, game resumed');
  const deadClient = cs.find(c => c.me.playerId === victimId); deadClient.drop(); await sleep(150);
  ok(cs.filter(c => c !== deadClient).every(c => c.state.paused), 'a DEAD player disconnecting also pauses the game');
  const dn = await rejoin(port, deadClient); cs[cs.indexOf(deadClient)] = dn;
  ok(!cs[0].state.paused && cs[0].state.players.find(p => p.id === victimId).alive === false, 'dead player restored, still dead');

  console.log('\n6. Two players out: resume only when ALL are back');
  const a = cs[1], b = cs[2]; a.drop(); b.drop(); await sleep(150);
  ok(cs[0].state.pause.players.length === 2, 'pause lists both players');
  const an = await rejoin(port, a); cs[1] = an;
  ok(cs[0].state.paused && cs[0].state.pause.players.length === 1, 'still paused with one remaining');
  const bn = await rejoin(port, b); cs[2] = bn;
  ok(!cs[0].state.paused, 'resumed only after both returned');

  console.log('\n7. Timeout: host decision (end round)');
  const victim = cs[3], vName = victim.label, hostC = cs[0];
  victim.drop(); await sleep(GAME_MS + 500);
  ok(cs.filter(c => c !== victim).every(c => c.events('pause-timeout').some(e => e.playerName === vName)), 'everyone notified of timeout');
  ok(hostC.state.pause.awaitingHost && hostC.state.pause.canRestart, 'state says awaiting host, restart possible (4 remain)');
  ok(Object.keys(hostC.state.pause.players[0]).sort().join() === 'expired,id,name,remainingMs', 'pause payload exposes only id/name/timing');
  cs[1].clear(); cs[1].emit('host-end-round'); cs[1].emit('host-remove-restart'); await sleep(100);
  ok(cs[1].events('error-message').length === 2 && hostC.state.status === 'playing', 'non-host cannot end round or remove/restart');
  const rolesBefore = cs.filter(c => c !== victim).map(c => c.role).join();
  hostC.emit('host-end-round'); await sleep(150);
  ok(hostC.state.status === 'lobby' && !hostC.state.paused, 'end round -> lobby, pause cleared');
  ok(hostC.events('round-aborted').length === 1, 'round-aborted notification');
  await sleep(LOBBY_MS + 400);
  ok(hostC.state.players.length === 4 && !hostC.state.players.some(p => p.name === vName), 'offline player then removed by the lobby rule (15s)');
  hostC.emit('start-game', { rounds: 1 }); await sleep(200);
  ok(hostC.state.status === 'playing' && cs.filter(c => c !== victim).every(c => c.role), 'new game can start with 4 connected');
  ok(!hostC.state.players.some(p => p.name === vName), 'removed player not in new game');
  cs.forEach(c => c.drop()); await sleep(50);

  console.log('\n8. Timeout: host decision (remove & restart) with Killer gone');
  let k;
  do { // need a Killer who is not the host, so the host can make the decision
    cs = await newRoom(port, 6); cs[0].emit('start-game', { rounds: 3 }); await sleep(200);
    k = byRole(cs, 'Killer'); if (k === cs[0]) { cs.forEach(c => c.drop()); await sleep(30); }
  } while (k === cs[0]);
  const kName = k.label;
  const hostId = cs[0].me.playerId; const h = cs[0];
  if (k !== h) {
    k.drop(); await sleep(GAME_MS + 500);
    ok(h.state.pause.awaitingHost, 'awaiting host after Killer timeout');
    ok(cs.filter(c => c !== k).every(c => c.state.status === 'playing' && c.state.paused), 'round NOT silently continued/reassigned');
    h.clear(); cs.filter(c => c !== k).forEach(c => c.clear());
    h.emit('host-remove-restart'); await sleep(250);
    const live = cs.filter(c => c !== k);
    ok(live.every(c => c.state.status === 'playing' && !c.state.paused && c.state.total === 5), '5 players, round restarted, no pause');
    ok(live.every(c => c.role), 'every remaining player got a fresh private role');
    const rs2 = live.map(c => c.role); ok(rs2.filter(r => r === 'Cop').length === 1 && rs2.filter(r => r === 'Killer').length === 1, 'new Cop and new Killer among remaining players');
    ok(h.state.currentRound === 1 && h.state.totalRounds === 3, 'round number/total preserved');
    ok(live.every(c => c.log.every(([ev, d]) => ev === 'private-role-assigned' || !/"(Cop|Killer|Person \d)"|"role"/.test(JSON.stringify(d)))), 'no role leaked during pause/timeout/restart traffic');
    ok(h.events('player-removed').some(e => e.playerName === kName), 'removal notification names the player');
    ok(h.state.deathLimit === 2 && h.state.deadCount === 0, 'death limit recomputed for 5 players, counters reset');
    // play on: finish round via cop guess and continue to next round
    const cp = byRole(live, 'Cop'), kl = byRole(live, 'Killer'); cp.emit('submit-cop-guess', { suspectId: kl.me.playerId }); await sleep(150);
    ok(h.state.status === 'over' && h.state.result.winner === 'cop' && h.state.result.round === 1, 'cop investigation + scoring still work');
    h.emit('next-round'); await sleep(200);
    ok(h.state.currentRound === 2 && h.state.status === 'playing' && live.every(c => c.role), 'next round works');
  }
  cs.forEach(c => c.drop()); await sleep(50);

  console.log('\n9. Timeout: restart refused when fewer than 4 would remain; reconnect AFTER timeout still resumes');
  cs = await newRoom(port, 4); cs[0].emit('start-game', { rounds: 1 }); await sleep(200);
  const v = cs[3]; const vRole = v.role; v.drop(); await sleep(GAME_MS + 500);
  ok(!cs[0].state.pause.canRestart && cs[0].state.pause.remainingAfterRemoval === 3, 'canRestart=false (only 3 would remain)');
  cs[0].clear(); cs[0].emit('host-remove-restart'); await sleep(100);
  ok(cs[0].events('error-message').some(m => /At least 4/.test(m)) && cs[0].state.status === 'playing', 'server refuses remove & restart');
  const vn = await rejoin(port, v); cs[3] = vn;
  ok(vn.role === vRole && !cs[0].state.paused, 'player returning after timeout (before host acted) resumes the game with same role');
  cs.forEach(c => c.drop()); await sleep(50);

  console.log('\n10. Host disconnect + host transfer; stale socket; leave');
  cs = await newRoom(port, 5); cs[0].emit('start-game', { rounds: 1 }); await sleep(200);
  const oldHost = cs[0]; oldHost.drop(); await sleep(GAME_MS + 500);
  const newHostId = cs[1].state.hostId; ok(newHostId !== oldHost.me.playerId && cs[1].state.pause.awaitingHost, 'host disconnect: control passes to a connected player');
  cs[1].emit('host-end-round'); await sleep(120);
  ok(cs[1].state.status === 'lobby' || cs[1].state.hostId !== cs[1].me.playerId, 'new host (only) could act');
  cs.forEach(c => c.drop()); await sleep(50);

  cs = await newRoom(port, 4); cs[0].emit('start-game', { rounds: 1 }); await sleep(200);
  // stale socket: same player rejoins on a second socket while the first is still open, then the first closes
  const first = cs[2]; const second = await rejoin(port, first);
  ok(first.invalid, 'old socket told session-invalid when the player rejoined elsewhere');
  first.drop(); await sleep(200);
  ok(cs[0].state.players.find(p => p.name === 'P3').connected && !cs[0].state.paused && cs[0].state.players.length === 4, 'stale disconnect ignored: no pause, no duplicate entry');
  // leave on purpose mid-game -> immediate timeout state
  second.emit('leave-room'); await sleep(150);
  ok(cs[0].state.paused && cs[0].state.pause.awaitingHost, 'leaving mid-game skips the countdown and goes straight to the host decision');
  cs.forEach(c => c.drop());

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
