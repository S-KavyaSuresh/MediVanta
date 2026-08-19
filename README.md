# 🏥 MediVanta

### Smart Healthcare & Hospital Management Platform

**MediVanta** is a full-stack healthcare management platform designed to connect patients, doctors, receptionists, laboratory staff, pharmacists, and hospital administrators through a unified digital ecosystem.

Instead of managing appointments, clinical records, laboratory workflows, prescriptions, pharmacy inventory, billing, emergency queues, and hospital operations as isolated systems, MediVanta brings them together through **role-based workflows and a shared PostgreSQL-backed hospital data layer**.

> **From appointment to consultation, diagnostics, medication, billing, follow-up, and emergency care — one connected hospital platform.**

### 🌐 Live Application

**Frontend:** https://medi-vanta-frontend.vercel.app

**Backend API:** https://medivanta.onrender.com

---

## 🎯 Problem Statement

Hospitals often depend on disconnected systems for appointments, patient records, laboratory requests, prescriptions, pharmacy inventory, billing, and administrative operations.

This creates several problems:

- Patient information becomes fragmented across departments.
- Doctors may lack immediate clinical context during consultations.
- Emergency patients may not be prioritized efficiently.
- Laboratory, pharmacy, and billing workflows require repeated manual coordination.
- Patients have limited visibility into their healthcare journey.
- Hospital administrators lack a unified operational view.
- Delays between departments can negatively affect both patients and staff.

MediVanta addresses this by providing a **single role-aware hospital management platform** where clinical and operational workflows remain connected.

---

# ✨ Key Features

## 👤 Patient Care

Patients can manage their healthcare journey from a dedicated workspace.

Features include:

- Secure patient authentication
- Patient profile management
- Appointment booking
- Appointment rescheduling and cancellation
- In-person and online consultation modes
- Family member/dependent management
- Dependent-aware appointment booking
- Laboratory request tracking
- Medical record access
- Prescription viewing
- Printable prescriptions
- Billing and invoice management
- Payment recording
- Notifications
- Healthcare journey information
- Telemedicine session access
- Follow-up information

---

## 🩺 Doctor Workspace

Doctors receive a dedicated clinical workspace designed around their daily workflow.

Features include:

- Today's appointment overview
- Next-patient information
- Patient queue
- Start and complete consultation workflow
- Patient clinical information
- Clinical handoff summary
- Medical record creation
- Structured digital prescriptions
- Medicine selection from hospital inventory
- Dosage, frequency and duration management
- Automatic medicine quantity calculation
- Prescription follow-up dates
- Recent prescription management
- Prescription editing within the permitted period
- Dedicated medical record and prescription history
- Pagination, filtering and sorting
- Printable prescriptions
- Telemedicine consultation context

### Doctor Operational Status

Doctors can maintain their current operational status:

- **Available**
- **In Consultation**
- **On Break**
- **Off Duty**

Consultation workflows can automatically update doctor availability while respecting deliberate manual status changes.

---

## 🏢 Reception & Front Desk

Reception staff can coordinate hospital operations without gaining unnecessary clinical privileges.

Features include:

- Appointment oversight
- Patient check-in
- Appointment status management
- Queue coordination
- Patient lookup
- Billing access
- Manual payment recording
- Invoice inspection
- Notifications
- Role-scoped hospital search

---

## 🧪 Laboratory Management

Laboratory staff have a dedicated workspace for diagnostic workflows.

Features include:

- Laboratory request management
- Request status tracking
- Lab report workflow
- Patient/request context
- Laboratory notifications
- Integration with patient and doctor workflows
- Automatic billing linkage for laboratory services

---

## 💊 Pharmacy & Inventory Management

MediVanta connects doctor prescriptions directly with hospital pharmacy inventory.

Features include:

