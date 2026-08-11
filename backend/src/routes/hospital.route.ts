import { Router } from "express";
import { z } from "zod";

import {
  advanceQueue,
  createAppointment,
  createDepartment,
  createLabReport,
  createLabRequest,
  createMedicalRecord,
  createPatientProfile,
  createPrescription,
  createStaffMember,
  dispensePrescription,
  getLabReportForUser,
  getLabRequestsForUser,
  getScopedHospitalStateForUser,
  setAppointmentStatus,
  updateUserAccountStatus,
  updateHospitalSettings,
  updateMedicalRecord,
  updatePatientProfile,
  updateLabRequestStatus,
  updateAppointment,
} from "../services/hospital-service.js";
import { getAuditLogs } from "../services/audit-service.js";
import { getCapabilitiesForRole, landingPathByRole } from "../auth/permissions.js";
import {
  requireAuthenticatedUser,
  requireCapabilities,
  requireVerifiedEmail,
} from "../middleware/auth.js";

const hospitalRouter = Router();

const appointmentDraftSchema = z.object({
  patientName: z.string(),
  doctorId: z.string(),
  appointmentDate: z.string(),
  appointmentTime: z.string(),
  reasonForAppointment: z.string(),
});

const appointmentStatusSchema = z.object({
  status: z.enum(["Scheduled", "Checked in", "In consultation", "Completed", "Cancelled"]),
});

const queueStatusSchema = z.object({
  status: z.enum(["Waiting", "Called", "In consultation", "Completed"]),
});

const departmentDraftSchema = z.object({
  code: z.string(),
  name: z.string(),
  description: z.string(),
  status: z.enum(["Operational", "Busy", "Limited", "Emergency priority"]),
  location: z.string(),
});

const staffDraftSchema = z.object({
  displayName: z.string(),
  email: z.string(),
  role: z.enum(["doctor", "receptionist", "laboratory", "pharmacist"]),
  departmentId: z.string().optional(),
  specialization: z.string().optional(),
  status: z.string(),
});

const labRequestDraftSchema = z.object({
  testId: z.string(),
  requestedDate: z.string(),
  requestedTime: z.string(),
});

const labRequestStatusSchema = z.object({
  status: z.enum(["Requested", "Scheduled", "Sample Collected", "Processing"]),
});

const labReportDraftSchema = z.object({
  reportTitle: z.string(),
  resultSummary: z.string(),
  attachment: z
    .object({
      fileName: z.string(),
      contentType: z.literal("application/pdf"),
      fileSize: z.number().int().positive(),
      contentBase64: z.string(),
    })
    .optional(),
});

const medicalRecordDraftSchema = z.object({
  patientId: z.string(),
  appointmentId: z.string().optional(),
  visitDate: z.string(),
  diagnosis: z.string(),
  clinicalNotes: z.string(),
  treatmentAdvice: z.string(),
});

const medicalRecordUpdateSchema = medicalRecordDraftSchema.pick({
  diagnosis: true,
  clinicalNotes: true,
  treatmentAdvice: true,
});

const prescriptionDraftSchema = z.object({
  patientId: z.string(),
  appointmentId: z.string().optional(),
  instructions: z.string(),
  medicines: z.array(
    z.object({
      medicineName: z.string(),
      dosage: z.string(),
      frequency: z.string(),
      duration: z.string(),
    }),
  ),
});

const prescriptionStatusSchema = z.object({
  status: z.enum(["Issued", "Dispensed"]),
});

const patientProfileDraftSchema = z.object({
  fullName: z.string(),
  email: z.string().email(),
  phoneNumber: z.string(),
  gender: z.string(),
  dateOfBirth: z.string(),
  bloodGroup: z.string(),
  preferredLanguage: z.string().optional(),
  addressLine1: z.string(),
  addressLine2: z.string().optional(),
  city: z.string(),
  state: z.string(),
  postalCode: z.string(),
  emergencyContactName: z.string(),
  emergencyContactPhone: z.string(),
  allergies: z.string(),
  medicalConditions: z.string(),
  password: z.string(),
  confirmPassword: z.string(),
});

