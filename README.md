# MediVanta

Smarter Hospitals. Seamless Care.

This repository contains the first implementation milestone for a full-stack healthcare and hospital management platform built for the DevFusion 4.O hackathon.

## Scope of this milestone

- Public landing page with a polished HealthTech SaaS visual system
- Reusable frontend design system and responsive dashboard foundation
- Theme toggle with persistent light and dark mode
- Express + TypeScript backend foundation
- `GET /api/health` health endpoint

Not included yet: authentication, database integration, appointments, EMR, lab, pharmacy, billing, telemedicine, AI modules, or production business APIs.

## Tech stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS
- Backend: Node.js, Express, TypeScript

## Project structure

```text
MediVanta/
  frontend/  # Next.js application
  backend/   # Express API
```

## Environment setup

Copy the example files if you want to customize defaults:

```powershell
Copy-Item frontend/.env.example frontend/.env.local
Copy-Item backend/.env.example backend/.env
```

## Install dependencies

```powershell
npm.cmd install
```

## Run the applications

Run both frontend and backend together:

```powershell
npm.cmd run dev
```

Or run them separately:

```powershell
npm.cmd run dev:frontend
npm.cmd run dev:backend
```

## Local URLs

- Frontend: `http://localhost:3000`
- Dashboard demo: `http://localhost:3000/dashboard`
- Backend: `http://localhost:4000`
- Health endpoint: `http://localhost:4000/api/health`

## Quality checks

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
```