- Persistent medicine inventory
- Medicine catalog
- Batch-level stock management
- Generic medicine information
- Manufacturer details
- Unit pricing
- Expiry-date tracking
- Reorder levels
- Low-stock identification
- Near-expiry identification
- Expired-stock protection
- Prescription dispensing
- Prevention of double dispensing
- Automatic inventory deduction

### FEFO Stock Handling

Medication dispensing follows **First Expiry, First Out (FEFO)** logic.

The system:

1. Identifies the prescribed medicine.
2. Calculates the required quantity.
3. Finds valid non-expired inventory batches.
4. Uses the earliest-expiring eligible batch first.
5. Verifies sufficient stock before deduction.
6. Prevents inventory from becoming negative.
7. Updates prescription status after successful dispensing.

---

## 💳 Billing & Payments

Billing is integrated with clinical activity rather than operating as an isolated module.

MediVanta supports:

- Itemized invoices
- Consultation billing
- Laboratory billing
- Medicine billing
- Source-linked invoices
- Duplicate billing prevention
- Paid and due amount tracking
- Payment status
- Patient-side payment recording
- Reception/Admin payment recording
- Payment method/reference tracking
- Printable invoices

Clinical events can therefore generate their corresponding financial records automatically.

---

# 🚨 Smart Emergency Operations

MediVanta includes an emergency workflow designed to prioritize urgent cases within normal hospital operations.

Features include:

- Emergency patient intake
- Emergency priority assignment
- Priority queue integration
- Doctor assignment
- Doctor availability awareness
- Queue status management
- Emergency operational oversight

Queue ordering prioritizes:

1. Active **Emergency** cases
2. Active **Priority** cases
3. Other active patients
4. Completed entries

Completed cases are prevented from appearing above patients who are still waiting for care.

---

## Emergency Workflow

![MediVanta Emergency Workflow](docs/diagrams/emergency-workflow.png)

---

# 🧠 Clinical Handoff

MediVanta provides doctors with a consolidated clinical handoff view.

Instead of requiring doctors to manually inspect several disconnected screens, the system derives relevant context from existing clinical information.

Depending on available records, the handoff can include:

- Patient/dependent context
- Reason for visit
- Known allergies
- Existing/chronic conditions
- Blood group
- Latest diagnosis
- Recent laboratory information
- Active prescription information
- Pending laboratory requests
- Visit status
- Follow-up information

The handoff uses existing hospital records as its source rather than requiring duplicate manual entry.

---

# 👨‍👩‍👧 Family & Dependent Care

A patient account can manage healthcare activities for family members or dependents.

Family-member information can be associated with:

- Appointments
- Laboratory requests
- Medical records
- Prescriptions
- Consultation context

This allows a parent, guardian, or family member to manage care without incorrectly mixing the dependent's clinical information with the primary patient's records.

---

# 💻 Telemedicine

MediVanta supports online consultation workflows for eligible appointments.

The system provides:

- Online/In-Person consultation selection
- Appointment-scoped consultation sessions
- Patient consultation access
- Doctor consultation access
- Appointment context
- Dependent context where applicable
- Time-controlled consultation joining

The consultation action becomes available only around the appropriate appointment window instead of allowing unrestricted early access.

---

# 🔎 Role-Aware Global Search

MediVanta provides scoped search based on the authenticated user's role.

Searchable information can include appropriate combinations of:

- Doctors
- Departments
- Patients
- Appointments
- Staff
- Invoices
- Medicines
- Inventory information

Search results open contextual detail views rather than unnecessarily redirecting users to entire management pages.

Access remains restricted by role.

For example:

- Administrators can search broader organizational information.
- Receptionists receive front-desk-relevant results.
- Doctors receive clinically appropriate results.
- Pharmacists can search medicines and inventory information.
- Patients remain restricted to safe patient-facing information.

---

# 📊 Hospital Administration & Analytics

Administrators receive operational oversight across MediVanta.

Capabilities include:

