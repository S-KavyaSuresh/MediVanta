"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import { apiRequest } from "@/lib/api";
import {
  type AppointmentSlotLoadRecord,
  type LabSlotLoadRecord,
  type FamilyMemberDraft,
  type QueuePriority,
  type EmergencyVisitRecord,
  type PatientJourneyRecord,
  type MedicalRecordDraft,
  type MedicalHistoryEntryDraft,
  type ClinicalAttachmentDraft,
  type InventoryItemDraft,
  type PrescriptionDraft,
  type PaymentDraft,
  type HospitalSettingsDraft,
  getActiveQueueEntries,
  getAllowedAppointmentStatuses,
  getAllowedQueueStatuses,
  getDashboardMetrics,
  getDepartmentById,
  getDepartmentSummaries,
  getDoctorById,
  getSearchGroups,
  normalizeHospitalState,
  type DepartmentStatus,
  type DoctorStatus,
  type AppointmentDraft,
  type LabReportDraft,
  type LabRequestDraft,
  type AppointmentStatus,
  type HospitalState,
  type QueueStatus,
  validateAppointmentDraft,
} from "@/lib/hospital-data";
import type { SafeUser, UserRole } from "@/lib/auth";
import type { AuthSession, Organization } from "@/lib/auth";

type ValidationResult = ReturnType<typeof validateAppointmentDraft> & {
  message?: string;
};

type HospitalMeta = {
  userCounts?: Record<UserRole, number>;
  users?: SafeUser[];
  patientProfiles?: SafeUser[];
  doctorProfiles?: SafeUser[];
  appointmentSlotLoads?: AppointmentSlotLoadRecord[];
  labSlotLoads?: LabSlotLoadRecord[];
};

type OperationalAnalytics = {
  overview: {
    patientsToday: number;
    appointmentsToday: number;
    completedConsultations: number;
    cancelledAppointments: number;
    noShows: number;
    activeQueue: number;
    revenueTodayCents: number;
    outstandingBillingCents: number;
    labRequestsToday: number;
    prescriptionsIssued: number;
    prescriptionsDispensed: number;
  };
  trends: Array<{
    date: string;
    appointments: number;
    completed: number;
    cancelled: number;
    noShows: number;
    online: number;
    inPerson: number;
  }>;
  doctorPerformance: Array<{
    id: string;
    name: string;
    specialization: string;
    completedConsultations: number;
    currentAppointmentCount: number;
    patientLoad: number;
    activeQueueCount: number;
  }>;
  departmentPerformance: Array<{
    id: string;
    name: string;
    doctorCount: number;
    onDutyDoctorCount: number;
    appointmentCount: number;
    patientVolume: number;
  }>;
  laboratory: {
    requested: number;
    processing: number;
    completed: number;
    reportsCompleted: number;
  };
  pharmacy: {
    dispensed: number;
    medicineValueCents: number;
    lowStockCount: number;
    outOfStockCount: number;
    nearExpiryCount: number;
  };
  billing: {
    revenueCents: number;
    paidInvoices: number;
    unpaidInvoices: number;
    outstandingAmountCents: number;
    consultationRevenueCents: number;
    labRevenueCents: number;
    pharmacyRevenueCents: number;
  };
};

type DoctorHandoffSummary = {
  patient: string;
  patientContext: string;
  reasonForVisit: string;
  allergies: string;
  chronicConditions: string;
  bloodGroup: string;
  latestDiagnosis: string;
  latestClinicalNote: string;
  recentLabFindings: string;
  activePrescription: string;
  pendingLabs: string;
  visitStatus: string;
  followUp: string;
};

type HospitalMutationPatch = {
  organization?: Organization;
  bookingCapacity?: HospitalState["bookingCapacity"];
  medicineCatalog?: HospitalState["medicineCatalog"];
  appointments?: HospitalState["appointments"];
  queueEntries?: HospitalState["queueEntries"];
  medicalRecords?: HospitalState["medicalRecords"];
  prescriptions?: HospitalState["prescriptions"];
  labRequests?: HospitalState["labRequests"];
  labReports?: HospitalState["labReports"];
  invoices?: HospitalState["invoices"];
  inventoryItems?: HospitalState["inventoryItems"];
  notifications?: HospitalState["notifications"];
  emergencyVisits?: HospitalState["emergencyVisits"];
  patientJourneys?: HospitalState["patientJourneys"];
  familyMembers?: HospitalState["familyMembers"];
  medicalHistoryEntries?: HospitalState["medicalHistoryEntries"];
  clinicalAttachments?: HospitalState["clinicalAttachments"];
  telemedicineSessions?: HospitalState["telemedicineSessions"];
  meta?: HospitalMeta;
};

