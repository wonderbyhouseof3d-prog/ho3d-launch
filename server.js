const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DB_PATH = process.env.DATA_PATH || path.join(__dirname, 'data.json');

const USERS = {
  'aditya@houseof3d.in': { password: 'ho3d@aditya2026', name: 'Aditya', role: 'admin', avatar: '👨‍💼', title: 'Founder & CEO' },
  'raveen@houseof3d.in': { password: 'ho3d@raveen2026', name: 'Raveen Keer', role: 'member', avatar: '📊', title: 'Accounts & Admin' },
  'sarang@houseof3d.in': { password: 'ho3d@sarang2026', name: 'Sarang Wakode', role: 'member', avatar: '⚙️', title: 'Operations' }
};

const sessions = {};

function createSession(email) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions[token] = { email, createdAt: Date.now() };
  return token;
}

function getSession(token) {
  if (!token || !sessions[token]) return null;
  const s = sessions[token];
  if (Date.now() - s.createdAt > 7 * 24 * 60 * 60 * 1000) { delete sessions[token]; return null; }
  return s;
}

function requireAuth(req, res, next) {
  const session = getSession(req.headers['x-auth-token']);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });
  req.user = USERS[session.email];
  req.email = session.email;
  next();
}

function requireAdmin(req, res, next) {
  const session = getSession(req.headers['x-auth-token']);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });
  const user = USERS[session.email];
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  req.user = user;
  req.email = session.email;
  next();
}

function readDB() {
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch { return initDB(); }
}

function writeDB(data) { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2)); }

function initDB() {
  const db = {
    tasks: {}, subtasks: {}, taskOverrides: {}, addedSubtasks: {},
    metrics: {
      spoolsSold: 0, spoolsTarget: 1000, amazonReviews: 0, reviewsTarget: 20,
      revenue: 0, revenueTarget: 200000, nodePartners: 0,
      stock: {
        'pla-black':     { name: 'PLA+ Black',        total: 200, remaining: 200 },
        'pla-white':     { name: 'PLA+ White',        total: 200, remaining: 200 },
        'pla-grey':      { name: 'PLA+ Grey',         total: 100, remaining: 100 },
        'pla-red':       { name: 'PLA+ Red',          total: 100, remaining: 100 },
        'pla-blue':      { name: 'PLA+ Galaxy Blue',  total: 100, remaining: 100 },
        'pla-pro-blk':   { name: 'PLA Pro Black',     total: 120, remaining: 120 },
        'pla-pro-wht':   { name: 'PLA Pro White',     total: 80,  remaining: 80  },
        'pla-matte':     { name: 'PLA Matte Black',   total: 80,  remaining: 80  },
        'petg-black':    { name: 'PETG-HS Black',     total: 80,  remaining: 80  },
        'petg-clear':    { name: 'PETG Transparent',  total: 80,  remaining: 80  },
        'silk-gold':     { name: 'PLA Silk Gold',     total: 80,  remaining: 80  },
        'silk-rose':     { name: 'PLA Silk Rose Gold',total: 40,  remaining: 40  },
        'pla-cf':        { name: 'PLA Carbon Fibre',  total: 50,  remaining: 50  },
        'pla-glow':      { name: 'PLA Glow in Dark',  total: 50,  remaining: 50  },
        'pla-marble':    { name: 'PLA Marble',        total: 25,  remaining: 25  },
        'pla-starlight': { name: 'PLA Starlight',     total: 25,  remaining: 25  },
      },
      lastUpdated: null, updatedBy: null
    },
    dailyLog: [], customTasks: [],
    settings: { launchDate: '2026-06-25', reorderTarget: 30, teamName: 'HO3D' }
  };
  writeDB(db);
  return db;
}

function logAction(db, user, action) {
  if (!db.dailyLog) db.dailyLog = [];
  db.dailyLog.push({ date: new Date().toISOString(), user, action });
  if (db.dailyLog.length > 500) db.dailyLog = db.dailyLog.slice(-500);
}

