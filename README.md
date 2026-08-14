# 🏥 MediVanta

### Smart Healthcare & Hospital Management Platform

**MediVanta** is a full-stack healthcare SaaS platform designed to digitize and connect the complete hospital workflow across patients, doctors, receptionists, laboratory staff, pharmacists, and administrators.

Instead of managing appointments, medical records, laboratory requests, prescriptions, pharmacy inventory, billing, queues, and hospital operations through disconnected systems, MediVanta brings them together into one secure role-based platform.

> **From appointment to consultation, laboratory, pharmacy, billing, and follow-up — one connected healthcare workflow.**

---

## 🔗 Project Links

| Resource | Link |
|---|---|
| 🌐 Live Application | **Frontend deployment URL will be added after Vercel deployment** |
| ⚙️ Backend API | https://medivanta.onrender.com |
| 💻 GitHub Repository | https://github.com/S-KavyaSuresh/MediVanta |

---

# 🎯 Problem

Hospitals frequently depend on fragmented tools for:

- patient registration
- appointment scheduling
- queue management
- medical records
- prescriptions
- laboratory processing
- pharmacy inventory
- billing
- notifications
- administrative reporting

This fragmentation creates longer waiting times, duplicated work, poor communication between departments, inaccurate operational visibility, and a difficult patient experience.

MediVanta solves this by providing a **single role-aware healthcare platform** where every hospital workflow operates on connected data.

---

# 💡 Our Solution

MediVanta provides dedicated workspaces for every major hospital stakeholder while maintaining a shared operational data layer.

The system connects:

**Patient → Reception → Doctor → Laboratory → Pharmacy → Billing → Administration**

Every role receives only the data and operations relevant to them through secure role-based access control.

---

# ✨ Key Features

### 👤 Patient Care

- Patient registration and secure authentication
- Structured patient profiles
- Family member / dependent management
- Doctor discovery
- Appointment booking
- Appointment reason capture
- Online / In-Person consultation selection
- Appointment rescheduling and cancellation
- Queue and appointment status visibility
- Medical-history access
- Prescription history
- Lab requests and reports
- Billing and payment tracking
- Notifications
- Patient healthcare journey
- Telemedicine consultation foundation

### 🩺 Doctor Workspace

- Today's consultation workflow
- Assigned patient management
- Appointment and queue management
- Doctor operational availability
- Medical record creation
- Controlled medical-record editing window
- Structured prescription creation
- Prescription editing before dispensing
- Medicine catalog selection
- Dosage, frequency and duration handling
- Follow-up date
- Prescription history
- Printable prescriptions
- Clinical handoff summary
- Patient clinical context
- Online consultation support

### 🏢 Reception Desk

- Patient registration
- Appointment creation and editing
- Rescheduling
- Check-in
- Cancellation
- Waiting queue management
- Priority patient handling
- Billing access
- Patient/doctor operational search

### 🧪 Laboratory

- Lab request management
- Processing-status workflow
- Result/report handling
- Patient report access
- Laboratory notifications
- Operational laboratory overview

### 💊 Pharmacy & Inventory

- Prescription verification
- Medicine catalog
- Inventory batch management
- Expiry-date tracking
- Low-stock detection
- Near-expiry / expired medicine handling
- FEFO batch selection
- Prescription dispensing
- Automatic stock deduction
- Medicine billing
- Pharmacy notifications

### 💳 Billing & Payments

- Consultation invoices
- Laboratory invoices
- Pharmacy invoices
- Itemized billing
- Paid / due tracking
- Persisted payment records
- Reception/Admin payment recording
- Patient payment workflow
- Printable invoices
- Source-linked invoices to prevent duplication

### 📊 Administration

- Hospital operational dashboard
- User and staff management
- Department management
- Appointment oversight
- Billing oversight
- Inventory visibility
- System settings
- Audit logs
- Account activation/deactivation
- Operational analytics
- Appointment trends
- Revenue statistics
- Laboratory statistics
- Pharmacy statistics
- Department-level insights

---

# 🚨 Smart Emergency Workflow

MediVanta includes an emergency-care workflow designed to prioritize urgent patients without disrupting the normal hospital queue.

Emergency functionality includes:

- Emergency intake
- Emergency priority classification
- Priority queue integration
- Emergency patients ranked ahead of normal queue entries
- Doctor assignment
- Doctor availability awareness
- Clinical handoff context
- Patient journey tracking
- Audit logging

Doctor operational states currently support:

**Available · In Consultation · On Break · Off Duty**

This allows hospital operations to avoid assigning unavailable doctors during emergency handling.

---

# 🧠 Clinical Handoff

MediVanta provides a structured clinical handoff view to help doctors quickly understand the latest available patient context.

The handoff is derived from existing hospital data rather than being maintained as a duplicate medical record.

It can surface available information such as:

- patient / family-member context
- appointment reason
- allergies
- chronic conditions
- blood group
- latest diagnosis
- recent laboratory context
- recent prescriptions
- pending laboratory work
- visit status
- follow-up information

Missing clinical information is clearly represented instead of being fabricated.

---

# 👨‍👩‍👧 Family & Dependent Care

A patient account can manage linked family members.

Family-aware workflows preserve the actual person receiving care across:

- appointments
- laboratory requests
- prescriptions
- medical records
- billing context
- healthcare journey

Clinical information belonging to a dependent is kept distinct from the primary account holder.

---

# 🔎 Role-Aware Global Search

MediVanta includes entity-aware search with permissions determined by the authenticated role.

Search supports relevant entities such as:

- Patients
- Doctors
- Departments
- Appointments
- Medicines
- Bills
- Records