type HospitalContextValue = {
  state: HospitalState;
  meta?: HospitalMeta;
  hydrated: boolean;
  departmentSummaries: ReturnType<typeof getDepartmentSummaries>;
  activeQueueEntries: ReturnType<typeof getActiveQueueEntries>;
  metrics: ReturnType<typeof getDashboardMetrics>;
  fetchOperationalAnalytics: (scope: "today" | "7d" | "30d") => Promise<{
    ok: boolean;
    analytics?: OperationalAnalytics;
    message?: string;
  }>;
  createEmergencyVisit: (draft: {
    patientId?: string;
    familyMemberId?: string;
    patientName?: string;
    contactName?: string;
    contactPhone?: string;
    emergencyReason: string;
    severity: "Priority" | "Emergency";
    allergies?: string;
    medicalConditions?: string;
    bloodGroup?: string;
  }) => Promise<{ ok: boolean; message?: string; fieldErrors?: Record<string, string> }>;
  updateQueuePriority: (
    queueEntryId: string,
    priority: QueuePriority,
  ) => Promise<{ ok: boolean; message?: string }>;
  fetchPatientJourney: (token: string) => Promise<{
    ok: boolean;
    journey?: PatientJourneyRecord;
    message?: string;
  }>;
  fetchDoctorHandoff: (input: {
    appointmentId?: string;
    patientId?: string;
  }) => Promise<{
    ok: boolean;
    handoff?: DoctorHandoffSummary;
    message?: string;
  }>;
  createDepartment: (draft: {
    code: string;
    name: string;
    description: string;
    status: DepartmentStatus;
    location: string;
  }) => Promise<{ ok: boolean; message?: string; fieldErrors?: Record<string, string> }>;
  createStaffMember: (draft: {
    displayName: string;
    email: string;
    role: "doctor" | "receptionist" | "laboratory" | "pharmacist";
    departmentId?: string;
    specialization?: string;
    status: string;
  }) => Promise<{ ok: boolean; message?: string; fieldErrors?: Record<string, string> }>;
  updateUserAccountStatus: (
    userId: string,
    status: "Active" | "Deactivated",
  ) => Promise<{ ok: boolean; message?: string; fieldErrors?: Record<string, string> }>;
  createAppointment: (draft: AppointmentDraft) => Promise<ValidationResult>;
  createMedicalRecord: (draft: MedicalRecordDraft) => Promise<{
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
  }>;
  updateMedicalRecord: (
    recordId: string,
    draft: Pick<MedicalRecordDraft, "diagnosis" | "clinicalNotes" | "treatmentAdvice">,
  ) => Promise<{
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
  }>;
  createPatientProfile: (draft: {
    fullName: string;
    email: string;
    phoneNumber: string;
    gender: string;
    dateOfBirth: string;
    bloodGroup: string;
    preferredLanguage?: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    postalCode: string;
    emergencyContactName: string;
    emergencyContactPhone: string;
    allergies: string;
    medicalConditions: string;
    password: string;
    confirmPassword: string;
  }) => Promise<{
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
  }>;
  createFamilyMember: (draft: FamilyMemberDraft) => Promise<{
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
  }>;
  updateFamilyMember: (familyMemberId: string, draft: FamilyMemberDraft) => Promise<{
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
  }>;
  unlinkFamilyMember: (familyMemberId: string) => Promise<{ ok: boolean; message?: string }>;
  createMedicalHistoryEntry: (draft: MedicalHistoryEntryDraft) => Promise<{
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
  }>;
  createClinicalAttachment: (draft: ClinicalAttachmentDraft) => Promise<{
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
  }>;
  createPrescription: (draft: PrescriptionDraft) => Promise<{
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
  }>;
  updatePrescription: (
    prescriptionId: string,
    draft: PrescriptionDraft,
  ) => Promise<{
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
  }>;
  updateHospitalSettings: (draft: HospitalSettingsDraft) => Promise<{
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
  }>;
  dispensePrescription: (
    prescriptionId: string,
  ) => Promise<{ ok: boolean; message?: string }>;
  recordInvoicePayment: (
    invoiceId: string,
    draft: PaymentDraft,
  ) => Promise<{ ok: boolean; message?: string; fieldErrors?: Record<string, string> }>;
  createInventoryItem: (
    draft: InventoryItemDraft,
  ) => Promise<{ ok: boolean; message?: string; fieldErrors?: Record<string, string> }>;
  updateInventoryItem: (
    inventoryItemId: string,
    draft: InventoryItemDraft,
  ) => Promise<{ ok: boolean; message?: string; fieldErrors?: Record<string, string> }>;
  markNotificationRead: (notificationId: string) => Promise<{ ok: boolean; message?: string }>;
  markAllNotificationsRead: () => Promise<{ ok: boolean; message?: string }>;
  createLabRequest: (draft: LabRequestDraft) => Promise<{
    ok: boolean;
    message?: string;
    fieldErrors?: Partial<Record<keyof LabRequestDraft, string>>;
  }>;
  updateLabRequestStatus: (
    labRequestId: string,
    status: HospitalState["labRequests"][number]["status"],
  ) => Promise<{ ok: boolean; message?: string }>;
  createLabReport: (
    labRequestId: string,
    draft: LabReportDraft,
  ) => Promise<{
    ok: boolean;
    message?: string;
    fieldErrors?: Partial<Record<keyof LabReportDraft, string>>;
  }>;
  updateAppointment: (
    appointmentId: string,
    draft: AppointmentDraft,
  ) => Promise<ValidationResult>;
  setAppointmentStatus: (
    appointmentId: string,
    status: AppointmentStatus,
  ) => Promise<{ ok: boolean; message?: string }>;
  advanceQueue: (
    queueEntryId: string,
    status: QueueStatus,
  ) => Promise<{ ok: boolean; message?: string }>;
  getDoctorName: (doctorId: string) => string;
  getDepartmentName: (departmentId: string) => string;
  search: (query: string) => ReturnType<typeof getSearchGroups>;
  getAllowedAppointmentStatuses: typeof getAllowedAppointmentStatuses;
  getAllowedQueueStatuses: typeof getAllowedQueueStatuses;
};