const profileUpdateSchema = z.object({
  fullName: z.string().default(""),
  phoneNumber: z.string().optional(),
  gender: z.string().optional(),
  dateOfBirth: z.string().optional(),
  bloodGroup: z.string().optional(),
  address: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  emergencyContact: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  allergies: z.string().optional(),
  medicalConditions: z.string().optional(),
  preferredLanguage: z.string().optional(),
  qualifications: z.string().optional(),
  experience: z.string().optional(),
  languages: z.string().optional(),
  consultationFee: z.string().optional(),
  availableTimings: z.string().optional(),
  deskLabel: z.string().optional(),
  consultationMode: z.string().optional(),
});

const hospitalSettingsSchema = z.object({
  hospitalName: z.string(),
  address: z.string(),
  city: z.string(),
  state: z.string(),
  contactPhone: z.string(),
  contactEmail: z.string(),
  emergencyContact: z.string(),
  operatingHours: z.string(),
  timezone: z.string(),
  defaultLanguage: z.string(),
  emergencyServicesEnabled: z.boolean(),
  defaultConsultationSlotDurationMinutes: z.number().int(),
  defaultDoctorSlotCapacity: z.number().int(),
  morningSessionCapacity: z.number().int(),
  afternoonSessionCapacity: z.number().int(),
  eveningSessionCapacity: z.number().int(),
  defaultLabSlotCapacity: z.number().int(),
});

const accountStatusSchema = z.object({
  status: z.enum(["Active", "Deactivated"]),
});

function getRouteParam(param: string | string[]) {
  return Array.isArray(param) ? param[0] : param;
}

hospitalRouter.use(requireAuthenticatedUser);

hospitalRouter.get("/state", async (request, response, next) => {
  try {
    const payload = await getScopedHospitalStateForUser(request.authUser!);
    response.json({
      success: true,
      ...payload,
      session: {
        user: request.authUser!,
        organization: payload.state.organization,
        permissions: getCapabilitiesForRole(request.authUser!.role),
        landingPath: landingPathByRole[request.authUser!.role],
      },
    });
  } catch (error) {
    next(error);
  }
});

