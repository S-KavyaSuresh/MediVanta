import { clinicians } from "@/lib/sample-data";

export const HOSPITAL_STORAGE_KEY = "medivanta-hospital-state";
export const DEMO_REFERENCE_DATE = "2026-08-09";

export function getCurrentLocalDateIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getCurrentLocalTimeValue(now = new Date()) {
  return now.getHours() * 60 + now.getMinutes();
}

function getSlotTimeValue(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function isCapacityConsumingAppointment(status: AppointmentStatus) {
  return status !== "Cancelled";
}

function isCapacityConsumingLabRequest(status: LabRequestStatus) {
  return status !== "Completed";
}

export function getSessionForTime(state: HospitalState, time: string) {
  return (
    state.bookingCapacity.sessions.find(
      (session) =>
        getSlotTimeValue(time) >= getSlotTimeValue(session.startTime) &&
        getSlotTimeValue(time) <= getSlotTimeValue(session.endTime),
    ) ?? null
  );
}

export function getDoctorSlotBookingCount(
  state: HospitalState,
  doctorId: string,
  appointmentDate: string,
  appointmentTime: string,
  excludeAppointmentId?: string,
) {
  return state.appointments.filter((appointment) => {
    if (excludeAppointmentId && appointment.id === excludeAppointmentId) {
      return false;
    }

    return (
      appointment.doctorId === doctorId &&
      appointment.appointmentDate === appointmentDate &&
      appointment.appointmentTime === appointmentTime &&
      isCapacityConsumingAppointment(appointment.status)
    );
  }).length;
}

export function getDoctorSessionBookingCount(
  state: HospitalState,
  doctorId: string,
  appointmentDate: string,
  appointmentTime: string,
  excludeAppointmentId?: string,
) {
  const session = getSessionForTime(state, appointmentTime);

  if (!session) {
    return 0;
  }

  return state.appointments.filter((appointment) => {
    if (excludeAppointmentId && appointment.id === excludeAppointmentId) {
      return false;
    }

    return (
      appointment.doctorId === doctorId &&
      appointment.appointmentDate === appointmentDate &&
      isCapacityConsumingAppointment(appointment.status) &&
      appointment.appointmentTime >= session.startTime &&
      appointment.appointmentTime <= session.endTime
    );
  }).length;
}

export function isDoctorSlotFullyBooked(
  state: HospitalState,
  doctorId: string,
  appointmentDate: string,
  appointmentTime: string,
  excludeAppointmentId?: string,
) {
  return (
    getDoctorSlotBookingCount(
      state,
      doctorId,
      appointmentDate,
      appointmentTime,
      excludeAppointmentId,
    ) >= state.bookingCapacity.doctorSlotCapacity
  );
}

export function isDoctorSessionFullyBooked(
  state: HospitalState,
  doctorId: string,
  appointmentDate: string,
  appointmentTime: string,
  excludeAppointmentId?: string,
) {
  const session = getSessionForTime(state, appointmentTime);

  if (!session) {
    return false;
  }

  return (
    getDoctorSessionBookingCount(
      state,
      doctorId,
      appointmentDate,
      appointmentTime,
      excludeAppointmentId,
    ) >= session.maxAppointments
  );
}

export function getDoctorCapacityStatus(
  state: HospitalState,
  doctorId: string,
  appointmentDate: string,
  appointmentTime: string,
  excludeAppointmentId?: string,
) {
  const session = getSessionForTime(state, appointmentTime);
  const slotBookings = getDoctorSlotBookingCount(
    state,
    doctorId,
    appointmentDate,
    appointmentTime,
    excludeAppointmentId,
  );
  const sessionBookings = getDoctorSessionBookingCount(
    state,
    doctorId,
    appointmentDate,
    appointmentTime,
    excludeAppointmentId,
  );

  if (
    slotBookings >= state.bookingCapacity.doctorSlotCapacity ||
    (session && sessionBookings >= session.maxAppointments)
  ) {
    return {
      label: "Full",
      detail: session
        ? `${session.label} ${sessionBookings}/${session.maxAppointments}`
        : `${slotBookings}/${state.bookingCapacity.doctorSlotCapacity}`,
    };
  }

  if (session && sessionBookings >= Math.max(1, session.maxAppointments - 1)) {
    return {
      label: "Filling",
      detail: `${session.label} ${sessionBookings}/${session.maxAppointments}`,
    };
  }

  return {
    label: "Available",
    detail: session
      ? `${session.label} ${sessionBookings}/${session.maxAppointments}`
      : `${slotBookings}/${state.bookingCapacity.doctorSlotCapacity}`,
    };
}

export function getLabSlotBookingCount(
  state: HospitalState,
  requestedDate: string,
  requestedTime: string,
) {
  return state.labRequests.filter(
    (request) =>
      request.requestedDate === requestedDate &&
      request.requestedTime === requestedTime &&
      isCapacityConsumingLabRequest(request.status),
  ).length;
}

export function isLabSlotFullyBooked(
  state: HospitalState,
  requestedDate: string,
  requestedTime: string,
) {
  return (
    getLabSlotBookingCount(state, requestedDate, requestedTime) >=
    state.bookingCapacity.labSlotCapacity
  );
}

export function getLabSlotCapacityStatus(
  state: HospitalState,
  requestedDate: string,
  requestedTime: string,
) {
  const bookings = getLabSlotBookingCount(state, requestedDate, requestedTime);
  const capacity = state.bookingCapacity.labSlotCapacity;

  if (bookings >= capacity) {
    return { label: "Full", detail: `${bookings} / ${capacity}` };
  }

  if (bookings >= Math.max(1, capacity - 1)) {
    return { label: "Filling", detail: `${bookings} / ${capacity}` };
  }

  return { label: "Available", detail: `${bookings} / ${capacity}` };
}

export function isPastLocalTimeSlot(date: string, time: string, now = new Date()) {
  const currentDate = getCurrentLocalDateIso();

  if (date < currentDate) {
    return true;
  }

  if (date > currentDate) {
    return false;
  }

  return getSlotTimeValue(time) <= getCurrentLocalTimeValue(now);
}

export type DepartmentStatus =
  | "Operational"
  | "Busy"
  | "Limited"
  | "Emergency priority";

export type DoctorStatus =
  | "Available"
  | "Consulting"
  | "On break"
  | "Off duty"
  | "Emergency duty";

export type AppointmentStatus =
  | "Scheduled"
  | "Checked in"
  | "In consultation"
  | "Completed"
  | "Cancelled";

export type QueueStatus = "Waiting" | "Called" | "In consultation" | "Completed";

export type LabRequestStatus =
  | "Requested"
  | "Scheduled"
  | "Sample Collected"
  | "Processing"
  | "Completed";

export type PrescriptionStatus = "Issued" | "Dispensed";

export type DepartmentRecord = {
  id: string;
  code: string;
  name: string;
  description: string;
  status: DepartmentStatus;
  location: string;
};

export type DoctorRecord = {
  id: string;
  name: string;
  specialization: string;
  departmentId: string;
  status: DoctorStatus;
  availability: string;
  shiftLabel: string;
};

export type AppointmentRecord = {
  id: string;
  patientId?: string;
  patientName: string;
  doctorId: string;
  departmentId: string;
  appointmentDate: string;
  appointmentTime: string;
  reasonForAppointment: string;
  status: AppointmentStatus;
};

export type QueueEntryRecord = {
  id: string;
  patientName: string;
  departmentId: string;
  doctorId?: string;
  appointmentId?: string;
  status: QueueStatus;
  createdAt: string;
  updatedAt: string;
};

export type LabTestRecord = {
  id: string;
  organizationId?: string;
  name: string;
};

export type LabRequestRecord = {
  id: string;
  patientId?: string;
  hospitalId?: string;
  organizationId?: string;
  patientName: string;
  testId: string;
  testName: string;
  departmentId: string;
  requestedDate: string;
  requestedTime: string;
  status: LabRequestStatus;
  createdAt?: string;
};

export type LabReportAttachmentRecord = {
  fileName: string;
  contentType: "application/pdf";
  fileSize: number;
  contentBase64?: string;
};

export type LabReportRecord = {
  id: string;
  labRequestId: string;
  patientId: string;
  hospitalId: string;
  organizationId: string;
  testName: string;
  reportTitle: string;
  resultSummary: string;
  uploadedAt: string;
  uploadedBy: {
    id: string;
    name: string;
  };
  attachment?: LabReportAttachmentRecord;
};

export type MedicalRecordRecord = {
  id: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  appointmentId?: string;
  hospitalId: string;
  organizationId: string;
  visitDate: string;
  diagnosis: string;
  clinicalNotes: string;
  treatmentAdvice: string;
  createdAt: string;
  updatedAt?: string;
};

export type PrescriptionMedicineRecord = {
  medicineName: string;
  dosage: string;
  frequency: string;
  duration: string;
};

export type PrescriptionRecord = {
  id: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  hospitalId: string;
  organizationId: string;
  appointmentId?: string;
  medicines: PrescriptionMedicineRecord[];
  instructions: string;
  status: PrescriptionStatus;
  createdAt: string;
  dispensedAt?: string;
  dispensedBy?: {
    id: string;
    name: string;
  };
};

export type BookingSessionCapacityRecord = {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  maxAppointments: number;
};

export type BookingCapacityRecord = {
  doctorSlotCapacity: number;
  defaultMaxAppointmentsPerSession: number;
  labSlotCapacity: number;
  sessions: BookingSessionCapacityRecord[];
};

export type AppointmentSlotLoadRecord = {
  doctorId: string;
  appointmentDate: string;
  appointmentTime: string;
  bookings: number;
};

export type LabSlotLoadRecord = {
  requestedDate: string;
  requestedTime: string;
  bookings: number;
};

export type HospitalState = {
  organization: {
    id: string;
    name: string;
    slug: string;
    address?: string;
    city?: string;
    state?: string;
    contactPhone?: string;
    contactEmail?: string;
    emergencyContact?: string;
    operatingHours?: string;
    timezone?: string;
    defaultLanguage?: string;
    emergencyServicesEnabled?: boolean;
    defaultConsultationSlotDurationMinutes?: number;
  };
  departments: DepartmentRecord[];
  doctors: DoctorRecord[];
  appointments: AppointmentRecord[];
  queueEntries: QueueEntryRecord[];
  medicalRecords: MedicalRecordRecord[];
  prescriptions: PrescriptionRecord[];
  labTests: LabTestRecord[];
  labRequests: LabRequestRecord[];
  labReports: LabReportRecord[];
  bookingCapacity: BookingCapacityRecord;
  configuredSupportLines: number;
};

export type AppointmentDraft = {
  patientName: string;
  doctorId: string;
  appointmentDate: string;
  appointmentTime: string;
  reasonForAppointment: string;
};

export type LabRequestDraft = {
  testId: string;
  requestedDate: string;
  requestedTime: string;
};

export type LabReportDraft = {
  reportTitle: string;
  resultSummary: string;
  attachment?: LabReportAttachmentRecord;
};

export type MedicalRecordDraft = {
  patientId: string;
  appointmentId?: string;
  visitDate: string;
  diagnosis: string;
  clinicalNotes: string;
  treatmentAdvice: string;
};

export type PrescriptionMedicineDraft = {
  medicineName: string;
  dosage: string;
  frequency: string;
  duration: string;
};

export type PrescriptionDraft = {
  patientId: string;
  appointmentId?: string;
  medicines: PrescriptionMedicineDraft[];
  instructions: string;
};

export type HospitalSettingsDraft = {
  hospitalName: string;
  address: string;
  city: string;
  state: string;
  contactPhone: string;
  contactEmail: string;
  emergencyContact: string;
  operatingHours: string;
  timezone: string;
  defaultLanguage: string;
  emergencyServicesEnabled: boolean;
  defaultConsultationSlotDurationMinutes: number;
  defaultDoctorSlotCapacity: number;
  morningSessionCapacity: number;
  afternoonSessionCapacity: number;
  eveningSessionCapacity: number;
  defaultLabSlotCapacity: number;
};

export type SearchGroup = {
  title: string;
  items: Array<{
    id: string;
    heading: string;
    details: string;
    href: string;
  }>;
};

const departmentsSeed: DepartmentRecord[] = [
  {
    id: "dept-general-medicine",
    code: "GM",
    name: "General Medicine",
    description: "Adult consultations, follow-up care, and chronic care planning.",
    status: "Operational",
    location: "North Wing, Level 2",
  },
  {
    id: "dept-cardiology",
    code: "CARD",
    name: "Cardiology",
    description: "Heart health consultations, diagnostics, and recovery planning.",
    status: "Busy",
    location: "Heart Centre, Level 3",
  },
  {
    id: "dept-pediatrics",
    code: "PED",
    name: "Pediatrics",
    description: "Child wellness, family care, and pediatric follow-up visits.",
    status: "Operational",
    location: "Family Care Block, Level 1",
  },
  {
    id: "dept-orthopedics",
    code: "ORTHO",
    name: "Orthopedics",
    description: "Musculoskeletal care, fracture review, and post-procedure follow-up.",
    status: "Operational",
    location: "Surgical Wing, Level 2",
  },
  {
    id: "dept-neurology",
    code: "NEURO",
    name: "Neurology",
    description: "Neurology consultations, symptom review, and specialist assessment.",
    status: "Limited",
    location: "Specialty Clinic, Level 4",
  },
  {
    id: "dept-dermatology",
    code: "DERM",
    name: "Dermatology",
    description: "Skin health consultations and follow-up care.",
    status: "Operational",
    location: "Outpatient Wing, Level 2",
  },
  {
    id: "dept-ent",
    code: "ENT",
    name: "ENT",
    description: "Ear, nose, and throat specialist services.",
    status: "Operational",
    location: "Specialty Clinic, Level 3",
  },
  {
    id: "dept-ophthalmology",
    code: "OPH",
    name: "Ophthalmology",
    description: "Eye examinations, specialist consultations, and follow-up visits.",
    status: "Operational",
    location: "Vision Centre, Level 2",
  },
  {
    id: "dept-radiology",
    code: "RAD",
    name: "Radiology",
    description: "Imaging coordination, scanning workflow, and report preparation.",
    status: "Busy",
    location: "Diagnostics Block, Ground Floor",
  },
  {
    id: "dept-laboratory",
    code: "LAB",
    name: "Laboratory",
    description: "Sample collection, test processing, and results support.",
    status: "Operational",
    location: "Diagnostics Block, Ground Floor",
  },
  {
    id: "dept-emergency",
    code: "ER",
    name: "Emergency",
    description: "Urgent assessment, acute care intake, and emergency support.",
    status: "Emergency priority",
    location: "Emergency Entrance, Ground Floor",
  },
];

const doctorsSeed: DoctorRecord[] = [
  {
    id: "doc-anaya-sharma",
    name: clinicians[0].name,
    specialization: clinicians[0].specialty,
    departmentId: "dept-general-medicine",
    status: "Consulting",
    availability: clinicians[0].availability,
    shiftLabel: "08:00 - 14:00",
  },
  {
    id: "doc-rohan-mehta",
    name: clinicians[1].name,
    specialization: clinicians[1].specialty,
    departmentId: "dept-emergency",
    status: "Emergency duty",
    availability: clinicians[1].availability,
    shiftLabel: "07:00 - 19:00",
  },
  {
    id: "doc-meera-iqbal",
    name: clinicians[2].name,
    specialization: clinicians[2].specialty,
    departmentId: "dept-pediatrics",
    status: "Available",
    availability: clinicians[2].availability,
    shiftLabel: "10:00 - 18:00",
  },
  {
    id: "doc-vivek-menon",
    name: clinicians[3].name,
    specialization: clinicians[3].specialty,
    departmentId: "dept-cardiology",
    status: "Available",
    availability: clinicians[3].availability,
    shiftLabel: "09:00 - 17:00",
  },
  {
    id: "doc-neha-sen",
    name: "Dr. Neha Sen",
    specialization: "Radiology",
    departmentId: "dept-radiology",
    status: "Consulting",
    availability: "Imaging sessions in progress",
    shiftLabel: "08:00 - 16:00",
  },
  {
    id: "doc-kiran-iyer",
    name: "Dr. Kiran Iyer",
    specialization: "Orthopedics",
    departmentId: "dept-orthopedics",
    status: "On break",
    availability: "Returns at 13:00",
    shiftLabel: "08:00 - 16:00",
  },
  {
    id: "doc-sana-reddy",
    name: "Dr. Sana Reddy",
    specialization: "Dermatology",
    departmentId: "dept-dermatology",
    status: "Off duty",
    availability: "Next clinic tomorrow",
    shiftLabel: "Off duty today",
  },
  {
    id: "doc-arjun-roy",
    name: "Dr. Arjun Roy",
    specialization: "Neurology",
    departmentId: "dept-neurology",
    status: "Available",
    availability: "Review clinic active",
    shiftLabel: "11:00 - 19:00",
  },
];

const appointmentsSeed: AppointmentRecord[] = [
  {
    id: "APT-2001",
    patientName: "Aarav Verma",
    doctorId: "doc-vivek-menon",
    departmentId: "dept-cardiology",
    appointmentDate: DEMO_REFERENCE_DATE,
    appointmentTime: "09:30",
    reasonForAppointment: "Stable hypertension follow-up",
    status: "Checked in",
  },
  {
    id: "APT-2002",
    patientName: "Sana Khan",
    doctorId: "doc-neha-sen",
    departmentId: "dept-radiology",
    appointmentDate: DEMO_REFERENCE_DATE,
    appointmentTime: "10:00",
    reasonForAppointment: "Diagnostic imaging review",
    status: "In consultation",
  },
  {
    id: "APT-2003",
    patientName: "Maya Joseph",
    doctorId: "doc-anaya-sharma",
    departmentId: "dept-general-medicine",
    appointmentDate: DEMO_REFERENCE_DATE,
    appointmentTime: "10:45",
    reasonForAppointment: "General fever follow-up",
    status: "Completed",
  },
  {
    id: "APT-2004",
    patientId: "user-patient",
    patientName: "Ritesh Nair",
    doctorId: "doc-meera-iqbal",
    departmentId: "dept-pediatrics",
    appointmentDate: DEMO_REFERENCE_DATE,
    appointmentTime: "11:15",
    reasonForAppointment: "Persistent fever",
    status: "Scheduled",
  },
  {
    id: "APT-2005",
    patientName: "Ishita Das",
    doctorId: "doc-kiran-iyer",
    departmentId: "dept-orthopedics",
    appointmentDate: DEMO_REFERENCE_DATE,
    appointmentTime: "12:10",
    reasonForAppointment: "Knee pain review",
    status: "Scheduled",
  },
  {
    id: "APT-2006",
    patientName: "Kabir Patel",
    doctorId: "doc-arjun-roy",
    departmentId: "dept-neurology",
    appointmentDate: "2026-08-10",
    appointmentTime: "14:00",
    reasonForAppointment: "Headache and dizziness",
    status: "Scheduled",
  },
];

const queueSeed: QueueEntryRecord[] = [
  {
    id: "Q-3101",
    patientName: "Aarav Verma",
    departmentId: "dept-cardiology",
    doctorId: "doc-vivek-menon",
    appointmentId: "APT-2001",
    status: "Waiting",
    createdAt: "09:18",
    updatedAt: "09:18",
  },
  {
    id: "Q-3102",
    patientName: "Sana Khan",
    departmentId: "dept-radiology",
    doctorId: "doc-neha-sen",
    appointmentId: "APT-2002",
    status: "In consultation",
    createdAt: "09:48",
    updatedAt: "10:06",
  },
  {
    id: "Q-3103",
    patientName: "Maya Joseph",
    departmentId: "dept-general-medicine",
    doctorId: "doc-anaya-sharma",
    appointmentId: "APT-2003",
    status: "Completed",
    createdAt: "10:11",
    updatedAt: "10:42",
  },
];

const medicalRecordsSeed: MedicalRecordRecord[] = [
  {
    id: "MR-1001",
    patientId: "user-patient",
    patientName: "Ritesh Nair",
    doctorId: "doc-meera-iqbal",
    doctorName: "Dr. Meera Iqbal",
    hospitalId: "org-medivanta-general",
    organizationId: "org-medivanta-general",
    visitDate: "2026-08-05",
    diagnosis: "Seasonal viral fever",
    clinicalNotes:
      "Low-grade fever with fatigue for three days. No respiratory distress observed during review.",
    treatmentAdvice:
      "Continue hydration, paracetamol as advised, and review again if fever persists beyond 48 hours.",
    createdAt: "2026-08-05T11:40:00.000Z",
  },
  {
    id: "MR-1002",
    patientId: "external:aarav-verma",
    patientName: "Aarav Verma",
    doctorId: "doc-vivek-menon",
    doctorName: "Dr. Vivek Menon",
    appointmentId: "APT-2001",
    hospitalId: "org-medivanta-general",
    organizationId: "org-medivanta-general",
    visitDate: DEMO_REFERENCE_DATE,
    diagnosis: "Stable hypertension follow-up",
    clinicalNotes:
      "Blood pressure remains controlled with current regimen. Continue low-sodium diet and exercise plan.",
    treatmentAdvice:
      "Maintain medication adherence and return for cardiology review in six weeks.",
    createdAt: `${DEMO_REFERENCE_DATE}T10:15:00.000Z`,
  },
];

const prescriptionsSeed: PrescriptionRecord[] = [
  {
    id: "RX-2001",
    patientId: "user-patient",
    patientName: "Ritesh Nair",
    doctorId: "doc-meera-iqbal",
    doctorName: "Dr. Meera Iqbal",
    hospitalId: "org-medivanta-general",
    organizationId: "org-medivanta-general",
    medicines: [
      {
        medicineName: "Paracetamol 500 mg",
        dosage: "1 tablet",
        frequency: "Three times daily",
        duration: "3 days",
      },
      {
        medicineName: "Oral rehydration salts",
        dosage: "1 sachet",
        frequency: "As needed",
        duration: "3 days",
      },
    ],
    instructions: "Take after meals and return if fever persists or new symptoms appear.",
    status: "Issued",
    createdAt: "2026-08-05T11:45:00.000Z",
  },
  {
    id: "RX-2002",
    patientId: "external:maya-joseph",
    patientName: "Maya Joseph",
    doctorId: "doc-anaya-sharma",
    doctorName: "Dr. Anaya Sharma",
    appointmentId: "APT-2003",
    hospitalId: "org-medivanta-general",
    organizationId: "org-medivanta-general",
    medicines: [
      {
        medicineName: "Vitamin D3 60,000 IU",
        dosage: "1 capsule",
        frequency: "Weekly",
        duration: "6 weeks",
      },
    ],
    instructions: "Take with food once every week for six weeks.",
    status: "Dispensed",
    createdAt: `${DEMO_REFERENCE_DATE}T10:50:00.000Z`,
    dispensedAt: `${DEMO_REFERENCE_DATE}T12:20:00.000Z`,
    dispensedBy: {
      id: "user-pharmacist",
      name: "Rahul Sethi",
    },
  },
];

const labTestsSeed: LabTestRecord[] = [
  { id: "lab-cbc", name: "Complete Blood Count (CBC)" },
  { id: "lab-glucose", name: "Blood Glucose" },
  { id: "lab-lipid", name: "Lipid Profile" },
  { id: "lab-thyroid", name: "Thyroid Profile" },
  { id: "lab-liver", name: "Liver Function Test" },
  { id: "lab-kidney", name: "Kidney Function Test" },
];

const labRequestsSeed: LabRequestRecord[] = [
  {
    id: "LABREQ-5001",
    patientName: "Ritesh Nair",
    testId: "lab-cbc",
    testName: "Complete Blood Count (CBC)",
    departmentId: "dept-laboratory",
    requestedDate: "2026-08-11",
    requestedTime: "09:00",
    status: "Scheduled",
  },
];

const labReportsSeed: LabReportRecord[] = [];
export const defaultBookingCapacity: BookingCapacityRecord = {
  doctorSlotCapacity: 1,
  defaultMaxAppointmentsPerSession: 6,
  labSlotCapacity: 5,
  sessions: [
    {
      id: "morning",
      label: "Morning",
      startTime: "08:00",
      endTime: "11:59",
      maxAppointments: 6,
    },
    {
      id: "afternoon",
      label: "Afternoon",
      startTime: "12:00",
      endTime: "15:59",
      maxAppointments: 6,
    },
    {
      id: "evening",
      label: "Evening",
      startTime: "16:00",
      endTime: "18:30",
      maxAppointments: 4,
    },
  ],
};

export function normalizeHospitalState(state: HospitalState): HospitalState {
  return {
    ...state,
    medicalRecords: state.medicalRecords ?? medicalRecordsSeed,
    prescriptions: state.prescriptions ?? prescriptionsSeed,
    bookingCapacity: state.bookingCapacity ?? defaultBookingCapacity,
  };
}

export function createInitialHospitalState(): HospitalState {
  return {
    organization: {
      id: "org-medivanta-general",
      name: "MediVanta General Hospital",
      slug: "medivanta-general",
    },
    departments: structuredClone(departmentsSeed),
    doctors: structuredClone(doctorsSeed),
    appointments: structuredClone(appointmentsSeed),
    queueEntries: structuredClone(queueSeed),
    medicalRecords: structuredClone(medicalRecordsSeed),
    prescriptions: structuredClone(prescriptionsSeed),
    labTests: structuredClone(labTestsSeed),
    labRequests: structuredClone(labRequestsSeed),
    labReports: structuredClone(labReportsSeed),
    bookingCapacity: structuredClone(defaultBookingCapacity),
    configuredSupportLines: 9,
  };
}

export function getDepartmentById(state: HospitalState, departmentId: string) {
  return state.departments.find((department) => department.id === departmentId);
}

export function getDoctorById(state: HospitalState, doctorId: string) {
  return state.doctors.find((doctor) => doctor.id === doctorId);
}

export function getAppointmentById(state: HospitalState, appointmentId: string) {
  return state.appointments.find((appointment) => appointment.id === appointmentId);
}

export function getDepartmentSummaries(state: HospitalState) {
  return state.departments.map((department) => {
    const doctors = state.doctors.filter((doctor) => doctor.departmentId === department.id);
    const activeQueueCount = state.queueEntries.filter(
      (entry) => entry.departmentId === department.id && entry.status !== "Completed",
    ).length;

    return {
      ...department,
      availableDoctorCount: doctors.filter((doctor) => doctor.status !== "Off duty").length,
      totalDoctorCount: doctors.length,
      activeQueueCount,
    };
  });
}

export function getActiveQueueEntries(state: HospitalState) {
  return state.queueEntries.filter((entry) => entry.status !== "Completed");
}

export function getDashboardMetrics(state: HospitalState) {
  const todaysAppointments = state.appointments.filter(
    (appointment) =>
      appointment.appointmentDate === getCurrentLocalDateIso() &&
      appointment.status !== "Cancelled",
  ).length;
  const activeQueueCount = getActiveQueueEntries(state).length;
  const doctorsOnDuty = state.doctors.filter((doctor) => doctor.status !== "Off duty").length;

  return {
    todaysAppointments,
    activeQueueCount,
    doctorsOnDuty,
    patientSupportLines: state.configuredSupportLines,
  };
}

export function getAllowedAppointmentStatuses(
  status: AppointmentStatus,
): AppointmentStatus[] {
  switch (status) {
    case "Scheduled":
      return ["Checked in", "Cancelled"];
    case "Checked in":
      return ["In consultation", "Completed", "Cancelled"];
    case "In consultation":
      return ["Completed"];
    default:
      return [];
  }
}

export function getAllowedQueueStatuses(status: QueueStatus): QueueStatus[] {
  switch (status) {
    case "Waiting":
      return ["Called"];
    case "Called":
      return ["In consultation"];
    case "In consultation":
      return ["Completed"];
    default:
      return [];
  }
}

export function validateAppointmentDraft(
  state: HospitalState,
  draft: AppointmentDraft,
  editingId?: string,
) {
  const errors: Partial<Record<keyof AppointmentDraft, string>> = {};
  const currentLocalDate = getCurrentLocalDateIso();

  if (draft.patientName.trim().length < 2) {
    errors.patientName = "Enter a patient name with at least 2 characters.";
  }

  const doctor = getDoctorById(state, draft.doctorId);
  if (!doctor) {
    errors.doctorId = "Select a valid doctor.";
  }

  if (!draft.appointmentDate) {
    errors.appointmentDate = "Select an appointment date.";
  } else if (draft.appointmentDate < currentLocalDate) {
    errors.appointmentDate = "Appointment date cannot be in the past.";
  }

  if (!draft.appointmentTime) {
    errors.appointmentTime = "Select an appointment time.";
  } else if (!/^\d{2}:\d{2}$/.test(draft.appointmentTime)) {
    errors.appointmentTime = "Select a valid appointment time.";
  } else if (draft.appointmentDate && isPastLocalTimeSlot(draft.appointmentDate, draft.appointmentTime)) {
    errors.appointmentTime = "Select a future appointment time.";
  }

  if (draft.reasonForAppointment.trim().length < 3) {
    errors.reasonForAppointment = "Please enter the reason for appointment.";
  } else if (draft.reasonForAppointment.trim().length > 280) {
    errors.reasonForAppointment = "Reason for appointment must be 280 characters or fewer.";
  }

  if (
    draft.doctorId &&
    draft.appointmentDate &&
    draft.appointmentTime &&
    isDoctorSlotFullyBooked(
      state,
      draft.doctorId,
      draft.appointmentDate,
      draft.appointmentTime,
      editingId,
    )
  ) {
    errors.appointmentTime = "This time slot is fully booked. Please choose another time.";
  } else if (
    draft.doctorId &&
    draft.appointmentDate &&
    draft.appointmentTime &&
    isDoctorSessionFullyBooked(
      state,
      draft.doctorId,
      draft.appointmentDate,
      draft.appointmentTime,
      editingId,
    )
  ) {
    errors.appointmentTime =
      "This doctor is fully booked for that session. Please choose another time.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateLabRequestDraft(
  state: HospitalState,
  draft: LabRequestDraft,
) {
  const errors: Partial<Record<keyof LabRequestDraft, string>> = {};
  const currentLocalDate = getCurrentLocalDateIso();

  if (!state.labTests.some((test) => test.id === draft.testId)) {
    errors.testId = "Select a valid lab test.";
  }

  if (!draft.requestedDate) {
    errors.requestedDate = "Select a preferred lab date.";
  } else if (draft.requestedDate < currentLocalDate) {
    errors.requestedDate = "Lab test date cannot be in the past.";
  }

  if (!draft.requestedTime) {
    errors.requestedTime = "Select a preferred lab time.";
  } else if (!/^\d{2}:\d{2}$/.test(draft.requestedTime)) {
    errors.requestedTime = "Select a valid lab time.";
  } else if (draft.requestedDate && isPastLocalTimeSlot(draft.requestedDate, draft.requestedTime)) {
    errors.requestedTime = "Select a future lab time.";
  } else if (
    draft.requestedDate &&
    isLabSlotFullyBooked(state, draft.requestedDate, draft.requestedTime)
  ) {
    errors.requestedTime = "This lab slot is fully booked. Please choose another time.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function getSearchGroups(state: HospitalState, query: string): SearchGroup[] {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return [];
  }

  const departments = getDepartmentSummaries(state)
    .filter((department) =>
      [department.name, department.code, department.description, department.location]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    )
    .map((department) => ({
      id: department.id,
      heading: department.name,
      details: `${department.code} - ${department.location} - ${department.activeQueueCount} active in queue`,
      href: "/dashboard/departments",
    }));

  const doctors = state.doctors
    .filter((doctor) =>
      [
        doctor.name,
        doctor.specialization,
        doctor.availability,
        doctor.shiftLabel,
        getDepartmentById(state, doctor.departmentId)?.name ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    )
    .map((doctor) => {
      const department = getDepartmentById(state, doctor.departmentId);

      return {
        id: doctor.id,
        heading: doctor.name,
        details: `${doctor.specialization} - ${department?.name ?? "Department"} - ${doctor.status}`,
        href: "/dashboard/doctors",
      };
    });

  const appointments = state.appointments
    .filter((appointment) =>
      [
        appointment.id,
        appointment.patientName,
        getDoctorById(state, appointment.doctorId)?.name ?? "",
        getDoctorById(state, appointment.doctorId)?.specialization ?? "",
        getDepartmentById(state, appointment.departmentId)?.name ?? "",
        appointment.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    )
    .map((appointment) => ({
      id: appointment.id,
      heading: `${appointment.patientName} - ${appointment.id}`,
      details: `${getDoctorById(state, appointment.doctorId)?.name ?? "Doctor"} - ${appointment.appointmentDate} ${appointment.appointmentTime} - ${appointment.status}`,
      href: "/dashboard/appointments",
    }));

  const queue = state.queueEntries
    .filter((entry) =>
      [
        entry.id,
        entry.patientName,
        getDepartmentById(state, entry.departmentId)?.name ?? "",
        getDoctorById(state, entry.doctorId ?? "")?.name ?? "",
        getDoctorById(state, entry.doctorId ?? "")?.specialization ?? "",
        entry.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    )
    .map((entry) => ({
      id: entry.id,
      heading: `${entry.patientName} - ${entry.id}`,
      details: `${getDepartmentById(state, entry.departmentId)?.name ?? "Department"} - ${entry.status} - Updated ${entry.updatedAt}`,
      href: "/dashboard/queue",
    }));

  return [
    { title: "Departments", items: departments },
    { title: "Doctors", items: doctors },
    { title: "Appointments", items: appointments },
    { title: "Queue", items: queue },
  ].filter((group) => group.items.length > 0);
}

export function createQueueEntryFromAppointment(
  state: HospitalState,
  appointment: AppointmentRecord,
): QueueEntryRecord {
  const nextNumber =
    state.queueEntries.reduce((max, entry) => {
      const parsed = Number(entry.id.replace(/\D/g, ""));
      return Number.isNaN(parsed) ? max : Math.max(max, parsed);
    }, 3100) + 1;

  return {
    id: `Q-${nextNumber}`,
    patientName: appointment.patientName,
    departmentId: appointment.departmentId,
    doctorId: appointment.doctorId,
    appointmentId: appointment.id,
    status: "Waiting",
    createdAt: appointment.appointmentTime,
    updatedAt: appointment.appointmentTime,
  };
}

export function createAppointmentId(state: HospitalState) {
  const nextNumber =
    state.appointments.reduce((max, appointment) => {
      const parsed = Number(appointment.id.replace(/\D/g, ""));
      return Number.isNaN(parsed) ? max : Math.max(max, parsed);
    }, 2000) + 1;

  return `APT-${nextNumber}`;
}