- Staff/account management
- Account activation/deactivation
- Appointment oversight
- Billing oversight
- Hospital operational views
- Emergency operations
- Queue monitoring
- Hospital reports
- Role-scoped search
- Session visibility
- Audit-oriented operational records

Administrative reporting provides hospital activity views across supported reporting periods.

---

# 🔔 Notification System

MediVanta contains persistent user-specific notifications.

Notifications can be generated for events such as:

- Appointment creation
- Appointment status changes
- Laboratory request creation
- Laboratory status changes
- Lab report readiness
- Prescription issuance
- Prescription dispensing
- Invoice generation
- Payment recording
- Pharmacy low-stock conditions

Users can view unread notifications and mark individual or all notifications as read.

---

# 🛡️ Security & Access Control

Healthcare applications require strict separation between user roles.

MediVanta therefore applies authorization at both the **frontend workflow level and backend API level**.

Implemented security concepts include:

- Authentication
- Protected dashboard routes
- Role-Based Access Control (RBAC)
- Capability-based backend authorization
- Organization-scoped data
- User-scoped notifications
- Patient-owned clinical information
- Protected pharmacy operations
- Protected billing operations
- Session management
- Account activation/deactivation
- Audit logging for sensitive operational actions
- Secure password handling

Examples:

- Patients cannot access another patient's billing information.
- Pharmacists manage inventory and dispensing.
- Doctors access appropriate clinical workflows.
- Receptionists perform front-desk operations without unrestricted clinical privileges.
- Administrators receive organizational oversight without bypassing established access controls.

---

# 🏗️ System Architecture

MediVanta uses a full-stack client-server architecture with centralized PostgreSQL persistence.

![MediVanta System Architecture](docs/diagrams/system-architecture.png)

At a high level:

```text
                    ┌──────────────────────┐
                    │      MediVanta       │
                    │     Next.js UI       │
                    └──────────┬───────────┘
                               │
                               │ REST API
                               ▼
                    ┌──────────────────────┐
                    │   Express Backend    │
                    │ Authentication/RBAC  │
                    │ Business Services    │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │     PostgreSQL       │
                    │        Neon          │
                    └──────────────────────┘
```

The backend acts as the source of truth for clinical and operational workflows while frontend workspaces expose only role-appropriate functionality.

---

# 🔄 Integrated Clinical Workflow

MediVanta connects multiple hospital departments into a continuous workflow.

![MediVanta Clinical Workflow](docs/diagrams/clinical-workflow.png)

A typical flow can include:

```text
Patient
   ↓
Appointment
   ↓
Check-In
   ↓
Queue
   ↓
Doctor Consultation
   ↓
Medical Record
   ↓
 ┌─────────────────────┐
 │                     │
 ▼                     ▼
Lab Request        Prescription
 │                     │
 ▼                     ▼
Laboratory           Pharmacy
 │                     │
 ▼                     ▼
Lab Report        Dispensing
 │                     │
 └──────────┬──────────┘
            ▼
          Billing
            ↓
        Follow-Up
```

---

# 🧭 Patient Healthcare Journey

The patient journey connects hospital interactions instead of treating each department as an isolated service.

![MediVanta Patient Healthcare Journey](docs/diagrams/patient-healthcare-journey.png)

The journey may include:

**Appointment → Check-In → Queue → Consultation → Diagnostics/Prescription → Pharmacy → Billing → Follow-Up**

This foundation can also support QR-assisted hospital navigation and journey retrieval in future iterations.

---

# 👥 Role-Based Workspaces

| Role | Primary Responsibilities |
|---|---|
| 👤 Patient | Appointments, dependents, records, prescriptions, labs, billing, notifications |
| 🩺 Doctor | Consultations, patients, clinical records, prescriptions, history, handoff |
| 🏢 Receptionist | Check-in, appointments, queue coordination, billing |
| 🧪 Laboratory Staff | Lab requests, processing and reports |
| 💊 Pharmacist | Inventory, medicine batches, dispensing and stock monitoring |
| 🛡️ Administrator | Staff, operations, reports, billing oversight and emergency management |

