import { clinicians } from "@/lib/sample-data";

export const HOSPITAL_STORAGE_KEY = "medivanta-hospital-state";
export const HOSPITAL_TODAY = "2026-08-09";

export function getCurrentLocalDateIso() {
  return HOSPITAL_TODAY;
}

function getCurrentLocalTimeValue(now = new Date()) {
  return now.getHours() * 60 + now.getMinutes();
}

function getSlotTimeValue(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
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
  patientName: string;
  doctorId: string;
  departmentId: string;
  appointmentDate: string;
  appointmentTime: string;
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

export type HospitalState = {
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  departments: DepartmentRecord[];
  doctors: DoctorRecord[];
  appointments: AppointmentRecord[];
  queueEntries: QueueEntryRecord[];
  labTests: LabTestRecord[];
  labRequests: LabRequestRecord[];
  configuredSupportLines: number;
};

export type AppointmentDraft = {
  patientName: string;
  doctorId: string;
  appointmentDate: string;
  appointmentTime: string;
};

export type LabRequestDraft = {
  testId: string;
  requestedDate: string;
  requestedTime: string;
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
    appointmentDate: HOSPITAL_TODAY,
    appointmentTime: "09:30",
    status: "Checked in",
  },
  {
    id: "APT-2002",
    patientName: "Sana Khan",
    doctorId: "doc-neha-sen",
    departmentId: "dept-radiology",
    appointmentDate: HOSPITAL_TODAY,
    appointmentTime: "10:00",
    status: "In consultation",
  },
  {
    id: "APT-2003",
    patientName: "Maya Joseph",
    doctorId: "doc-anaya-sharma",
    departmentId: "dept-general-medicine",
    appointmentDate: HOSPITAL_TODAY,
    appointmentTime: "10:45",
    status: "Completed",
  },
  {
    id: "APT-2004",
    patientName: "Ritesh Nair",
    doctorId: "doc-meera-iqbal",
    departmentId: "dept-pediatrics",
    appointmentDate: HOSPITAL_TODAY,
    appointmentTime: "11:15",
    status: "Scheduled",
  },
  {
    id: "APT-2005",
    patientName: "Ishita Das",
    doctorId: "doc-kiran-iyer",
    departmentId: "dept-orthopedics",
    appointmentDate: HOSPITAL_TODAY,
    appointmentTime: "12:10",
    status: "Scheduled",
  },
  {
    id: "APT-2006",
    patientName: "Kabir Patel",
    doctorId: "doc-arjun-roy",
    departmentId: "dept-neurology",
    appointmentDate: "2026-08-10",
    appointmentTime: "14:00",
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
    labTests: structuredClone(labTestsSeed),
    labRequests: structuredClone(labRequestsSeed),
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
    (appointment) => appointment.appointmentDate === HOSPITAL_TODAY,
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

  const duplicate = state.appointments.find((appointment) => {
    if (editingId && appointment.id === editingId) {
      return false;
    }

    return (
      appointment.doctorId === draft.doctorId &&
      appointment.appointmentDate === draft.appointmentDate &&
      appointment.appointmentTime === draft.appointmentTime &&
      appointment.status !== "Cancelled"
    );
  });

  if (duplicate) {
    errors.appointmentTime = "The selected doctor already has an appointment at that time.";
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
