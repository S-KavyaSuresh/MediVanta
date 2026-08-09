# MediVanta

MediVanta is a healthcare SaaS platform for hospitals and clinics. It combines a public-facing care portal with authenticated role-based workspaces for hospital operations, patient access, and clinical coordination.

## Current scope

- Public pages for Home, Services, Doctors, About, Contact, and Emergency
- Authenticated dashboard access for patients, doctors, reception, laboratory staff, pharmacists, and administrators
- Shared operational data for one seeded fictional organization
- Appointment scheduling, editing, cancellation, check-in, and queue synchronization
- Patient self-registration
- Local password reset flow for development and evaluation
- Light and dark mode with responsive layouts

## Seeded organization

The local development dataset is associated with one fictional organization:

- `MediVanta General Hospital`
- Organization ID: `org-medivanta-general`

This organization relationship is attached to seeded users, departments, doctors, appointments, and queue records so future multi-hospital support can be added without rewriting the core data model.

## Project structure

```text
MediVanta/
  frontend/  # Next.js application
  backend/   # Express API and local data store
```

## Environment setup

Copy the example environment files if you want to customize local defaults:

```powershell
Copy-Item frontend/.env.example frontend/.env.local
Copy-Item backend/.env.example backend/.env
```

Default local endpoints:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:4000`

## Install dependencies

```powershell
npm.cmd install
```

## Seed local demo data

MediVanta includes reproducible local evaluation accounts and sample hospital data.

```powershell
npm.cmd run seed --workspace backend
```

## Start MediVanta

Run frontend and backend together:

```powershell
npm.cmd run dev
```

Or run them separately:

```powershell
npm.cmd run dev:frontend
npm.cmd run dev:backend
```

## Demo Accounts

| Role | Email | Password | Landing Workspace |
| --- | --- | --- | --- |
| Patient | `patient@medivanta.demo` | `Medi2026!Care` | `/dashboard/patient` |
| Doctor | `doctor@medivanta.demo` | `Medi2026!Care` | `/dashboard/doctor` |
| Receptionist | `receptionist@medivanta.demo` | `Medi2026!Care` | `/dashboard/reception` |
| Laboratory Staff | `lab@medivanta.demo` | `Medi2026!Care` | `/dashboard/laboratory` |
| Pharmacist | `pharmacist@medivanta.demo` | `Medi2026!Care` | `/dashboard/pharmacy` |
| Administrator | `admin@medivanta.demo` | `Medi2026!Care` | `/dashboard/admin` |

These credentials are seeded demonstration accounts intended only for local evaluation and testing. They must not be used in production.

## Account model

- Patients can create their own account from the public `Create Account` flow.
- Staff accounts are administrator-provisioned and represented by the seeded staff/demo users in the local dataset.
- Public MediVanta pages remain accessible without signing in.
- Protected dashboard routes redirect unauthenticated users to `/login`.

## Password reset

The local development password reset flow is zero-cost and does not send real email.

- Request a reset from `/forgot-password`
- Development reset token and OTP are returned only for local evaluation
- Reset details are short-lived and invalidated after password change

This structure is intended to be replaceable later with a real delivery provider without changing reset logic.

## Role destinations

- Patient: `/dashboard/patient`
- Doctor: `/dashboard/doctor`
- Receptionist: `/dashboard/reception`
- Laboratory Staff: `/dashboard/laboratory`
- Pharmacist: `/dashboard/pharmacy`
- Administrator: `/dashboard/admin`

## Validation commands

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
```
