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
  type MedicalRecordDraft,
  type PrescriptionDraft,
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

type ValidationResult = ReturnType<typeof validateAppointmentDraft> & {
  message?: string;
};

type HospitalMeta = {
  userCounts?: Record<UserRole, number>;
  users?: SafeUser[];
  patientProfiles?: SafeUser[];
  appointmentSlotLoads?: AppointmentSlotLoadRecord[];
  labSlotLoads?: LabSlotLoadRecord[];
};

type HospitalContextValue = {
  state: HospitalState;
  meta?: HospitalMeta;
  hydrated: boolean;
  departmentSummaries: ReturnType<typeof getDepartmentSummaries>;
  activeQueueEntries: ReturnType<typeof getActiveQueueEntries>;
  metrics: ReturnType<typeof getDashboardMetrics>;
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
    address: string;
    emergencyContactName: string;
    emergencyContactPhone: string;
    allergies: string;
    medicalConditions: string;
    preferredLanguage?: string;
  }) => Promise<{
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
    temporaryPassword?: string;
  }>;
  createPrescription: (draft: PrescriptionDraft) => Promise<{
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
  state: HospitalState;
  meta?: HospitalMeta;
};

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
    setState(normalizeHospitalState(response.state));
    setMeta(response.meta);
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
      address: string;
      emergencyContactName: string;
      emergencyContactPhone: string;
      allergies: string;
      medicalConditions: string;
      preferredLanguage?: string;
    }) => {
      try {
        const response = await apiRequest<HospitalApiResponse & { temporaryPassword?: string }>(
          "/api/hospital/patients",
          {
          method: "POST",
          body: JSON.stringify(draft),
          },
        );
        updateFromResponse(response);
        return { ok: true, temporaryPassword: response.temporaryPassword };
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
      createDepartment,
      createStaffMember,
      createAppointment,
      createMedicalRecord,
      updateMedicalRecord,
      createPatientProfile,
      createPrescription,
      updateHospitalSettings,
      dispensePrescription,
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
      createDepartment,
      createStaffMember,
      createAppointment,
      createMedicalRecord,
      updateMedicalRecord,
      createPatientProfile,
      createPrescription,
      updateHospitalSettings,
      dispensePrescription,
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
