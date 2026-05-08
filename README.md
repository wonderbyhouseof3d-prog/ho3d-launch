# HO3D Launch Command Centre

## Option A — Host Online (Recommended — 5 minutes)

### Deploy to Railway (Easiest)

Railway gives you a live URL like `ho3d-launch.up.railway.app`.

**Step 1 — Create free accounts**
- GitHub: github.com
- Railway: railway.app (free tier — $5/month credit, plenty for this)

**Step 2 — Put code on GitHub**
1. github.com → New Repository → Name: `ho3d-launch` → Create
2. Download GitHub Desktop: desktop.github.com
3. Clone repo → copy all files from this folder into it → Commit → Push

**Step 3 — Deploy on Railway**
1. railway.app → New Project → Deploy from GitHub
2. Select `ho3d-launch` repo → Railway deploys in ~2 minutes
3. Settings → Domains → Generate Domain → copy your URL
4. Share URL with team — everyone opens it, selects their name, starts working

**Step 4 — Persistent data storage**
1. In Railway project → Add Service → Volume
2. Mount path: `/data`
3. Variables tab → Add: `DATA_PATH` = `/data/data.json`
4. Redeploy (one click)

Done. Data persists forever. Team accesses from any device, anywhere.

---

### Deploy to Render (Alternative)

1. render.com → New Web Service → Connect GitHub repo
2. Build: `npm install` | Start: `node server.js`
3. Add Disk → mount `/data` → env var `DATA_PATH=/data/data.json`

---

## Option B — Run Locally (WiFi only)

```bash
npm install
node server.js
```
Your device: http://localhost:3847
Team on same WiFi: http://[IP in terminal]:3847

---

## Admin Access
Log in as **Aditya** to see the Admin Panel.
