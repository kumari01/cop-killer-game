# Cop & Killer: Classic Mode (Phase 1)
Digital replacement for the paper chits. Open `index.html` in any modern browser; no build step or server needed.

- `js/roles.js` role list, scores, Fisher-Yates shuffle (crypto-based)
- `js/game.js` state (roles kept in memory only, cleared when finished)
- `js/ui.js` DOM rendering; `js/app.js` navigation and events

Privacy: roles are never logged, stored, or sent anywhere. A revealed role is wiped from the DOM on "Hide role & pass phone" and if the tab is backgrounded.
Phase 2 (online) plan: keep `roles.js` logic on a Node/Socket.IO server, send each player only their own role.
