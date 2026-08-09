"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from "react";

import {
  createAppointmentId,
  createInitialHospitalState,
  createQueueEntryFromAppointment,
  getActiveQueueEntries,
  getAllowedAppointmentStatuses,
  getAllowedQueueStatuses,
  getAppointmentById,
  getDashboardMetrics,
  getDepartmentById,
  getDepartmentSummaries,
  getDoctorById,
  getSearchGroups,
  HOSPITAL_STORAGE_KEY,
  type AppointmentDraft,
  type AppointmentRecord,
  type AppointmentStatus,
  type HospitalState,
  type QueueStatus,
  validateAppointmentDraft,
} from "@/lib/hospital-data";

type HospitalAction =
  | { type: "hydrate"; payload: HospitalState }
  | { type: "createAppointment"; payload: AppointmentDraft }
  | {
      type: "updateAppointment";
      payload: { appointmentId: string; draft: AppointmentDraft };
    }
  | {
      type: "setAppointmentStatus";
      payload: { appointmentId: string; status: AppointmentStatus };
    }
  | {
      type: "advanceQueue";
      payload: { queueEntryId: string; status: QueueStatus };
    };

type ValidationResult = ReturnType<typeof validateAppointmentDraft>;

type HospitalContextValue = {
  state: HospitalState;
  hydrated: boolean;
  departmentSummaries: ReturnType<typeof getDepartmentSummaries>;
  activeQueueEntries: ReturnType<typeof getActiveQueueEntries>;
  metrics: ReturnType<typeof getDashboardMetrics>;
  createAppointment: (draft: AppointmentDraft) => ValidationResult;
  updateAppointment: (
    appointmentId: string,
    draft: AppointmentDraft,
  ) => ValidationResult;
  setAppointmentStatus: (
    appointmentId: string,
    status: AppointmentStatus,
  ) => { ok: boolean; message?: string };
  advanceQueue: (
    queueEntryId: string,
    status: QueueStatus,
  ) => { ok: boolean; message?: string };
  getDoctorName: (doctorId: string) => string;
  getDepartmentName: (departmentId: string) => string;
  search: (query: string) => ReturnType<typeof getSearchGroups>;
  getAllowedAppointmentStatuses: typeof getAllowedAppointmentStatuses;
  getAllowedQueueStatuses: typeof getAllowedQueueStatuses;
};

const HospitalDataContext = createContext<HospitalContextValue | null>(null);

function hospitalReducer(state: HospitalState, action: HospitalAction): HospitalState {
  switch (action.type) {
    case "hydrate":
      return action.payload;
    case "createAppointment": {
      const doctor = getDoctorById(state, action.payload.doctorId);
      if (!doctor) return state;

      const appointment: AppointmentRecord = {
        id: createAppointmentId(state),
        patientName: action.payload.patientName.trim(),
        doctorId: doctor.id,
        departmentId: doctor.departmentId,
        appointmentDate: action.payload.appointmentDate,
        appointmentTime: action.payload.appointmentTime,
        status: "Scheduled",
      };

      return {
        ...state,
        appointments: [appointment, ...state.appointments],
      };
    }
    case "updateAppointment": {
      const doctor = getDoctorById(state, action.payload.draft.doctorId);
      if (!doctor) return state;

      return {
        ...state,
        appointments: state.appointments.map((appointment) =>
          appointment.id === action.payload.appointmentId
            ? {
                ...appointment,
                patientName: action.payload.draft.patientName.trim(),
                doctorId: doctor.id,
                departmentId: doctor.departmentId,
                appointmentDate: action.payload.draft.appointmentDate,
                appointmentTime: action.payload.draft.appointmentTime,
              }
            : appointment,
        ),
        queueEntries: state.queueEntries.map((entry) =>
          entry.appointmentId === action.payload.appointmentId
            ? {
                ...entry,
                patientName: action.payload.draft.patientName.trim(),
                doctorId: doctor.id,
                departmentId: doctor.departmentId,
                createdAt: action.payload.draft.appointmentTime,
                updatedAt: action.payload.draft.appointmentTime,
              }
            : entry,
        ),
      };
    }
    case "setAppointmentStatus": {
      const appointment = getAppointmentById(state, action.payload.appointmentId);
      if (!appointment) return state;

      let nextQueueEntries = state.queueEntries;

      if (action.payload.status === "Checked in") {
        const existingQueueEntry = state.queueEntries.find(
          (entry) =>
            entry.appointmentId === appointment.id && entry.status !== "Completed",
        );

        if (!existingQueueEntry) {
          nextQueueEntries = [
            createQueueEntryFromAppointment(state, appointment),
            ...state.queueEntries,
          ];
        }
      }

      if (action.payload.status === "Cancelled") {
        nextQueueEntries = nextQueueEntries.map((entry) =>
          entry.appointmentId === appointment.id && entry.status !== "Completed"
            ? { ...entry, status: "Completed", updatedAt: appointment.appointmentTime }
            : entry,
        );
      }

      if (action.payload.status === "In consultation") {
        nextQueueEntries = nextQueueEntries.map((entry) =>
          entry.appointmentId === appointment.id && entry.status !== "Completed"
            ? { ...entry, status: "In consultation", updatedAt: appointment.appointmentTime }
            : entry,
        );
      }

      if (action.payload.status === "Completed") {
        nextQueueEntries = nextQueueEntries.map((entry) =>
          entry.appointmentId === appointment.id
            ? { ...entry, status: "Completed", updatedAt: appointment.appointmentTime }
            : entry,
        );
      }

      return {
        ...state,
        appointments: state.appointments.map((current) =>
          current.id === appointment.id
            ? { ...current, status: action.payload.status }
            : current,
        ),
        queueEntries: nextQueueEntries,
      };
    }
    case "advanceQueue": {
      const queueEntry = state.queueEntries.find(
        (entry) => entry.id === action.payload.queueEntryId,
      );
      if (!queueEntry) return state;

      const nextQueueEntries = state.queueEntries.map((entry) =>
        entry.id === queueEntry.id
          ? { ...entry, status: action.payload.status, updatedAt: queueEntry.updatedAt }
          : entry,
      );

      const linkedAppointmentId = queueEntry.appointmentId;
      let nextAppointments = state.appointments;

      if (linkedAppointmentId) {
        const linkedAppointment = getAppointmentById(state, linkedAppointmentId);

        if (linkedAppointment) {
          const appointmentStatus: AppointmentStatus =
            action.payload.status === "Waiting" || action.payload.status === "Called"
              ? "Checked in"
              : action.payload.status === "In consultation"
                ? "In consultation"
                : "Completed";

          nextAppointments = state.appointments.map((appointment) =>
            appointment.id === linkedAppointment.id
              ? { ...appointment, status: appointmentStatus }
              : appointment,
          );
        }
      }

      return {
        ...state,
        queueEntries: nextQueueEntries,
        appointments: nextAppointments,
      };
    }
    default:
      return state;
  }
}