// Auth routes
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = USERS[email?.toLowerCase()];
  if (!user || user.password !== password) return res.status(401).json({ error: 'Invalid email or password' });
  const token = createSession(email.toLowerCase());
  const db = readDB();
  logAction(db, user.name, 'Logged in');
  writeDB(db);
  res.json({ token, user: { email: email.toLowerCase(), name: user.name, role: user.role, avatar: user.avatar, title: user.title } });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  delete sessions[req.headers['x-auth-token']];
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: { email: req.email, name: req.user.name, role: req.user.role, avatar: req.user.avatar, title: req.user.title } });
});

// Data routes
app.get('/api/state', requireAuth, (req, res) => res.json(readDB()));

app.post('/api/task/:id/toggle', requireAuth, (req, res) => {
  const db = readDB();
  if (!db.tasks[req.params.id]) db.tasks[req.params.id] = {};
  const t = db.tasks[req.params.id];
  t.done = !t.done;
  if (t.done) { t.doneBy = req.user.name; t.doneAt = new Date().toISOString(); logAction(db, req.user.name, `Completed: ${req.params.id}`); }
  else { t.doneBy = null; t.doneAt = null; logAction(db, req.user.name, `Reopened: ${req.params.id}`); }
  writeDB(db);
  res.json({ ok: true, state: t });
});

app.post('/api/subtask/:id/toggle', requireAuth, (req, res) => {
  const db = readDB();
  if (!db.subtasks[req.params.id]) db.subtasks[req.params.id] = {};
  const s = db.subtasks[req.params.id];
  s.done = !s.done;
  if (s.done) { s.doneBy = req.user.name; s.doneAt = new Date().toISOString(); }
  writeDB(db);
  res.json({ ok: true, state: s });
});

app.post('/api/task/:id/note', requireAuth, (req, res) => {
  const db = readDB();
  if (!db.tasks[req.params.id]) db.tasks[req.params.id] = {};
  db.tasks[req.params.id].notes = req.body.note;
  writeDB(db);
  res.json({ ok: true });
});

app.post('/api/metrics', requireAuth, (req, res) => {
  const db = readDB();
  db.metrics = { ...db.metrics, ...req.body, lastUpdated: new Date().toISOString(), updatedBy: req.user.name };
  logAction(db, req.user.name, 'Updated metrics');
  writeDB(db);
  res.json({ ok: true, metrics: db.metrics });
});

app.post('/api/stock/:sku', requireAuth, (req, res) => {
  const db = readDB();
  if (db.metrics.stock[req.params.sku]) {
    db.metrics.stock[req.params.sku].remaining = parseInt(req.body.remaining);
    db.metrics.lastUpdated = new Date().toISOString();
    db.metrics.updatedBy = req.user.name;
    logAction(db, req.user.name, `Stock: ${req.params.sku} = ${req.body.remaining}`);
    writeDB(db);
  }
  res.json({ ok: true });
});

// Admin only
app.post('/api/custom-task', requireAdmin, (req, res) => {
  const db = readDB();
  const task = { ...req.body, id: 'custom_' + Date.now(), subtasks: [] };
  db.customTasks.push(task);
  db.tasks[task.id] = { done: false };
  logAction(db, req.user.name, `Created: ${task.text}`);
  writeDB(db);
  res.json({ ok: true, task });
});

