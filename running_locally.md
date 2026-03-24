# Running Locally

## First time setup

```bash
docker compose up -d    # start Postgres + Redis
npm install             # install dependencies (if not done)
npm run db:setup        # migrate schema + seed demo data
```

## Start the app (3 terminals)

```bash
npm run api:dev      # terminal 1 — auto-runs db:setup then starts Fastify on :8080
npm run worker:dev   # terminal 2 — BullMQ worker
npm run web:dev      # terminal 3 — Next.js on :3000
```

`api:dev` runs migrate + seed automatically every time it starts, so data is always there.

## Log in

Go to http://localhost:3000 and click the **dev bypass** button.

## Data keeps disappearing / password auth failure

This means the Docker volume was wiped or initialized with the wrong password. Full reset:

```bash
npm run db:reset
```

That command does: `docker compose down -v && docker compose up -d && db:migrate && db:seed`. Wipes everything and rebuilds from scratch.

## Seed credentials

- Email: `dev@larry.local`
- Password: `DevPass123!`
- Tenant: `11111111-1111-4111-8111-111111111111`

## Verify the stack manually

```bash
# API health
curl http://localhost:8080/health

# Login + list projects
TOKEN=$(curl -s -X POST http://localhost:8080/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@larry.local","password":"DevPass123!","tenantId":"11111111-1111-4111-8111-111111111111"}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).accessToken))")

curl -s http://localhost:8080/v1/projects -H "Authorization: Bearer $TOKEN"
# Returns 2 projects: Q2 Product Launch + Customer Onboarding Redesign
```
