import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const ENGINE_API_KEY = process.env.ENGINE_API_KEY || '';
const PORT = process.env.PORT || 3000;

const snapshots = [];
const pendingCommands = [];
const completedCommands = [];

app.use((req, res, next) => {
  if (req.path === '/health') return next();
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!ENGINE_API_KEY || token !== ENGINE_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', snapshots: snapshots.length, pending: pendingCommands.length, completed: completedCommands.length, uptime: process.uptime() });
});

app.all('/', async (req, res) => {
  const { type } = req.body || {};
  if (req.method === 'GET') {
    return res.json({ commands: pendingCommands.slice(0, 20), pending_count: pendingCommands.length });
  }
  if (req.method === 'POST') {
    if (type === 'snapshot') {
      snapshots.push({ timestamp: req.body.timestamp || new Date().toISOString(), data: req.body.data || {} });
      if (snapshots.length > 10) snapshots.shift();
      return res.json({ ok: true, received: true, snapshot_count: snapshots.length });
    }
    if (type === 'ack') {
      const { command_ids = [], results = [] } = req.body;
      for (const id of command_ids) {
        const idx = pendingCommands.findIndex(c => c.id === id);
        if (idx !== -1) {
          const cmd = pendingCommands.splice(idx, 1)[0];
          const result = results.find(r => r.id === id) || {};
          completedCommands.push({ ...cmd, result: result.result || '', ok: result.ok, completed_at: new Date().toISOString() });
        }
      }
      return res.json({ ok: true, acked: command_ids.length });
    }
    if (req.body.action || req.body.entity || req.body.function) {
      const cmd = { id: req.body.id || crypto.randomUUID(), action: req.body.action || 'read', entity: req.body.entity || req.body.function || '', payload: req.body.payload || req.body.data || {}, created_at: new Date().toISOString() };
      pendingCommands.push(cmd);
      return res.json({ ok: true, queued: true, command_id: cmd.id });
    }
  }
  return res.status(400).json({ error: 'Unknown request format' });
});

app.post('/commands', (req, res) => {
  const cmd = { id: req.body.id || crypto.randomUUID(), action: req.body.action || 'read', entity: req.body.entity || '', payload: req.body.payload || {}, created_at: new Date().toISOString() };
  pendingCommands.push(cmd);
  res.json({ ok: true, command_id: cmd.id });
});

app.get('/snapshot', (req, res) => {
  if (snapshots.length === 0) return res.json({ error: 'No snapshots yet' });
  res.json(snapshots[snapshots.length - 1]);
});

app.listen(PORT, () => console.log('CloudBrowser Engine on port ' + PORT));