export function HospitalDataProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(hospitalReducer, undefined, createInitialHospitalState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const persisted = window.localStorage.getItem(HOSPITAL_STORAGE_KEY);

      if (persisted) {
        dispatch({
          type: "hydrate",
          payload: JSON.parse(persisted) as HospitalState,
        });
      }
    } catch {
      window.localStorage.removeItem(HOSPITAL_STORAGE_KEY);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    window.localStorage.setItem(HOSPITAL_STORAGE_KEY, JSON.stringify(state));
  }, [hydrated, state]);

  const departmentSummaries = useMemo(() => getDepartmentSummaries(state), [state]);
  const activeQueueEntries = useMemo(() => getActiveQueueEntries(state), [state]);
  const metrics = useMemo(() => getDashboardMetrics(state), [state]);

  const createAppointment = useCallback(
    (draft: AppointmentDraft) => {
      const result = validateAppointmentDraft(state, draft);
      if (!result.isValid) return result;

      dispatch({ type: "createAppointment", payload: draft });
      return result;
    },
    [state],
  );

  const updateAppointment = useCallback(
    (appointmentId: string, draft: AppointmentDraft) => {
      const result = validateAppointmentDraft(state, draft, appointmentId);
      if (!result.isValid) return result;

      dispatch({ type: "updateAppointment", payload: { appointmentId, draft } });
      return result;
    },
    [state],
  );

  const setAppointmentStatus = useCallback(
    (appointmentId: string, status: AppointmentStatus) => {
      const appointment = getAppointmentById(state, appointmentId);
      if (!appointment) {
        return { ok: false, message: "Appointment not found." };
      }

      const allowed = getAllowedAppointmentStatuses(appointment.status);
      if (!allowed.includes(status)) {
        return {
          ok: false,
          message: "That appointment status transition is not allowed.",
        };
      }

      dispatch({ type: "setAppointmentStatus", payload: { appointmentId, status } });
      return { ok: true };
    },
    [state],
  );

  const advanceQueue = useCallback(
    (queueEntryId: string, status: QueueStatus) => {
      const queueEntry = state.queueEntries.find((entry) => entry.id === queueEntryId);
      if (!queueEntry) {
        return { ok: false, message: "Queue entry not found." };
      }

      const allowed = getAllowedQueueStatuses(queueEntry.status);
      if (!allowed.includes(status)) {
        return { ok: false, message: "That queue transition is not allowed." };
      }

      dispatch({ type: "advanceQueue", payload: { queueEntryId, status } });
      return { ok: true };
    },
    [state],
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
      hydrated,
      departmentSummaries,
      activeQueueEntries,
      metrics,
      createAppointment,
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
      createAppointment,
      departmentSummaries,
      getDepartmentName,
      getDoctorName,
      hydrated,
      metrics,
      search,
      setAppointmentStatus,
      state,
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