---

# 🛠️ Technology Stack

### Frontend

- Next.js
- React
- TypeScript
- Responsive component-based UI
- Lucide icons
- Light/Dark theme support

### Backend

- Node.js
- Express
- TypeScript
- REST APIs
- Role/capability-based authorization

### Database

- PostgreSQL
- Neon PostgreSQL
- SQL migrations
- Persistent relational hospital data

### Deployment

- **Frontend:** Vercel
- **Backend:** Render
- **Database:** Neon PostgreSQL
- **Version Control:** Git & GitHub

---

# 🗄️ Data & Persistence

MediVanta uses PostgreSQL as its persistent source of truth.

The data model covers areas such as:

- Organizations
- Users
- Sessions
- Departments
- Doctors
- Patients
- Family members
- Appointments
- Queue entries
- Medical records
- Laboratory tests and requests
- Prescriptions
- Prescription medicines
- Medicine catalog
- Inventory batches
- Invoices
- Invoice items
- Payments
- Notifications
- Emergency/priority information
- Patient journey information

Database changes are managed using versioned SQL migrations.

# 🗃️ Entity Relationship Diagram

MediVanta uses a relational PostgreSQL schema to connect hospital operations while preserving clear ownership and relationships between clinical, operational, and financial records.

The database connects core entities including users, patients, doctors, family members, appointments, medical records, prescriptions, laboratory workflows, medicine inventory, billing, notifications, sessions, and audit records.

![MediVanta ER Diagram](docs/diagrams/er-diagram.png)

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
│   ├── src/
│   │   ├── auth/
│   │   ├── domain/
│   │   ├── middleware/
│   │   ├── repositories/
│   │   ├── routes/
│   │   ├── services/
│   │   └── scripts/
│   ├── migrations/
│   └── package.json
│
├── docs/
│   ├── diagrams/
│   ├── screenshots/
|   └── demo/
│
└── README.md
```

---

# 🚀 Getting Started

## 1. Clone the Repository

```bash
git clone https://github.com/S-KavyaSuresh/MediVanta.git
cd MediVanta
```

---

## 2. Install Dependencies

From the project root:

```bash
npm install
```

---

## 3. Configure Environment Variables

Create the frontend and backend environment files from the provided examples.

### Backend

```env
PORT=4000
CLIENT_ORIGIN=http://localhost:3000
DATABASE_URL=your_postgresql_connection_string
SESSION_SECRET=your_secure_session_secret
```

Never commit production credentials or secrets to Git.

---

## 4. Run Database Migrations

```bash
npm run db:migrate --workspace backend
```

---

## 5. Seed Development Data

When a fresh development database requires demonstration data:

```bash
npm run seed --workspace backend
```

---

## 6. Start MediVanta

Run the frontend and backend together:

```bash
npm run dev
```

Default development endpoints:

```text
Frontend: http://localhost:3000
Backend:  http://localhost:4000
```

---

# 🎥 Demo Video

Watch the MediVanta end-to-end demonstration covering patient, doctor, reception, laboratory, pharmacy, emergency, and administrative workflows.

▶️ **[Watch the MediVanta Demo Video](DEMO_VIDEO_URL)**

The demonstration highlights:

- Patient appointment and care journey
- Doctor consultation and clinical workflows
- Medical records and digital prescriptions
- Laboratory request/report lifecycle
- Pharmacy dispensing and inventory management
- Billing and payments
- Emergency priority workflow
- Doctor assignment and availability
- Hospital analytics and administration

---

# 🔐 Demo / Test Accounts

MediVanta includes dedicated demonstration accounts for each supported hospital role so the complete role-based workflow can be evaluated.

> **Password for all demo accounts:** `Medi2026!Care`

| Role | Email | Password | Workspace |
|---|---|---|---|
| 👤 Patient | `patient@medivanta.demo` | `Medi2026!Care` | `/dashboard/patient` |
| 🩺 Doctor | `doctor@medivanta.demo` | `Medi2026!Care` | `/dashboard/doctor` |
| 🏢 Receptionist | `receptionist@medivanta.demo` | `Medi2026!Care` | `/dashboard/reception` |
| 🧪 Laboratory Staff | `lab@medivanta.demo` | `Medi2026!Care` | `/dashboard/laboratory` |
| 💊 Pharmacist | `pharmacist@medivanta.demo` | `Medi2026!Care` | `/dashboard/pharmacy` |
| 🛡️ Administrator | `admin@medivanta.demo` | `Medi2026!Care` | `/dashboard/admin` |

These accounts are seeded demonstration credentials intended exclusively for project evaluation and testing. They must not be reused for real healthcare deployments.

---

# 📸 Application Preview

Final product screenshots are maintained under:

```text
docs/screenshots/
```

Recommended showcase screens include:

- Patient Dashboard
- Doctor Dashboard
- Clinical Handoff
- Emergency Priority Queue
- Pharmacy Inventory
- Laboratory Dashboard
- Billing
- Admin Analytics

Screenshots can be added here after the final deployed build is verified.

---

# ✅ Validation

The project can be validated using:

```bash
npm run lint
npm run typecheck
npm run build
```

Database migrations:

```bash
npm run db:migrate --workspace backend
```

Core workflows have also been manually tested across the major role-based workspaces.

---

# 🌐 Deployment Architecture

```text
User Browser
     │
     ▼
