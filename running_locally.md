# Running Larry Locally

All commands below assume you're in the repo root.

## Every time you reboot

### Step 1 — Start Docker (Postgres + Redis)

```bash
docker compose up -d
```

> You'll see `larry-postgres Running` and `larry-redis Running`.

---

### Step 2 — Start the three servers (three separate terminal tabs)

**Terminal 1 — API (Fastify backend on port 8080):**
```bash
npm run api:dev
```
Wait until you see: `Server listening at http://127.0.0.1:8080`

> Note: `api:dev` automatically builds all internal packages, runs migrations, and seeds the database.

**Terminal 2 — Worker (BullMQ background jobs):**
```bash
npm run worker:dev
```

**Terminal 3 — Web (Next.js frontend on port 3000):**
```bash
npm run web:dev
```

---

### Step 3 — Open the app

Go to **http://localhost:3000** and click the **Dev Login** button.

---

## First time only (already done — don't repeat)

These only need to run once after a fresh clone or if you wipe the database. `api:dev` handles all of this automatically, but if you need to run them manually:

```bash
# Build the internal packages
npm run api:build

# Run migrations and seed demo data
npm run db:migrate && npm run db:seed

# Or nuke and recreate the database entirely
npm run db:reset
```

---

## Troubleshooting

**`permission denied` on docker commands (Linux/macOS)**
Run with `sudo` prefix, e.g. `sudo docker compose up -d`. To fix permanently, log out and back in after running:
```bash
sudo groupadd docker && sudo usermod -aG docker $USER
```

**`relation "users" does not exist`** in API logs
The database is empty. Run migrations:
```bash
npm run db:migrate && npm run db:seed
```

**`Cannot find module '@larry/ai/dist/index.js'`** in worker/API
The internal packages need building:
```bash
npm run api:build
```

**Chat says "fetch failed"**
The API server (Terminal 1) isn't running. Start it and wait for the `listening` message.

**Port already in use**
Find and kill the process using the port:
```bash
# Linux/macOS
lsof -i :8080 | grep LISTEN
# Windows
netstat -ano | findstr :8080
```

---

## Demo accounts

| Field    | Value                                      |
|----------|--------------------------------------------|
| Email    | `dev@larry.local`                          |
| Password | `DevPass123!`                              |
| Tenant   | `11111111-1111-4111-8111-111111111111`     |

Additional seeded accounts: `sarah@larry.local`, `marcus@larry.local` (same password).

Or just use the **Dev Login** bypass button on the login page.