app.post('/api/task/:id/edit', requireAdmin, (req, res) => {
  const db = readDB();
  const { text, owner, priority, due } = req.body;
  const ci = db.customTasks.findIndex(t => t.id === req.params.id);
  if (ci !== -1) {
    if (text) db.customTasks[ci].text = text;
    if (owner) db.customTasks[ci].owner = owner;
    if (priority) db.customTasks[ci].priority = priority;
    if (due) db.customTasks[ci].due = due;
  } else {
    if (!db.taskOverrides) db.taskOverrides = {};
    if (!db.taskOverrides[req.params.id]) db.taskOverrides[req.params.id] = {};
    const o = db.taskOverrides[req.params.id];
    if (text) o.text = text;
    if (owner) o.owner = owner;
    if (priority) o.priority = priority;
    if (due) o.due = due;
  }
  logAction(db, req.user.name, `Edited: ${req.params.id}`);
  writeDB(db);
  res.json({ ok: true });
});

app.delete('/api/task/:id', requireAdmin, (req, res) => {
  const db = readDB();
  const before = db.customTasks.length;
  db.customTasks = db.customTasks.filter(t => t.id !== req.params.id);
  if (db.customTasks.length < before) {
    delete db.tasks[req.params.id];
    logAction(db, req.user.name, `Deleted: ${req.params.id}`);
    writeDB(db);
    return res.json({ ok: true });
  }
  res.json({ ok: false, error: 'Cannot delete built-in tasks' });
});

app.post('/api/task/:id/subtask', requireAdmin, (req, res) => {
  const db = readDB();
  const subId = 'sub_' + Date.now();
  const newSub = { id: subId, text: req.body.text, owner: req.body.owner || 'Aditya', due: req.body.due || '—' };
  const ci = db.customTasks.findIndex(t => t.id === req.params.id);
  if (ci !== -1) { if (!db.customTasks[ci].subtasks) db.customTasks[ci].subtasks = []; db.customTasks[ci].subtasks.push(newSub); }
  else { if (!db.addedSubtasks) db.addedSubtasks = {}; if (!db.addedSubtasks[req.params.id]) db.addedSubtasks[req.params.id] = []; db.addedSubtasks[req.params.id].push(newSub); }
  db.subtasks[subId] = { done: false };
  logAction(db, req.user.name, `Added subtask: ${req.params.id}`);
  writeDB(db);
  res.json({ ok: true, subtask: newSub });
});

app.post('/api/admin/reassign', requireAdmin, (req, res) => {
  const db = readDB();
  const { from, to } = req.body;
  let count = 0;
  db.customTasks.forEach(t => {
    if (t.owner === from) { t.owner = to; count++; }
    if (t.subtasks) t.subtasks.forEach(s => { if (s.owner === from) { s.owner = to; count++; } });
  });
  logAction(db, req.user.name, `Reassigned ${count}: ${from} → ${to}`);
  writeDB(db);
  res.json({ ok: true, count });
});

app.post('/api/admin/settings', requireAdmin, (req, res) => {
  const db = readDB();
  db.settings = { ...db.settings, ...req.body };
  writeDB(db);
  res.json({ ok: true, settings: db.settings });
});

app.get('/api/log', requireAuth, (req, res) => {
  const db = readDB();
  res.json((db.dailyLog || []).slice(-50).reverse());
});

app.get('/api/export', requireAdmin, (req, res) => {
  const db = readDB();
  res.setHeader('Content-Disposition', 'attachment; filename=ho3d_backup.json');
  res.json(db);
});

const PORT = process.env.PORT || 3847;
app.listen(PORT, '0.0.0.0', () => {
  const interfaces = os.networkInterfaces();
  let localIP = 'localhost';
  Object.values(interfaces).forEach(iface => iface.forEach(i => { if (i.family === 'IPv4' && !i.internal) localIP = i.address; }));
  console.log(`\n🚀 HO3D Launch Command Centre — http://localhost:${PORT}`);
  console.log(`👥 Team: http://${localIP}:${PORT}\n`);
  console.log('Credentials:');
  console.log('  aditya@houseof3d.in  / ho3d@aditya2026  [ADMIN]');
  console.log('  raveen@houseof3d.in  / ho3d@raveen2026');
  console.log('  sarang@houseof3d.in  / ho3d@sarang2026\n');
});
