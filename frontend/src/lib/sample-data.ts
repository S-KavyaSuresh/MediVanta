import {
  Activity,
  Ambulance,
  Building2,
  CalendarClock,
  ClipboardList,
  HeartHandshake,
  HeartPulse,
  PhoneCall,
  ShieldCheck,
  Stethoscope,
  TestTubeDiagonal,
  Users,
} from "lucide-react";

export const publicNavItems = [
  { label: "Home", href: "/" },
  { label: "Services", href: "/services" },
  { label: "Doctors", href: "/doctors" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
  { label: "Emergency", href: "/emergency" },
];

export const homeHighlights = [
  {
    title: "For patients and families",
    description:
      "Make care journeys easier to follow with clear service information, emergency guidance, and coordinated hospital communication.",
  },
  {
    title: "For clinicians and staff",
    description:
      "Support smooth handoffs across reception, wards, diagnostics, and care teams during busy hospital operations.",
  },
  {
    title: "For hospital operations",
    description:
      "Bring visibility to queues, activity, and service readiness through one calm operational experience.",
  },
];

export const services = [
  {
    title: "Outpatient coordination",
    description:
      "Help patients move through registration, consultation, follow-up, and service guidance with less confusion.",
    icon: CalendarClock,
  },
  {
    title: "Inpatient operations visibility",
    description:
      "Give hospital teams a cleaner view of activity across departments, wards, and day-to-day service flow.",
    icon: Building2,
  },
  {
    title: "Diagnostics support",
    description:
      "Organize information touchpoints around tests, reports, and care-team communication in a more connected way.",
    icon: TestTubeDiagonal,
  },
  {
    title: "Care-team collaboration",
    description:
      "Create a shared working environment for doctors, nursing staff, reception teams, and hospital administrators.",
    icon: HeartHandshake,
  },
];

export const serviceDetails = [
  {
    name: "Emergency and urgent care support",
    summary:
      "Designed to keep important service information, contacts, and operational context accessible during high-pressure moments.",
    bullets: [
      "Emergency access and support routing",
      "High-visibility contact information",
      "Operational readiness updates for hospital teams",
    ],
    icon: Ambulance,
  },
  {
    name: "Specialty clinic coordination",
    summary:
      "Present doctors, clinic services, and patient guidance in a way that feels trustworthy and easy to navigate.",
    bullets: [
      "Doctor discovery and specialty pages",
      "Patient-friendly clinic information",
      "Clear next-step guidance for families",
    ],
    icon: Stethoscope,
  },
  {
    name: "Hospital service communication",
    summary:
      "Keep departments, support desks, and patient communication aligned through a consistent digital front door.",
    bullets: [
      "Centralized service presentation",
      "Department-aware operational messaging",
      "Clear service pathways across hospital touchpoints",
    ],
    icon: ClipboardList,
  },
];

export const clinicians = [
  {
    name: "Dr. Anaya Sharma",
    specialty: "Internal Medicine",
    department: "General Practice",
    availability: "Consulting today",
    experience: "12 years clinical experience",
    focus: "Chronic care planning and adult medicine",
  },
  {
    name: "Dr. Rohan Mehta",
    specialty: "Emergency Medicine",
    department: "Critical Response",
    availability: "On emergency rotation",
    experience: "10 years acute care leadership",
    focus: "Rapid triage and emergency stabilization",
  },
  {
    name: "Dr. Meera Iqbal",
    specialty: "Pediatrics",
    department: "Family Care",
    availability: "Follow-up clinic open",
    experience: "9 years pediatric practice",
    focus: "Child wellness and family-centered care",
  },
  {
    name: "Dr. Vivek Menon",
    specialty: "Cardiology",
    department: "Heart Centre",
    availability: "Next clinic session tomorrow",
    experience: "14 years cardiac care",
    focus: "Preventive cardiology and recovery planning",
  },
];

export const patientJourney = [
  {
    title: "Find the right service quickly",
    description:
      "Patients and families can understand departments, care options, and contact channels without digging through cluttered information.",
  },
  {
    title: "Reach doctors and staff with confidence",
    description:
      "Doctor pages and hospital information are presented in a reassuring, professional way that supports informed visits.",
  },
  {
    title: "Stay connected during care delivery",
    description:
      "MediVanta is designed to grow into a connected care experience spanning appointments, records, reporting, and hospital coordination.",
  },
];

export const testimonials = [
  {
    quote:
      "Finding the right department and service information is much easier when hospital guidance is presented this clearly.",
    author: "Patient services perspective",
  },
  {
    quote:
      "A calmer hospital information experience can reduce confusion for families while still supporting day-to-day operational teams.",
    author: "Hospital operations perspective",
  },
];

export const faqs = [
  {
    question: "Does MediVanta provide medical diagnosis?",
    answer:
      "No. MediVanta supports hospital communication and operations. It does not diagnose medical conditions or replace clinical judgment.",
  },
  {
    question: "Who is MediVanta designed for?",
    answer:
      "It is designed for patients, families, doctors, and hospital staff who need a clearer digital experience around hospital services and care coordination.",
  },
  {
    question: "Are the doctors and hospital details on this site real?",
    answer:
      "Doctor listings and hospital details shown here are illustrative directory content and may vary by hospital configuration.",
  },
];

export const emergencyNumbers = [
  {
    label: "Hospital emergency desk",
    value: "Not configured",
    note: "Add your hospital's verified emergency number before publishing.",
  },
  {
    label: "Ambulance coordination",
    value: "Not configured",
    note: "Use a confirmed local ambulance contact when available.",
  },
  {
    label: "Nurse triage line",
    value: "Not configured",
    note: "Hospital support numbers should be confirmed by your organization.",
  },
];

export const aboutMetrics = [
  { label: "Departments represented", value: "12" },
  { label: "Clinician profiles prepared", value: "40+" },
  { label: "Emergency support coverage", value: "24/7" },
];

export const dashboardStats = [
  {
    label: "Today's appointments",
    value: "186",
    delta: "16 arrivals in the next hour",
    icon: CalendarClock,
  },
  {
    label: "Queue in progress",
    value: "42",
    delta: "Across OPD, imaging, and laboratory",
    icon: Activity,
  },
  {
    label: "Doctors on duty",
    value: "28",
    delta: "Including emergency coverage",
    icon: Stethoscope,
  },
  {
    label: "Patient support lines",
    value: "9",
    delta: "All monitored this morning",
    icon: PhoneCall,
  },
];

export const dashboardQueueRows = [
  {
    id: "OPD-1024",
    patient: "Aarav Verma",
    department: "Cardiology",
    status: "Waiting",
    updatedAt: "2 min ago",
  },
  {
    id: "LAB-2208",
    patient: "Sana Khan",
    department: "Laboratory",
    status: "In progress",
    updatedAt: "8 min ago",
  },
  {
    id: "RAD-4102",
    patient: "Maya Joseph",
    department: "Imaging",
    status: "Completed",
    updatedAt: "11 min ago",
  },
];

export const dashboardNotifications = [
  {
    title: "Emergency desk call volume is elevated",
    description:
      "Front-desk teams have been notified to keep triage support visible for incoming families.",
    tone: "warning" as const,
  },
  {
    title: "Radiology queue has normalized",
    description:
      "Average waiting time has improved after the early-morning rush.",
    tone: "success" as const,
  },
  {
    title: "Pediatrics follow-up clinic opens at 14:00",
    description:
      "Registration and nursing teams can begin preparing check-in support.",
    tone: "info" as const,
  },
];

export const dashboardActivity = [
  "Admissions desk cleared 18 pending check-ins in the last 30 minutes.",
  "Emergency support team redirected one ambulance arrival to priority intake.",
  "Laboratory reports for the morning batch are ready for clinician review.",
];

export const dashboardCoordination = [
  "Cardiology consultations are tracking on schedule for the morning session.",
  "Family support desk is coordinating arrival guidance for two inpatient visitors.",
  "Radiology and laboratory teams have cleared the early backlog.",
];

export const dashboardNav = [
  { label: "Overview", href: "/dashboard", active: true },
  { label: "MediVanta Home", href: "/", active: false },
];

export const aboutValues = [
  {
    title: "Clarity in care communication",
    description:
      "Important information should feel easy to find and easy to trust, especially for patients and families under stress.",
    icon: HeartPulse,
  },
  {
    title: "Operational calm",
    description:
      "Hospital software should reduce friction for care teams rather than adding noise to already busy workflows.",
    icon: ShieldCheck,
  },
  {
    title: "Connected teams",
    description:
      "Reception, doctors, diagnostics, nursing teams, and administrators work best when the digital experience supports shared context.",
    icon: Users,
  },
];
