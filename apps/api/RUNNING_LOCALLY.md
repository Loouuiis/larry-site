# Running Larry Locally

Docker Compose in this repo is infrastructure-only for local development:
- `postgres`
- `redis`
- `codex-proxy`

Run `web`, `api`, and `worker` directly from the monorepo in separate terminals.

## Every time you reboot

### Step 1 — Start Docker (Postgres + Redis)

```bash
cd /Users/philip/Documents/Larry-Project/Github/larry-simple && docker compose up -d
```

You'll see `larry-postgres Running` and `larry-redis Running`.

---

### Step 2 — Start the three servers (three separate terminal tabs)

**Terminal 1 — API (Fastify backend on port 8080):**
```bash
cd /Users/philip/Documents/Larry-Project/Github/larry-simple && npm run api:dev
```
Wait until you see: `Server listening at http://127.0.0.1:8080`

**Terminal 2 — Worker (BullMQ background jobs):**
```bash
cd /Users/philip/Documents/Larry-Project/Github/larry-simple && npm run worker:dev
```

**Terminal 3 — Web (Next.js frontend on port 3000):**
```bash
cd /Users/philip/Documents/Larry-Project/Github/larry-simple && npm run web:dev
```

---

### Step 3 — Open the app

Go to **http://localhost:3000** and click the **Dev Login** button.

---

## First time only (already done — don't repeat)

These only need to run once after a fresh clone or if you wipe the database:

```bash
# Build the internal packages
cd /Users/philip/Documents/Larry-Project/Github/larry-simple && npm run api:build

# Run migrations and seed demo data
cd /Users/philip/Documents/Larry-Project/Github/larry-simple/packages/db && npm run migrate && npm run seed
```

---

## Troubleshooting

**Need a sample Timeline 2 / Task Center 2 plan in local dev**
Use the explicit dev-only seed endpoint instead of automatic placeholder seeding:
```bash
curl -X POST http://127.0.0.1:8080/v1/timeline2/projects/<project-id>/dev-seed-sample \
  -H "Authorization: Bearer <access-token>"
```

**`permission denied` on docker commands**
If Docker requires elevated access on your machine, fix Docker permissions rather than changing repo scripts. To fix permanently, log out and back in after running:
```bash
sudo groupadd docker && sudo usermod -aG docker $USER
```

**`relation "users" does not exist`** in API logs
The database is empty. Run migrations:
```bash
cd /Users/philip/Documents/Larry-Project/Github/larry-simple/packages/db && npm run migrate && npm run seed
```

**`Cannot find module '@larry/ai/dist/index.js'`** in worker/API
The internal packages need building:
```bash
cd /Users/philip/Documents/Larry-Project/Github/larry-simple && npm run api:build
```

**Chat says "fetch failed"**
The API server (Terminal 1) isn't running. Start it and wait for the `listening` message.

---

## Demo accounts

| Field    | Value                                      |
|----------|--------------------------------------------|
| Email    | dev@larry.local                            |
| Password | DevPass123!                                |
| Tenant   | 11111111-1111-4111-8111-111111111111       |

Or just use the **Dev Login** bypass button on the login page.