Search results open focused detail views instead of redirecting users into unrelated role workspaces.

Sensitive information remains protected through backend authorization.

---

# 📅 Appointment & Queue Intelligence

Appointment workflows include:

- Department and doctor selection
- Doctor availability
- Date and time selection
- Appointment reason
- Online / In-Person mode
- Rescheduling
- Cancellation
- Check-in
- Consultation progression
- Queue synchronization
- Priority handling
- No Show status

A **No Show** represents an appointment that passed without the patient checking in or attending.

---

# 💊 Structured Prescription & FEFO Dispensing

Prescriptions use structured medicine information rather than relying only on free-text instructions.

The workflow supports:

**Medicine → Strength → Dose → Frequency → Duration → Quantity → Instructions**

During dispensing, MediVanta verifies available, non-expired stock and consumes inventory using:

### FEFO — First Expiry, First Out

This reduces wastage and prevents expired inventory from being dispensed.

---

# 🧪 Integrated Laboratory Workflow

Doctor / Authorized Request  
→ Laboratory Queue  
→ Processing  
→ Result / Report  
→ Patient & Doctor Access  
→ Billing  
→ Notification

Laboratory information remains linked to the same patient and hospital workflow rather than existing as an isolated report system.

---

# 🔐 Security

MediVanta applies security at multiple layers.

Key protections include:

- Password hashing
- Role-Based Access Control (RBAC)
- Protected routes
- JWT-based authentication architecture
- Refresh/session management
- HttpOnly authentication cookies
- Email verification
- Password reset workflow
- Active-session management
- Input validation
- Secure file validation
- Rate limiting
- Origin / CSRF protections where applicable
- XSS-safe React rendering
- Organization-scoped data access
- Persistent audit logging
- Environment-based secret management

Sensitive hospital operations are enforced on the backend rather than relying only on hidden frontend controls.

---

# 🏗️ System Architecture

MediVanta follows a layered full-stack architecture:

**Users → Next.js Frontend → Express REST API → Service Layer → PostgreSQL Repository → Neon PostgreSQL**

![MediVanta System Architecture](docs/diagrams/system-architecture.png)

The architecture separates:

- presentation
- authentication
- authorization
- business workflows
- persistence
- role-specific data access

This makes the platform easier to extend toward multi-hospital deployments.

---

# 🔄 Integrated Clinical Workflow

The platform connects Doctor, Laboratory, Pharmacy, Patient and supporting hospital systems through a centralized backend.

![MediVanta Integrated Clinical Workflow](docs/diagrams/clinical-workflow.png)

Major supporting services include:

- PostgreSQL persistence
- RBAC
- Audit logging
- Notifications
- Billing
- Inventory management

---

# 👤 Patient Healthcare Journey

![MediVanta Patient Healthcare Journey](docs/diagrams/patient-healthcare-journey.png)

The patient journey connects registration, appointment booking, queue management, consultation, laboratory/pharmacy operations, billing and follow-up.

---

# 🚨 Emergency Workflow

![MediVanta Emergency Workflow](docs/diagrams/emergency-workflow.png)

Emergency patients are integrated into the existing hospital workflow rather than managed through a disconnected emergency module.

---

# 🛠️ Technology Stack

## Frontend

| Technology | Purpose |
|---|---|
| **Next.js 16** | Frontend framework and routing |
| **React 19** | Component-based user interface |
| **TypeScript 5.9** | Type-safe development |
| **Tailwind CSS 4** | Responsive styling |
| **Lucide React** | Professional application icons |
| **next-themes** | Light/Dark theme handling |
| **Class Variance Authority** | Component variant management |

## Backend

| Technology | Purpose |
|---|---|
| **Node.js** | Backend runtime |
| **Express 5** | REST API |
| **TypeScript 5.9** | Type-safe backend development |
| **Zod 4** | Input validation |
| **Helmet** | HTTP security headers |
| **CORS** | Origin control |
| **node-postgres (`pg`)** | PostgreSQL connectivity |
| **dotenv** | Environment configuration |

## Database & Infrastructure

| Technology | Purpose |
|---|---|
| **PostgreSQL** | Relational persistence |
| **Neon PostgreSQL** | Cloud-hosted database |
| **Render** | Backend deployment |
| **Vercel** | Frontend deployment |

---

# 🗄️ Database Architecture

MediVanta uses PostgreSQL for persistent transactional healthcare data.

Major data domains include:

- Organizations
- Users
- Sessions
- Patients
- Family Members
- Doctors
- Departments
- Appointments
- Queue Entries
- Medical Records
- Prescriptions
- Prescription Medicines
- Laboratory Tests
- Laboratory Requests
- Laboratory Reports
- Medicine Catalog
- Inventory Batches
- Invoices
- Invoice Items
- Payments
- Notifications
- Audit Logs
- Settings
- Emergency / Journey information

Database changes are versioned using sequential SQL migrations.

---

# 📁 Project Structure

```text
MediVanta/
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   └── lib/
│   └── package.json
│
├── backend/
│   ├── migrations/
│   ├── src/
│   │   ├── auth/
│   │   ├── config/
│   │   ├── domain/
│   │   ├── middleware/
│   │   ├── repositories/
│   │   ├── routes/
│   │   ├── services/
│   │   └── scripts/
│   └── package.json
│
├── docs/
│   ├── diagrams/
│   │   ├── system-architecture.png
│   │   ├── clinical-workflow.png
│   │   ├── patient-healthcare-journey.png
│   │   └── emergency-workflow.png
│   │
│   └── screenshots/
│
├── README.md
└── package.json
