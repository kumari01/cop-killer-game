# 🔍 Cop & Killer

A modern digital adaptation of the classic chit/party mystery game (*Raja Rani Chor Police* / *Thief & Police*), featuring both **Pass & Play (Classic)** and **Real-Time Online Multiplayer**.

---

## 🎮 Game Modes

### 📴 1. Classic Mode (Pass & Play)
*Play together on a single phone or tablet.*
- **Players:** 4 to 10 players.
- **Offline:** 100% client-side in the browser — no server or internet connection required.
- **How to play:**
  1. Pick the number of players (4–10) with live role preview chips.
  2. Enter each player's name.
  3. Pass the phone one player at a time.
  4. Each player presses and holds the chit to secretly peek at their role, then releases to hide it.
  5. Once all chits are revealed, play face-to-face in person!

---

### 🌐 2. Online Mode (Multiplayer)
*Everyone plays on their own device from anywhere.*
- **Rooms:** Host creates a private room and shares a 6-character Room ID.
- **Rounds Selector:** Host chooses the number of rounds (1–20) using a native on-screen modal dialog.
- **Secret Roles:** Roles are securely generated on the server and delivered privately over WebSockets.
- **Live Gameplay:**
  - **The Killer:** Secretly eliminates players in real life or during the game. The Killer cannot report themselves as dead (immediate on-screen notification).
  - **Victims:** Eliminated players tap **"I'M DEAD"** (with confirmation dialog).
  - **The Cop:** Gets **one chance** to investigate and identify the Killer:
    - **Correct Guess:** Cop catches the Killer $\rightarrow$ **Cop wins the round!**
    - **Wrong Guess:** Cop loses their only chance $\rightarrow$ **Killer wins the round!**
  - **Multi-Round Progression:** At the end of each round, the host clicks **"Continue to Next Round"** to deal new roles and advance the game.
  - **🏆 Final Leaderboard:** When all rounds finish, a cumulative leaderboard displays total points and rankings across all rounds.

---

## 🎭 Roles & Points System

| Role | Objective | Points |
| :--- | :--- | :--- |
| **Cop** 🛡️ | Catch the Killer before half the players are dead. Gets **one guess**. | **1,000 pts** on win (0 pts if wrong or Killer wins) |
| **Killer** 💀 | Eliminate half the players without getting caught, or survive the Cop's single guess. | **1,000 pts** on win (0 pts if caught) |
| **Person 1** 👤 | Survive the round. | **900 pts** |
| **Person 2** 👤 | Survive the round. | **800 pts** |
| **Person 3** 👤 | Survive the round. | **700 pts** |
| **Person 4–8** 👤 | Survive the round. | **600 – 200 pts** |

---

## 🛠️ Tech Stack

- **Frontend:** HTML5, CSS3 (Glassmorphism, animations, responsive design), Vanilla JavaScript (ES6+), [Lucide Icons](https://lucide.dev/), [Socket.IO Client](https://socket.io/).
- **Backend:** [Node.js](https://nodejs.org/) (v18+), [Express](https://expressjs.com/), [Socket.IO](https://socket.io/), [CORS](https://www.npmjs.com/package/cors).

---

## 📁 Project Structure

```text
cop-and-killer-online/
├── backend/
│   ├── middleware/
│   │   └── validation.js       # Input sanitization and game error handling
│   ├── services/
│   │   ├── gameService.js      # Round state, death reports, cop guess, multi-round logic
│   │   ├── roleService.js      # Server-side Fisher-Yates role shuffling & scoring
│   │   ├── roomService.js      # Room lifecycle, lobby state, player authentication & public state
│   │   ├── disconnectService.js # Reconnect timers, game pause/resume, host timeout decision
│   │   └── scoreService.js     # Round & cumulative scoreboard calculation
│   ├── socket/
│   │   ├── gameEvents.js       # Socket handlers: start-game, next-round, death, cop-guess
│   │   └── roomEvents.js       # Socket handlers: create, join, rejoin, leave
│   ├── test/                   # disconnect.test.js (Socket.IO) · browser.test.js (Playwright)
│   ├── package.json
│   └── server.js               # Express + Socket.IO server (serves frontend statically)
├── frontend/
│   ├── css/
│   │   ├── animations.css      # Card flip, slide-in, and modal transitions
│   │   ├── responsive.css      # Mobile, tablet, and desktop breakpoints
│   │   └── style.css           # Glassmorphism dark-green & gold theme, tabs, modals
│   ├── js/
│   │   ├── app.js              # Online game wiring, socket listeners, and navigation
│   │   ├── classic.js          # Classic mode Pass & Play state and UI handlers
│   │   ├── roles.js            # Shared role definitions, icons, and styling helpers
│   │   ├── socket.js           # Socket.IO connection and session storage manager
│   │   └── ui.js               # DOM renderer, modals (roundsBox, confirmBox), and toasts
│   ├── favicon.ico
│   └── index.html              # Single-page application with shared Home Page UI
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) version 18 or higher.

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Start the Server
```bash
npm start
```
The server will start on port `3001` (or your configured `PORT`):
```text
Cop & Killer on :3001
```

### 3. Open the Game
Open your browser and navigate to:
```text
http://localhost:3001
```

> **Note on Live Server (Port 5500):** If using VS Code Live Server for the frontend, ensure `window.SERVER_URL` in `frontend/index.html` is pointing to `http://localhost:3001` so the client can connect to the backend WebSocket server. When hosted directly by Express, it serves both frontend and backend on the same port seamlessly.

---

## 🌐 Deployment

### Option A: Full-Stack Deployment (Render / Railway)
The backend is already configured to serve the `frontend/` directory statically:
1. Deploy `backend` to **Render**, **Railway**, or **Heroku**.
2. Set Environment Variables:
   - `PORT`: Server port (automatically provided by most cloud platforms).
   - `CLIENT_ORIGIN`: Your custom frontend domain (or leave unset to allow any origin).
3. The root URL (`https://your-app.onrender.com`) will serve both the web UI and WebSocket endpoints.

### Option B: Separate Frontend (Netlify / Vercel)
1. Deploy `backend` on Render/Railway.
2. In `frontend/index.html`, set:
   ```javascript
   window.SERVER_URL = 'https://your-backend.onrender.com';
   ```
3. Deploy `frontend/` to Netlify, Vercel, or GitHub Pages.

---

## 🔌 Disconnect Management

| Situation | Behaviour |
| :--- | :--- |
| **Lobby**, player drops | Shown as `Reconnecting… Ns` for **15 s**; host's Start button is disabled; reconnecting restores them, otherwise they are removed and the list is re-broadcast. |
| **Start / next round** | Server validates: sender is host, game not paused, **no registered player disconnected**, **≥ 4 connected**. Roles are only dealt to connected players. |
| **In game**, any player drops | Whole game **pauses** (`game-paused`) with the player's name and a **30 s** countdown. Death reports, Cop guesses and round advancement are rejected. Roles/alive state are untouched and never revealed. |
| **Reconnect** (existing `rejoin` + token) | Same role is re-sent privately; game resumes (`game-resumed`) only when **everyone** is back. |
| **30 s expires** | Everyone is notified (`pause-timeout`). Host (only) chooses **End round → lobby** or **Remove disconnected & restart round with new roles** (needs ≥ 4 left). Nothing is reassigned silently. If the host is the one who dropped, host rights pass to a connected player. |

Tests: `cd backend && npm run test:disconnect` (uses short timers via `CK_LOBBY_GRACE_MS` / `CK_GAME_GRACE_MS`; defaults are 15 000 / 30 000 ms).