hospitalRouter.post(
  "/appointments",
  async (request, response, next) => {
    try {
      const draft = appointmentDraftSchema.parse(request.body);
      response.status(201).json({
        success: true,
        ...(await createAppointment(request.authUser!, draft)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.post(
  "/medical-records",
  requireCapabilities("health-records:create"),
  requireVerifiedEmail,
  async (request, response, next) => {
    try {
      const draft = medicalRecordDraftSchema.parse(request.body);
      response.status(201).json({
        success: true,
        ...(await createMedicalRecord(request.authUser!, draft)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.patch(
  "/medical-records/:recordId",
  requireCapabilities("health-records:create"),
  requireVerifiedEmail,
  async (request, response, next) => {
    try {
      const draft = medicalRecordUpdateSchema.parse(request.body);
      const recordId = getRouteParam(request.params.recordId);
      response.json({
        success: true,
        ...(await updateMedicalRecord(request.authUser!, recordId, draft)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.post(
  "/prescriptions",
  requireCapabilities("prescription:create"),
  requireVerifiedEmail,
  async (request, response, next) => {
    try {
      const draft = prescriptionDraftSchema.parse(request.body);
      response.status(201).json({
        success: true,
        ...(await createPrescription(request.authUser!, draft)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.post(
  "/patients",
  requireCapabilities("patient:create"),
  async (request, response, next) => {
    try {
      const draft = patientProfileDraftSchema.parse(request.body);
      response.status(201).json({
        success: true,
        ...(await createPatientProfile(request.authUser!, draft)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.patch(
  "/profile",
  requireCapabilities("profile:update"),
  async (request, response, next) => {
    try {
      const draft = profileUpdateSchema.parse(request.body);
      response.json({
        success: true,
        ...(await updatePatientProfile(request.authUser!, draft)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.patch(
  "/settings",
  requireCapabilities("settings:view"),
  async (request, response, next) => {
    try {
      const draft = hospitalSettingsSchema.parse(request.body);
      response.json({
        success: true,
        ...(await updateHospitalSettings(request.authUser!, draft)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.patch(
  "/prescriptions/:prescriptionId/status",
  requireCapabilities("prescription:dispense"),
  requireVerifiedEmail,
  async (request, response, next) => {
    try {
      const { status } = prescriptionStatusSchema.parse(request.body);
      const prescriptionId = getRouteParam(request.params.prescriptionId);
      response.json({
        success: true,
        ...(await dispensePrescription(request.authUser!, prescriptionId, status)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.patch(
  "/appointments/:appointmentId",
  requireCapabilities("appointment:update"),
  async (request, response, next) => {
    try {
      const draft = appointmentDraftSchema.parse(request.body);
      const appointmentId = getRouteParam(request.params.appointmentId);
      response.json({
        success: true,
        ...(await updateAppointment(request.authUser!, appointmentId, draft)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.patch(
  "/appointments/:appointmentId/status",
  async (request, response, next) => {
    try {
      const { status } = appointmentStatusSchema.parse(request.body);
      const appointmentId = getRouteParam(request.params.appointmentId);
      response.json({
        success: true,
        ...(await setAppointmentStatus(request.authUser!, appointmentId, status)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.post(
  "/lab-requests",
  requireCapabilities("lab-request:create"),
  async (request, response, next) => {
    try {
      const draft = labRequestDraftSchema.parse(request.body);
      response.status(201).json({
        success: true,
        ...(await createLabRequest(request.authUser!, draft)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.get("/lab-requests", async (request, response, next) => {
  try {
    response.json({
      success: true,
      ...(await getLabRequestsForUser(request.authUser!)),
    });
  } catch (error) {
    next(error);
  }
});

hospitalRouter.get("/lab-reports/:labReportId", async (request, response, next) => {
  try {
    const labReportId = getRouteParam(request.params.labReportId);
    response.json({
      success: true,
      ...(await getLabReportForUser(request.authUser!, labReportId)),
    });
  } catch (error) {
    next(error);
  }
});

hospitalRouter.patch(
  "/lab-requests/:labRequestId/status",
  requireCapabilities("lab-request:update"),
  requireVerifiedEmail,
  async (request, response, next) => {
    try {
      const { status } = labRequestStatusSchema.parse(request.body);
      const labRequestId = getRouteParam(request.params.labRequestId);
      response.json({
        success: true,
        ...(await updateLabRequestStatus(request.authUser!, labRequestId, status)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.post(
  "/lab-requests/:labRequestId/report",
  requireCapabilities("lab-report:create"),
  requireVerifiedEmail,
  async (request, response, next) => {
    try {
      const draft = labReportDraftSchema.parse(request.body);
      const labRequestId = getRouteParam(request.params.labRequestId);
      response.status(201).json({
        success: true,
        ...(await createLabReport(request.authUser!, labRequestId, draft)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.patch(
  "/queue/:queueEntryId/status",
  requireCapabilities("queue:update"),
  async (request, response, next) => {
    try {
      const { status } = queueStatusSchema.parse(request.body);
      const queueEntryId = getRouteParam(request.params.queueEntryId);
      response.json({
        success: true,
        ...(await advanceQueue(request.authUser!, queueEntryId, status)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.post(
  "/departments",
  requireCapabilities("user:manage"),
  async (request, response, next) => {
    try {
      const draft = departmentDraftSchema.parse(request.body);
      response.status(201).json({
        success: true,
        ...(await createDepartment(request.authUser!, draft)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.post(
  "/staff",
  requireCapabilities("user:manage"),
  async (request, response, next) => {
    try {
      const draft = staffDraftSchema.parse(request.body);
      response.status(201).json({
        success: true,
        ...(await createStaffMember(request.authUser!, draft)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.patch(
  "/users/:userId/account-status",
  requireCapabilities("user:manage"),
  async (request, response, next) => {
    try {
      const { status } = accountStatusSchema.parse(request.body);
      const userId = getRouteParam(request.params.userId);
      response.json({
        success: true,
        ...(await updateUserAccountStatus(request.authUser!, userId, status)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.get(
  "/audit-logs",
  requireCapabilities("reports:view"),
  async (request, response, next) => {
    try {
      response.json({
        success: true,
        auditLogs: await getAuditLogs(request.authUser!.organizationId),
      });
    } catch (error) {
      next(error);
    }
  },
);

export { hospitalRouter };
