'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const Database = require('better-sqlite3');

// ---- Config ----
const PORT = process.env.PORT || 3000;
const USERS = ['sam', 'kimi'];
const VIEWER_ALLOWED = 'sam';                 // only SAM may open the dashboard
const OFFLINE_MS = 60 * 1000;                 // no heartbeat for 60s => offline; next heartbeat = new "online" event
const ACTIVE_MS = 45 * 1000;                  // a device counts as "connected" if seen within 45s
const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_MS = 7 * DAY_MS;

// ---- Storage (SQLite) ----
const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'activity.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    session_key TEXT PRIMARY KEY,
    username    TEXT NOT NULL,
    ip          TEXT,
    device_type TEXT,
    user_agent  TEXT,
    first_seen  INTEGER NOT NULL,
    last_seen   INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS online_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT NOT NULL,
    session_key TEXT NOT NULL,
    ip          TEXT,
    device_type TEXT,
    at          INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_events_user_at ON online_events(username, at);
  CREATE INDEX IF NOT EXISTS idx_sessions_user_seen ON sessions(username, last_seen);
`);

const q = {
  getSession: db.prepare('SELECT last_seen FROM sessions WHERE session_key = ?'),
  insertSession: db.prepare(
    'INSERT INTO sessions (session_key, username, ip, device_type, user_agent, first_seen, last_seen) VALUES (?,?,?,?,?,?,?)'
  ),
  updateSession: db.prepare(
    'UPDATE sessions SET ip = ?, device_type = ?, user_agent = ?, last_seen = ? WHERE session_key = ?'
  ),
  insertEvent: db.prepare(
    'INSERT INTO online_events (username, session_key, ip, device_type, at) VALUES (?,?,?,?,?)'
  ),
  activeSessions: db.prepare('SELECT session_key FROM sessions WHERE username = ? AND last_seen > ?'),
  latestSession: db.prepare(
    'SELECT ip, device_type, last_seen FROM sessions WHERE username = ? ORDER BY last_seen DESC LIMIT 1'
  ),
  eventsSince: db.prepare('SELECT at FROM online_events WHERE username = ? AND at > ? ORDER BY at DESC'),
  cleanupEvents: db.prepare('DELETE FROM online_events WHERE at < ?'),
  cleanupSessions: db.prepare('DELETE FROM sessions WHERE last_seen < ?'),
};

const heartbeat = db.transaction((key, username, ip, device, ua, now) => {
  const row = q.getSession.get(key);
  if (!row) {
    q.insertSession.run(key, username, ip, device, ua, now, now);
    q.insertEvent.run(username, key, ip, device, now);            // came online
  } else {
    if (now - row.last_seen > OFFLINE_MS) {
      q.insertEvent.run(username, key, ip, device, now);          // came back online
    }
    q.updateSession.run(ip, device, ua, now, key);
  }
});

// ---- Helpers ----
function detectDevice(ua = '') {
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return 'Tablet';
  if (/Mobi|iPhone|iPod|Android|BlackBerry|Opera Mini|IEMobile/i.test(ua)) return 'Mobile';
  return 'PC';
}

// ---- App ----
const app = express();
app.set('trust proxy', process.env.TRUST_PROXY === '1'); // enable behind a reverse proxy that sets X-Forwarded-For
app.use(express.json({ limit: '2kb' }));

// Serve ONLY the front-end files (never server.js or the data folder)
const PUBLIC_FILES = ['index.html', 'script.js', 'features.js', 'features.css'];
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
PUBLIC_FILES.forEach((file) => {
  app.get(`/${file}`, (req, res) => res.sendFile(path.join(__dirname, file)));
});

// Heartbeat: called every 15s by features.js for the logged-in user
app.post('/api/heartbeat', (req, res) => {
  const { username, sessionId } = req.body || {};
  if (!USERS.includes(username) || typeof sessionId !== 'string' || sessionId.length > 64) {
    return res.status(400).json({ error: 'Bad request' });
  }
  const ip = (req.ip || '').replace('::ffff:', '');
  const ua = req.get('user-agent') || '';
  const device = detectDevice(ua);
  const key = `${sessionId}|${username}`;
  heartbeat(key, username, ip, device, ua, Date.now());
  res.json({ ok: true, device });
});

// Dashboard data for Kimi (viewable by SAM only)
app.get('/api/dashboard', (req, res) => {
  if (req.query.viewer !== VIEWER_ALLOWED) {
    return res.status(403).json({ error: 'Only SAM can view this dashboard' });
  }
  const target = req.query.user;
  if (!USERS.includes(target)) return res.status(400).json({ error: 'Unknown user' });

  const now = Date.now();
  const latest = q.latestSession.get(target);
  const connected = q.activeSessions.all(target, now - ACTIVE_MS);
  const events = q.eventsSince.all(target, now - DAY_MS);

  res.json({
    user: target,
    ip: latest ? latest.ip : null,
    deviceType: latest ? latest.device_type : null,
    devicesConnected: connected.length,
    onlineCount24h: events.length,
    onlineTimestamps: events.map((e) => e.at),
    lastSeen: latest ? latest.last_seen : null,
    generatedAt: now,
  });
});

// Housekeeping: drop data older than 7 days, once per hour
setInterval(() => {
  const cutoff = Date.now() - RETENTION_MS;
  q.cleanupEvents.run(cutoff);
  q.cleanupSessions.run(cutoff);
}, 60 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
