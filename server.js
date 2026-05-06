const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DB_PATH = process.env.DATA_PATH || path.join(__dirname, 'data.json');

// ── DB helpers ────────────────────────────────────────────────────────────────
function readDB() {
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch { return initDB(); }
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function initDB() {
  const db = {
    tasks: {},        // taskId -> { done, doneBy, doneAt, notes, blockedBy }
    subtasks: {},     // subtaskId -> { done, doneBy, doneAt }
    metrics: {
      spoolsSold: 0,
      spoolsTarget: 1000,
      amazonReviews: 0,
      reviewsTarget: 20,
      revenue: 0,
      revenueTarget: 200000,
      stock: {},      // skuId -> { name, total, remaining }
      lastUpdated: null,
      updatedBy: null
    },
    dailyLog: [],     // { date, user, action, note }
    customTasks: [],
    settings: {
      launchDate: null,
      reorderTarget: 30, // days
      teamName: 'HO3D'
    }
  };
  writeDB(db);
  return db;
}

// Initialize default stock if empty
function ensureStock(db) {
  if (!db.metrics.stock || Object.keys(db.metrics.stock).length === 0) {
    db.metrics.stock = {
      'pla-black': { name: 'PLA+ Black', total: 200, remaining: 200 },
      'pla-white': { name: 'PLA+ White', total: 200, remaining: 200 },
      'pla-grey': { name: 'PLA+ Grey', total: 200, remaining: 200 },
      'pla-red': { name: 'PLA+ Red', total: 100, remaining: 100 },
      'pla-blue': { name: 'PLA+ Galaxy Blue', total: 100, remaining: 100 },
      'pla-pro-black': { name: 'PLA Pro Black', total: 120, remaining: 120 },
      'pla-pro-white': { name: 'PLA Pro White', total: 80, remaining: 80 },
      'pla-matte': { name: 'PLA Matte Black', total: 80, remaining: 80 },
      'petg-black': { name: 'PETG-HS Black', total: 80, remaining: 80 },
      'petg-clear': { name: 'PETG Transparent', total: 80, remaining: 80 },
      'silk-gold': { name: 'PLA Silk Gold', total: 80, remaining: 80 },
      'pla-cf': { name: 'PLA Carbon Fibre', total: 50, remaining: 50 },
      'pla-glow': { name: 'PLA Glow in Dark', total: 50, remaining: 50 },
      'pla-marble': { name: 'PLA Marble', total: 25, remaining: 25 },
      'pla-starlight': { name: 'PLA Starlight', total: 25, remaining: 25 },
    };
  }
  return db;
}

// ── API ROUTES ────────────────────────────────────────────────────────────────

// Get full state
app.get('/api/state', (req, res) => {
  const db = ensureStock(readDB());
  res.json(db);
});

// Toggle task
app.post('/api/task/:id/toggle', (req, res) => {
  const db = readDB();
  const { user } = req.body;
  const id = req.params.id;
  if (!db.tasks[id]) db.tasks[id] = {};
  db.tasks[id].done = !db.tasks[id].done;
  if (db.tasks[id].done) {
    db.tasks[id].doneBy = user || 'Unknown';
    db.tasks[id].doneAt = new Date().toISOString();
    logAction(db, user, `Completed task: ${id}`);
  } else {
    db.tasks[id].doneBy = null;
    db.tasks[id].doneAt = null;
    logAction(db, user, `Reopened task: ${id}`);
  }
  writeDB(db);
  res.json({ ok: true, state: db.tasks[id] });
});

// Toggle subtask
app.post('/api/subtask/:id/toggle', (req, res) => {
  const db = readDB();
  const { user, taskId } = req.body;
  const id = req.params.id;
  if (!db.subtasks[id]) db.subtasks[id] = {};
  db.subtasks[id].done = !db.subtasks[id].done;
  if (db.subtasks[id].done) {
    db.subtasks[id].doneBy = user || 'Unknown';
    db.subtasks[id].doneAt = new Date().toISOString();
  }
  writeDB(db);
  res.json({ ok: true, state: db.subtasks[id] });
});

// Save note
app.post('/api/task/:id/note', (req, res) => {
  const db = readDB();
  const { note, user } = req.body;
  if (!db.tasks[req.params.id]) db.tasks[req.params.id] = {};
  db.tasks[req.params.id].notes = note;
  writeDB(db);
  res.json({ ok: true });
});

// Update metrics
app.post('/api/metrics', (req, res) => {
  const db = ensureStock(readDB());
  const { user, ...updates } = req.body;
  db.metrics = { ...db.metrics, ...updates, lastUpdated: new Date().toISOString(), updatedBy: user };
  logAction(db, user, `Updated metrics`);
  writeDB(db);
  res.json({ ok: true, metrics: db.metrics });
});

// Update single stock SKU
app.post('/api/stock/:sku', (req, res) => {
  const db = ensureStock(readDB());
  const { remaining, user } = req.body;
  if (db.metrics.stock[req.params.sku]) {
    db.metrics.stock[req.params.sku].remaining = parseInt(remaining);
    db.metrics.lastUpdated = new Date().toISOString();
    db.metrics.updatedBy = user;
    logAction(db, user, `Updated stock: ${req.params.sku} = ${remaining}`);
    writeDB(db);
  }
  res.json({ ok: true });
});

// Add custom task
app.post('/api/custom-task', (req, res) => {
  const db = readDB();
  const task = req.body;
  task.id = 'custom_' + Date.now();
  task.subtasks = [];
  db.customTasks.push(task);
  db.tasks[task.id] = { done: false };
  logAction(db, req.body.user, `Added task: ${task.text}`);
  writeDB(db);
  res.json({ ok: true, task });
});

// Get activity log
app.get('/api/log', (req, res) => {
  const db = readDB();
  res.json((db.dailyLog || []).slice(-50).reverse());
});

// Save settings
app.post('/api/settings', (req, res) => {
  const db = readDB();
  db.settings = { ...db.settings, ...req.body };
  writeDB(db);
  res.json({ ok: true });
});

// Export data
app.get('/api/export', (req, res) => {
  const db = readDB();
  res.setHeader('Content-Disposition', 'attachment; filename=ho3d_tasks_backup.json');
  res.json(db);
});

function logAction(db, user, action) {
  if (!db.dailyLog) db.dailyLog = [];
  db.dailyLog.push({
    date: new Date().toISOString(),
    user: user || 'Unknown',
    action
  });
  // Keep last 500 entries
  if (db.dailyLog.length > 500) db.dailyLog = db.dailyLog.slice(-500);
}

// ── START ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3847;
app.listen(PORT, '0.0.0.0', () => {
  const interfaces = os.networkInterfaces();
  let localIP = 'localhost';
  Object.values(interfaces).forEach(iface => {
    iface.forEach(i => {
      if (i.family === 'IPv4' && !i.internal) localIP = i.address;
    });
  });
  console.log('\n🚀 HO3D Launch Command Centre');
  console.log('================================');
  console.log(`📱 Your device:  http://localhost:${PORT}`);
  console.log(`👥 Team access:  http://${localIP}:${PORT}`);
  console.log('================================');
  console.log('Share the team URL with your team on the same WiFi\n');
});

// ── ADMIN ROUTES ──────────────────────────────────────────────────────────────

// Edit task (admin only)
app.post('/api/task/:id/edit', (req, res) => {
  const db = readDB();
  const { text, owner, priority, due, user } = req.body;
  // Find in custom tasks first
  const customIdx = db.customTasks.findIndex(t => t.id === req.params.id);
  if (customIdx !== -1) {
    if (text) db.customTasks[customIdx].text = text;
    if (owner) db.customTasks[customIdx].owner = owner;
    if (priority) db.customTasks[customIdx].priority = priority;
    if (due) db.customTasks[customIdx].due = due;
    logAction(db, user, `Edited task: ${req.params.id}`);
    writeDB(db);
    return res.json({ ok: true, task: db.customTasks[customIdx] });
  }
  // For built-in tasks, store overrides
  if (!db.taskOverrides) db.taskOverrides = {};
  if (!db.taskOverrides[req.params.id]) db.taskOverrides[req.params.id] = {};
  if (text) db.taskOverrides[req.params.id].text = text;
  if (owner) db.taskOverrides[req.params.id].owner = owner;
  if (priority) db.taskOverrides[req.params.id].priority = priority;
  if (due) db.taskOverrides[req.params.id].due = due;
  logAction(db, user, `Edited built-in task: ${req.params.id}`);
  writeDB(db);
  res.json({ ok: true });
});

// Delete task (admin only — custom tasks only)
app.delete('/api/task/:id', (req, res) => {
  const db = readDB();
  const { user } = req.body;
  const before = db.customTasks.length;
  db.customTasks = db.customTasks.filter(t => t.id !== req.params.id);
  if (db.customTasks.length < before) {
    delete db.tasks[req.params.id];
    logAction(db, user, `Deleted task: ${req.params.id}`);
    writeDB(db);
    return res.json({ ok: true });
  }
  res.json({ ok: false, error: 'Cannot delete built-in tasks' });
});

// Add subtask to existing task
app.post('/api/task/:id/subtask', (req, res) => {
  const db = readDB();
  const { text, owner, due, user } = req.body;
  const subId = 'sub_' + Date.now();
  const newSub = { id: subId, text, owner: owner || 'Aditya', due: due || '—' };
  // Try custom tasks first
  const customIdx = db.customTasks.findIndex(t => t.id === req.params.id);
  if (customIdx !== -1) {
    if (!db.customTasks[customIdx].subtasks) db.customTasks[customIdx].subtasks = [];
    db.customTasks[customIdx].subtasks.push(newSub);
    db.subtasks[subId] = { done: false };
    logAction(db, user, `Added subtask to: ${req.params.id}`);
    writeDB(db);
    return res.json({ ok: true, subtask: newSub });
  }
  // For built-in tasks store in addedSubtasks
  if (!db.addedSubtasks) db.addedSubtasks = {};
  if (!db.addedSubtasks[req.params.id]) db.addedSubtasks[req.params.id] = [];
  db.addedSubtasks[req.params.id].push(newSub);
  db.subtasks[subId] = { done: false };
  logAction(db, user, `Added subtask to: ${req.params.id}`);
  writeDB(db);
  res.json({ ok: true, subtask: newSub });
});

// Reassign all tasks from one person to another
app.post('/api/admin/reassign', (req, res) => {
  const db = readDB();
  const { from, to, user } = req.body;
  let count = 0;
  db.customTasks.forEach(t => {
    if (t.owner === from) { t.owner = to; count++; }
    if (t.subtasks) t.subtasks.forEach(s => { if (s.owner === from) { s.owner = to; count++; } });
  });
  if (!db.taskOverrides) db.taskOverrides = {};
  // Also override built-in tasks
  logAction(db, user, `Reassigned ${count} tasks from ${from} to ${to}`);
  writeDB(db);
  res.json({ ok: true, count });
});

// Get team workload
app.get('/api/admin/workload', (req, res) => {
  const db = readDB();
  res.json({ customTasks: db.customTasks, taskOverrides: db.taskOverrides || {}, addedSubtasks: db.addedSubtasks || {} });
});

// Update settings (launch date etc)
app.post('/api/admin/settings', (req, res) => {
  const db = readDB();
  const { user, ...settings } = req.body;
  db.settings = { ...db.settings, ...settings };
  logAction(db, user, `Updated settings`);
  writeDB(db);
  res.json({ ok: true, settings: db.settings });
});