┌───────────────┐
│    Vercel     │
│ Next.js App   │
└───────┬───────┘
        │ HTTPS
        ▼
┌───────────────┐
│    Render     │
│ Express API   │
└───────┬───────┘
        │ TLS
        ▼
┌───────────────┐
│     Neon      │
│  PostgreSQL   │
└───────────────┘
```

### Production URLs

🌐 **MediVanta:**  
https://medi-vanta-frontend.vercel.app

⚙️ **MediVanta API:**  
https://medivanta.onrender.com

---

# 💡 What Makes MediVanta Different?

MediVanta is designed as more than a collection of hospital CRUD pages.

Its workflows are interconnected.

For example:

```text
Doctor issues prescription
        ↓
Structured medicine information
        ↓
Pharmacy receives prescription
        ↓
Inventory availability verified
        ↓
FEFO stock deduction
        ↓
Prescription marked dispensed
        ↓
Medicine invoice generated
        ↓
Patient notification updated
```

Similarly:

```text
Emergency Intake
       ↓
Priority Classification
       ↓
Priority Queue
       ↓
Doctor Availability
       ↓
Doctor Assignment
       ↓
Consultation
       ↓
Clinical Handoff / Patient Journey
```

This workflow-oriented architecture allows MediVanta to model how different parts of a hospital interact rather than treating each department as an independent application.

---

# 🔮 Future Enhancements

Potential future extensions include:

- Scannable QR-based patient journey access
- Advanced hospital bottleneck detection
- AI-assisted appointment slot optimization
- Real payment gateway integration
- Extended pharmacy procurement and supplier management
- Advanced inventory forecasting
- Expanded EMR capabilities
- Real-time telemedicine media/signaling
- Multi-hospital SaaS tenancy
- Advanced hospital analytics and forecasting
- Native mobile applications

---

# ⚠️ Disclaimer

MediVanta is currently an academic/hackathon healthcare software project.

It demonstrates healthcare workflow management and hospital information-system concepts. It is **not intended for real clinical deployment without additional regulatory, privacy, security, reliability, and medical-system validation**.

---

# 🏥 MediVanta

### Connected Care. Smarter Operations. Better Healthcare.

Built to demonstrate how patients, clinicians, diagnostics, pharmacy, billing, emergency care, and hospital administration can operate through one connected digital platform.
