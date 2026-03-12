# Larry Repository

This repo is now organized as a clear two-surface layout:

- `frontend/`: Next.js web app (current product UI + legacy lightweight routes)
- `backend/`: Dedicated Fastify backend for enterprise AI-agent workflows

## Root Commands

- `npm run frontend:dev`
- `npm run frontend:build`
- `npm run frontend:start`
- `npm run frontend:lint`
- `npm run backend:dev`
- `npm run backend:build`
- `npm run backend:test`
- `npm run backend:migrate`

## Environment Files

- Frontend envs: `frontend/.env.local` (and optionally `frontend/.env.production`)
- Backend env: `backend/.env` (copy from `backend/.env.example`)
- Do not put secrets in the root `.env`.