const HospitalDataContext = createContext<HospitalContextValue | null>(null);

type HospitalApiResponse = {
  state?: HospitalState;
  meta?: HospitalMeta;
  session?: AuthSession;
  patch?: HospitalMutationPatch;
  analytics?: OperationalAnalytics;
  journey?: PatientJourneyRecord;
  handoff?: DoctorHandoffSummary;
};

function mergeById<T extends { id: string }>(current: T[], incoming?: T[]) {
  if (!incoming?.length) {
    return current;
  }

  const next = new Map(current.map((item) => [item.id, item] as const));
  for (const item of incoming) {
    next.set(item.id, item);
  }

  return [...next.values()];
}

export function HospitalDataProvider({
  children,
  initialState,
  initialMeta,
}: {
  children: React.ReactNode;
  initialState: HospitalState;
  initialMeta?: HospitalMeta;
}) {
  const [state, setState] = useState(() => normalizeHospitalState(initialState));
  const [meta, setMeta] = useState<HospitalMeta | undefined>(initialMeta);

  const updateFromResponse = useCallback((response: HospitalApiResponse) => {
    if (response.state) {
      setState(normalizeHospitalState(response.state));
    } else if (response.patch) {
      setState((current) =>
        normalizeHospitalState({
          ...current,
          organization: response.patch?.organization ?? current.organization,
          bookingCapacity: response.patch?.bookingCapacity ?? current.bookingCapacity,
          medicineCatalog: mergeById(current.medicineCatalog, response.patch?.medicineCatalog),
          appointments: mergeById(current.appointments, response.patch?.appointments),
          queueEntries: mergeById(current.queueEntries, response.patch?.queueEntries),
          medicalRecords: mergeById(current.medicalRecords, response.patch?.medicalRecords),
          prescriptions: mergeById(current.prescriptions, response.patch?.prescriptions),
          labRequests: mergeById(current.labRequests, response.patch?.labRequests),
          labReports: mergeById(current.labReports, response.patch?.labReports),
          invoices: mergeById(current.invoices, response.patch?.invoices),
          inventoryItems: mergeById(current.inventoryItems, response.patch?.inventoryItems),
          notifications: mergeById(current.notifications, response.patch?.notifications),
          emergencyVisits: mergeById(
            current.emergencyVisits ?? [],
            response.patch?.emergencyVisits,
          ),
          patientJourneys: mergeById(
            current.patientJourneys ?? [],
            response.patch?.patientJourneys,
          ),
          familyMembers: mergeById(current.familyMembers ?? [], response.patch?.familyMembers),
          medicalHistoryEntries: mergeById(
            current.medicalHistoryEntries ?? [],
            response.patch?.medicalHistoryEntries,
          ),
          clinicalAttachments: mergeById(
            current.clinicalAttachments ?? [],
            response.patch?.clinicalAttachments,
          ),
          telemedicineSessions: mergeById(
            current.telemedicineSessions ?? [],
            response.patch?.telemedicineSessions,
          ),
        }),
      );
    }

    if (response.meta || response.patch?.meta) {
      setMeta((current) => ({
        ...(current ?? {}),
        ...(response.meta ?? {}),
        ...(response.patch?.meta ?? {}),
      }));
    }
  }, []);

  const departmentSummaries = useMemo(() => getDepartmentSummaries(state), [state]);
  const activeQueueEntries = useMemo(() => getActiveQueueEntries(state), [state]);
  const metrics = useMemo(() => getDashboardMetrics(state), [state]);

  const createDepartment = useCallback(
    async (draft: {
      code: string;
      name: string;
      description: string;
      status: DepartmentStatus;
      location: string;
    }) => {
      try {
        const response = await apiRequest<HospitalApiResponse>("/api/hospital/departments", {
          method: "POST",
          body: JSON.stringify(draft),
        });
        updateFromResponse(response);
        return { ok: true };
      } catch (error) {
        const maybeError = error as Error & { fieldErrors?: Record<string, string> };
        return {
          ok: false,
          message: maybeError.message,
          fieldErrors: maybeError.fieldErrors,
        };
      }
    },
    [updateFromResponse],
  );

  const fetchOperationalAnalytics = useCallback(
    async (scope: "today" | "7d" | "30d") => {
      try {
        const response = await apiRequest<HospitalApiResponse>(
          `/api/hospital/analytics?scope=${encodeURIComponent(scope)}`,
        );
        return { ok: true, analytics: response.analytics };
      } catch (error) {
        return {
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : "Analytics are not available right now.",
        };
      }
    },
    [],
  );

  const createEmergencyVisit = useCallback(
    async (draft: {
      patientId?: string;
      familyMemberId?: string;
      patientName?: string;
      contactName?: string;
      contactPhone?: string;
      emergencyReason: string;
      severity: "Priority" | "Emergency";
      allergies?: string;
      medicalConditions?: string;
      bloodGroup?: string;
    }) => {
      try {
        const response = await apiRequest<HospitalApiResponse>("/api/hospital/emergency-visits", {
          method: "POST",
          body: JSON.stringify(draft),
        });
        updateFromResponse(response);
        return { ok: true };
      } catch (error) {
        const maybeError = error as Error & { fieldErrors?: Record<string, string> };
        return {
          ok: false,
          message: maybeError.message,
          fieldErrors: maybeError.fieldErrors,
        };
      }
    },
    [updateFromResponse],
  );

  const updateQueuePriority = useCallback(
    async (queueEntryId: string, priority: QueuePriority) => {
      try {
        const response = await apiRequest<HospitalApiResponse>(
          `/api/hospital/queue/${queueEntryId}/priority`,
          {
            method: "PATCH",
            body: JSON.stringify({ priority }),
          },
        );
        updateFromResponse(response);
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : "The queue priority could not be updated.",
        };
      }
    },
    [updateFromResponse],
  );

  const fetchPatientJourney = useCallback(async (token: string) => {
    try {
      const response = await apiRequest<HospitalApiResponse>(
        `/api/hospital/journeys?token=${encodeURIComponent(token)}`,
      );
      return { ok: true, journey: response.journey };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "The patient journey could not be loaded.",
      };
    }
  }, []);

  const fetchDoctorHandoff = useCallback(
    async (input: { appointmentId?: string; patientId?: string }) => {
      try {
        const search = new URLSearchParams();
        if (input.appointmentId) {
          search.set("appointmentId", input.appointmentId);
        }
        if (input.patientId) {
          search.set("patientId", input.patientId);
        }

        const response = await apiRequest<HospitalApiResponse>(
          `/api/hospital/handoff?${search.toString()}`,
        );
        return { ok: true, handoff: response.handoff };
      } catch (error) {
        return {
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : "The patient handoff could not be loaded.",
        };
      }
    },
    [],
  );

  const createStaffMember = useCallback(
    async (draft: {
      displayName: string;
      email: string;
      role: "doctor" | "receptionist" | "laboratory" | "pharmacist";
      departmentId?: string;
      specialization?: string;
      status: string;
    }) => {
      try {
        const response = await apiRequest<HospitalApiResponse>("/api/hospital/staff", {
          method: "POST",
          body: JSON.stringify(draft),
        });
        updateFromResponse(response);
        return { ok: true };
      } catch (error) {
        const maybeError = error as Error & { fieldErrors?: Record<string, string> };
        return {
          ok: false,
          message: maybeError.message,
          fieldErrors: maybeError.fieldErrors,
        };
      }
    },
    [updateFromResponse],
  );

  const updateUserAccountStatus = useCallback(
    async (userId: string, status: "Active" | "Deactivated") => {
      try {
        const response = await apiRequest<HospitalApiResponse>(
          `/api/hospital/users/${userId}/account-status`,
          {
            method: "PATCH",
            body: JSON.stringify({ status }),
          },
        );
        updateFromResponse(response);
        return { ok: true };
      } catch (error) {
        const maybeError = error as Error & { fieldErrors?: Record<string, string> };
        return {
          ok: false,
          message: maybeError.message,
          fieldErrors: maybeError.fieldErrors,
        };
      }
    },
    [updateFromResponse],
  );

  const createAppointment = useCallback(
    async (draft: AppointmentDraft) => {
      const result = validateAppointmentDraft(state, draft);
      if (!result.isValid) {
        return result;
      }

      try {
        const response = await apiRequest<HospitalApiResponse>("/api/hospital/appointments", {
          method: "POST",
          body: JSON.stringify(draft),
        });
        updateFromResponse(response);
        return result;
      } catch (error) {
        const maybeError = error as Error & {
          fieldErrors?: Partial<Record<keyof AppointmentDraft, string>>;
        };

        return {
          isValid: false,
          errors: maybeError.fieldErrors ?? {},
          message: maybeError.message,
        };
      }
    },
    [state, updateFromResponse],
  );

  const createMedicalRecord = useCallback(
    async (draft: MedicalRecordDraft) => {
      try {
        const response = await apiRequest<HospitalApiResponse>("/api/hospital/medical-records", {
          method: "POST",
          body: JSON.stringify(draft),
        });
        updateFromResponse(response);
        return { ok: true };
      } catch (error) {
        const maybeError = error as Error & { fieldErrors?: Record<string, string> };
        return {
          ok: false,
          message: maybeError.message,
          fieldErrors: maybeError.fieldErrors,
        };
      }
    },
    [updateFromResponse],
  );

  const updateMedicalRecord = useCallback(
    async (
      recordId: string,
      draft: Pick<MedicalRecordDraft, "diagnosis" | "clinicalNotes" | "treatmentAdvice">,
    ) => {
      try {
        const response = await apiRequest<HospitalApiResponse>(
          `/api/hospital/medical-records/${recordId}`,
          {
            method: "PATCH",
            body: JSON.stringify(draft),
          },
        );
        updateFromResponse(response);
        return { ok: true };
      } catch (error) {
        const maybeError = error as Error & { fieldErrors?: Record<string, string> };
        return {
          ok: false,
          message: maybeError.message,
          fieldErrors: maybeError.fieldErrors,
        };
      }
    },
    [updateFromResponse],
  );

  const createPatientProfile = useCallback(
    async (draft: {
      fullName: string;
      email: string;
      phoneNumber: string;
      gender: string;
      dateOfBirth: string;
      bloodGroup: string;
      preferredLanguage?: string;
      addressLine1: string;
      addressLine2?: string;
      city: string;
      state: string;
      postalCode: string;
      emergencyContactName: string;
      emergencyContactPhone: string;
      allergies: string;
      medicalConditions: string;
      password: string;
      confirmPassword: string;
    }) => {
      try {
        const response = await apiRequest<HospitalApiResponse>(
          "/api/hospital/patients",
          {
          method: "POST",
          body: JSON.stringify(draft),
          },
        );
        updateFromResponse(response);
        return { ok: true };
      } catch (error) {
        const maybeError = error as Error & { fieldErrors?: Record<string, string> };
        return {
          ok: false,
          message: maybeError.message,
          fieldErrors: maybeError.fieldErrors,
        };
      }
    },
    [updateFromResponse],
  );

  const createFamilyMember = useCallback(
    async (draft: FamilyMemberDraft) => {
      try {
        const response = await apiRequest<HospitalApiResponse>("/api/hospital/family-members", {
          method: "POST",
          body: JSON.stringify(draft),
        });
        updateFromResponse(response);
        return { ok: true };
      } catch (error) {
        const maybeError = error as Error & { fieldErrors?: Record<string, string> };
        return { ok: false, message: maybeError.message, fieldErrors: maybeError.fieldErrors };
      }
    },
    [updateFromResponse],
  );

  const updateFamilyMember = useCallback(
    async (familyMemberId: string, draft: FamilyMemberDraft) => {
      try {
        const response = await apiRequest<HospitalApiResponse>(
          `/api/hospital/family-members/${familyMemberId}`,
          {
            method: "PATCH",
            body: JSON.stringify(draft),
          },
        );
        updateFromResponse(response);
        return { ok: true };
      } catch (error) {
        const maybeError = error as Error & { fieldErrors?: Record<string, string> };
        return { ok: false, message: maybeError.message, fieldErrors: maybeError.fieldErrors };
      }
    },
    [updateFromResponse],
  );

  const unlinkFamilyMember = useCallback(
    async (familyMemberId: string) => {
      try {
        const response = await apiRequest<HospitalApiResponse>(
          `/api/hospital/family-members/${familyMemberId}`,
          {
            method: "DELETE",
          },
        );
        updateFromResponse(response);
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : "Unable to update this family member.",
        };
      }
    },
    [updateFromResponse],
  );

  const createMedicalHistoryEntry = useCallback(
    async (draft: MedicalHistoryEntryDraft) => {
      try {
        const response = await apiRequest<HospitalApiResponse>("/api/hospital/medical-history", {
          method: "POST",
          body: JSON.stringify(draft),
        });
        updateFromResponse(response);
        return { ok: true };
      } catch (error) {
        const maybeError = error as Error & { fieldErrors?: Record<string, string> };
        return { ok: false, message: maybeError.message, fieldErrors: maybeError.fieldErrors };
      }
    },
    [updateFromResponse],
  );

  const createClinicalAttachment = useCallback(
    async (draft: ClinicalAttachmentDraft) => {
      try {
        const response = await apiRequest<HospitalApiResponse>("/api/hospital/clinical-attachments", {
          method: "POST",
          body: JSON.stringify(draft),
        });
        updateFromResponse(response);
        return { ok: true };
      } catch (error) {
        const maybeError = error as Error & { fieldErrors?: Record<string, string> };
        return { ok: false, message: maybeError.message, fieldErrors: maybeError.fieldErrors };
      }
    },
    [updateFromResponse],
  );

  const createPrescription = useCallback(
    async (draft: PrescriptionDraft) => {
      try {
        const response = await apiRequest<HospitalApiResponse>("/api/hospital/prescriptions", {
          method: "POST",
          body: JSON.stringify(draft),
        });
        updateFromResponse(response);
        return { ok: true };
      } catch (error) {
        const maybeError = error as Error & { fieldErrors?: Record<string, string> };
        return {
          ok: false,
          message: maybeError.message,
          fieldErrors: maybeError.fieldErrors,
        };
      }
    },
    [updateFromResponse],
  );

  const updatePrescription = useCallback(
    async (prescriptionId: string, draft: PrescriptionDraft) => {
      try {
        const response = await apiRequest<HospitalApiResponse>(
          `/api/hospital/prescriptions/${prescriptionId}`,
          {
            method: "PATCH",
            body: JSON.stringify(draft),
          },
        );
        updateFromResponse(response);
        return { ok: true };
      } catch (error) {
        const maybeError = error as Error & { fieldErrors?: Record<string, string> };
        return {
          ok: false,
          message: maybeError.message,
          fieldErrors: maybeError.fieldErrors,
        };
      }
    },
    [updateFromResponse],
  );

  const updateHospitalSettings = useCallback(
    async (draft: HospitalSettingsDraft) => {
      try {
        const response = await apiRequest<HospitalApiResponse>("/api/hospital/settings", {
          method: "PATCH",
          body: JSON.stringify(draft),
        });
        updateFromResponse(response);
        return { ok: true };
      } catch (error) {
        const maybeError = error as Error & { fieldErrors?: Record<string, string> };
        return {
          ok: false,
          message: maybeError.message,
          fieldErrors: maybeError.fieldErrors,
        };
      }
    },
    [updateFromResponse],
  );

  const dispensePrescription = useCallback(
    async (prescriptionId: string) => {
      try {
        const response = await apiRequest<HospitalApiResponse>(
          `/api/hospital/prescriptions/${prescriptionId}/status`,
          {
            method: "PATCH",
            body: JSON.stringify({ status: "Dispensed" }),
          },
        );
        updateFromResponse(response);
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : "The prescription could not be dispensed.",
        };
      }
    },
    [updateFromResponse],
  );

  const recordInvoicePayment = useCallback(
    async (invoiceId: string, draft: PaymentDraft) => {
      try {
        const response = await apiRequest<HospitalApiResponse>(
          `/api/hospital/invoices/${invoiceId}/payments`,
          {
            method: "POST",
            body: JSON.stringify(draft),
          },
        );
        updateFromResponse(response);
        return { ok: true };
      } catch (error) {
        const maybeError = error as Error & { fieldErrors?: Record<string, string> };
        return { ok: false, message: maybeError.message, fieldErrors: maybeError.fieldErrors };
      }
    },
    [updateFromResponse],
  );

  const createInventoryItem = useCallback(
    async (draft: InventoryItemDraft) => {
      try {
        const response = await apiRequest<HospitalApiResponse>("/api/hospital/inventory-items", {
          method: "POST",
          body: JSON.stringify(draft),
        });
        updateFromResponse(response);
        return { ok: true };
      } catch (error) {
        const maybeError = error as Error & { fieldErrors?: Record<string, string> };
        return { ok: false, message: maybeError.message, fieldErrors: maybeError.fieldErrors };
      }
    },
    [updateFromResponse],
  );

  const updateInventoryItem = useCallback(
    async (inventoryItemId: string, draft: InventoryItemDraft) => {
      try {
        const response = await apiRequest<HospitalApiResponse>(
          `/api/hospital/inventory-items/${inventoryItemId}`,
          {
            method: "PATCH",
            body: JSON.stringify(draft),
          },
        );
        updateFromResponse(response);
        return { ok: true };
      } catch (error) {
        const maybeError = error as Error & { fieldErrors?: Record<string, string> };
        return { ok: false, message: maybeError.message, fieldErrors: maybeError.fieldErrors };
      }
    },
    [updateFromResponse],
  );

  const markNotificationRead = useCallback(
    async (notificationId: string) => {
      try {
        const response = await apiRequest<HospitalApiResponse>(
          `/api/hospital/notifications/${notificationId}/read`,
          {
            method: "PATCH",
          },
        );
        updateFromResponse(response);
        return { ok: true };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : "Unable to mark notification as read." };
      }
    },
    [updateFromResponse],
  );

  const markAllNotificationsRead = useCallback(
    async () => {
      try {
        const response = await apiRequest<HospitalApiResponse>("/api/hospital/notifications/read-all", {
          method: "POST",
        });
        updateFromResponse(response);
        return { ok: true };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : "Unable to update notifications." };
      }
    },
    [updateFromResponse],
  );

  const createLabRequest = useCallback(
    async (draft: LabRequestDraft) => {
      try {
        const response = await apiRequest<HospitalApiResponse>("/api/hospital/lab-requests", {
          method: "POST",
          body: JSON.stringify(draft),
        });
        updateFromResponse(response);
        return { ok: true };
      } catch (error) {
        const maybeError = error as Error & {
          fieldErrors?: Partial<Record<keyof LabRequestDraft, string>>;
        };
        return {
          ok: false,
          message: maybeError.message,
          fieldErrors: maybeError.fieldErrors,
        };
      }
    },
    [updateFromResponse],
  );

  const updateLabRequestStatus = useCallback(
    async (labRequestId: string, status: HospitalState["labRequests"][number]["status"]) => {
      try {
        const response = await apiRequest<HospitalApiResponse>(
          `/api/hospital/lab-requests/${labRequestId}/status`,
          {
            method: "PATCH",
            body: JSON.stringify({ status }),
          },
        );
        updateFromResponse(response);
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : "The laboratory request could not be updated.",
        };
      }
    },
    [updateFromResponse],
  );

  const createLabReport = useCallback(
    async (labRequestId: string, draft: LabReportDraft) => {
      try {
        const response = await apiRequest<HospitalApiResponse>(
          `/api/hospital/lab-requests/${labRequestId}/report`,
          {
            method: "POST",
            body: JSON.stringify(draft),
          },
        );
        updateFromResponse(response);
        return { ok: true };
      } catch (error) {
        const maybeError = error as Error & {
          fieldErrors?: Partial<Record<keyof LabReportDraft, string>>;
        };

        return {
          ok: false,
          message: maybeError.message,
          fieldErrors: maybeError.fieldErrors,
        };
      }
    },
    [updateFromResponse],
  );

  const updateAppointment = useCallback(
    async (appointmentId: string, draft: AppointmentDraft) => {
      const result = validateAppointmentDraft(state, draft, appointmentId);
      if (!result.isValid) {
        return result;
      }

      try {
        const response = await apiRequest<HospitalApiResponse>(
          `/api/hospital/appointments/${appointmentId}`,
          {
            method: "PATCH",
            body: JSON.stringify(draft),
          },
        );
        updateFromResponse(response);
        return result;
      } catch (error) {
        const maybeError = error as Error & {
          fieldErrors?: Partial<Record<keyof AppointmentDraft, string>>;
        };

        return {
          isValid: false,
          errors: maybeError.fieldErrors ?? {},
          message: maybeError.message,
        };
      }
    },
    [state, updateFromResponse],
  );

  const setAppointmentStatus = useCallback(
    async (appointmentId: string, status: AppointmentStatus) => {
      try {
        const response = await apiRequest<HospitalApiResponse>(
          `/api/hospital/appointments/${appointmentId}/status`,
          {
            method: "PATCH",
            body: JSON.stringify({ status }),
          },
        );
        updateFromResponse(response);
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : "The appointment could not be updated.",
        };
      }
    },
    [updateFromResponse],
  );

  const advanceQueue = useCallback(
    async (queueEntryId: string, status: QueueStatus) => {
      try {
        const response = await apiRequest<HospitalApiResponse>(
          `/api/hospital/queue/${queueEntryId}/status`,
          {
            method: "PATCH",
            body: JSON.stringify({ status }),
          },
        );
        updateFromResponse(response);
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : "The queue entry could not be updated.",
        };
      }
    },
    [updateFromResponse],
  );

  const getDoctorName = useCallback(
    (doctorId: string) => getDoctorById(state, doctorId)?.name ?? "Unknown doctor",
    [state],
  );

  const getDepartmentName = useCallback(
    (departmentId: string) =>
      getDepartmentById(state, departmentId)?.name ?? "Unknown department",
    [state],
  );

  const search = useCallback((query: string) => getSearchGroups(state, query), [state]);

  const value = useMemo<HospitalContextValue>(
    () => ({
      state,
      meta,
      hydrated: true,
      departmentSummaries,
      activeQueueEntries,
      metrics,
      fetchOperationalAnalytics,
      createEmergencyVisit,
      updateQueuePriority,
      fetchPatientJourney,
      fetchDoctorHandoff,
      createDepartment,
      createStaffMember,
      updateUserAccountStatus,
      createAppointment,
      createMedicalRecord,
      updateMedicalRecord,
      createPatientProfile,
      createFamilyMember,
      updateFamilyMember,
      unlinkFamilyMember,
      createMedicalHistoryEntry,
      createClinicalAttachment,
      createPrescription,
      updatePrescription,
      updateHospitalSettings,
      dispensePrescription,
      recordInvoicePayment,
      createInventoryItem,
      updateInventoryItem,
      markNotificationRead,
      markAllNotificationsRead,
      createLabRequest,
      updateLabRequestStatus,
      createLabReport,
      updateAppointment,
      setAppointmentStatus,
      advanceQueue,
      getDoctorName,
      getDepartmentName,
      search,
      getAllowedAppointmentStatuses,
      getAllowedQueueStatuses,
    }),
    [
      activeQueueEntries,
      advanceQueue,
      createEmergencyVisit,
      createDepartment,
      createStaffMember,
      fetchDoctorHandoff,
      fetchOperationalAnalytics,
      fetchPatientJourney,
      updateUserAccountStatus,
      createAppointment,
      createMedicalRecord,
      updateMedicalRecord,
      createPatientProfile,
      createFamilyMember,
      updateFamilyMember,
      unlinkFamilyMember,
      createMedicalHistoryEntry,
      createClinicalAttachment,
      createPrescription,
      updatePrescription,
      updateHospitalSettings,
      dispensePrescription,
      recordInvoicePayment,
      createInventoryItem,
      updateInventoryItem,
      markNotificationRead,
      markAllNotificationsRead,
      createLabRequest,
      createLabReport,
      departmentSummaries,
      getDepartmentName,
      getDoctorName,
      meta,
      metrics,
      search,
      setAppointmentStatus,
      state,
      updateQueuePriority,
      updateLabRequestStatus,
      updateAppointment,
    ],
  );

  return <HospitalDataContext.Provider value={value}>{children}</HospitalDataContext.Provider>;
}

export function useHospitalData() {
  const context = useContext(HospitalDataContext);

  if (!context) {
    throw new Error("useHospitalData must be used within HospitalDataProvider");
  }

  return context;
}
