import { Router } from "express";
import { z } from "zod";

import {
  advanceQueue,
  createAppointment,
  createClinicalAttachment,
  createInventoryBatch,
  createDepartment,
  createFamilyMember,
  createLabReport,
  createLabRequest,
  createMedicalRecord,
  createMedicalHistoryEntry,
  createPatientProfile,
  createPrescription,
  createStaffMember,
  dispensePrescription,
  getFamilyMembers,
  getConversationSignals,
  getDoctorHistory,
  getLabReportForUser,
  getLabRequestsForUser,
  getScopedHospitalStateForUser,
  getTelemedicineMessages,
  getTelemedicineSessionForAppointment,
  joinTelemedicineSession,
  markAllUserNotificationsRead,
  markNotificationAsRead,
  recordInvoicePayment,
  searchHospitalWorkspaceScoped,
  sendTelemedicineMessage,
  sendTelemedicineSignal,
  setAppointmentStatus,
  setTelemedicineSessionStatus,
  unlinkFamilyMember,
  updateFamilyMember,
  updateUserAccountStatus,
  updateHospitalSettings,
  updateInventoryBatch,
  updateMedicalRecord,
  updatePrescription,
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
  familyMemberId: z.string().optional(),
  doctorId: z.string(),
  appointmentDate: z.string(),
  appointmentTime: z.string(),
  reasonForAppointment: z.string(),
  consultationMode: z.enum(["In Person", "Online"]).default("In Person"),
});

const appointmentStatusSchema = z.object({
  status: z.enum(["Scheduled", "Checked in", "In consultation", "Completed", "Cancelled", "No Show"]),
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
  familyMemberId: z.string().optional(),
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
  familyMemberId: z.string().optional(),
  instructions: z.string(),
  followUpDate: z.string().optional(),
  medicines: z.array(
    z.object({
      medicineId: z.string().optional(),
      medicineName: z.string(),
      strength: z.string().optional(),
      doseQuantity: z.number().positive().optional(),
      doseUnit: z.string().optional(),
      dosage: z.string(),
      frequency: z.string(),
      durationValue: z.number().int().positive().optional(),
      durationUnit: z.string().optional(),
      duration: z.string(),
      totalQuantity: z.number().int().positive().optional(),
      instructions: z.string().optional(),
    }),
  ),
});

const prescriptionStatusSchema = z.object({
  status: z.enum(["Issued", "Dispensed"]),
});

const paymentDraftSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(["Cash", "Card", "UPI", "Bank Transfer", "Demo Payment"]),
  referenceNumber: z.string().optional(),
});

const inventoryDraftSchema = z.object({
  medicineName: z.string(),
  genericName: z.string().optional(),
  batchNumber: z.string(),
  quantityInStock: z.number().int(),
  unit: z.string(),
  unitPrice: z.number().nonnegative(),
  expiryDate: z.string(),
  reorderLevel: z.number().int().nonnegative(),
  manufacturer: z.string().optional(),
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

const familyMemberDraftSchema = z.object({
  fullName: z.string(),
  relationship: z.string(),
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  bloodGroup: z.string().optional(),
  phoneNumber: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  allergies: z.string().optional(),
  medicalConditions: z.string().optional(),
  preferredLanguage: z.string().optional(),
});

const medicalHistoryDraftSchema = z.object({
  category: z.enum(["Vaccination", "Surgery"]),
  title: z.string(),
  details: z.string().optional(),
  recordedDate: z.string(),
  familyMemberId: z.string().optional(),
});

const clinicalAttachmentDraftSchema = z.object({
  label: z.string(),
  fileName: z.string(),
  contentType: z.enum(["application/pdf", "image/png", "image/jpeg"]),
  fileSize: z.number().int().positive(),
  contentBase64: z.string(),
  familyMemberId: z.string().optional(),
  medicalRecordId: z.string().optional(),
});

const telemedicineMessageSchema = z.object({
  message: z.string(),
});

const telemedicineSignalSchema = z.object({
  recipientUserId: z.string(),
  signalType: z.enum(["offer", "answer", "ice-candidate", "hangup"]),
  payload: z.string(),
});

const telemedicineStatusSchema = z.object({
  status: z.enum(["Scheduled", "Live", "Ended"]),
});

const searchQuerySchema = z.object({
  q: z.string().default(""),
});

const accountStatusSchema = z.object({
  status: z.enum(["Active", "Deactivated"]),
});

const doctorHistoryQuerySchema = z.object({
  kind: z.enum(["medical-records", "prescriptions"]),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(20).default(10),
  sort: z.enum(["newest", "oldest"]).default("newest"),
  patient: z.string().optional(),
  datePreset: z.enum(["today", "24h", "7d", "30d", "all"]).default("all"),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
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

hospitalRouter.get(
  "/doctor-history",
  requireCapabilities("health-records:create"),
  requireVerifiedEmail,
  async (request, response, next) => {
    try {
      const queryParams = doctorHistoryQuerySchema.parse(request.query);
      response.json({
        success: true,
        ...(await getDoctorHistory(request.authUser!, queryParams)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.get(
  "/search",
  requireCapabilities("search:view"),
  async (request, response, next) => {
    try {
      const { q } = searchQuerySchema.parse(request.query);
      response.json({
        success: true,
        ...(await searchHospitalWorkspaceScoped(request.authUser!, q)),
      });
    } catch (error) {
      next(error);
    }
  },
);

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

hospitalRouter.post(
  "/family-members",
  requireCapabilities("family-member:manage"),
  async (request, response, next) => {
    try {
      const draft = familyMemberDraftSchema.parse(request.body);
      response.status(201).json({
        success: true,
        ...(await createFamilyMember(request.authUser!, draft)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.get(
  "/family-members",
  requireCapabilities("family-member:manage"),
  async (request, response, next) => {
    try {
      response.json({
        success: true,
        ...(await getFamilyMembers(request.authUser!)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.patch(
  "/family-members/:familyMemberId",
  requireCapabilities("family-member:manage"),
  async (request, response, next) => {
    try {
      const draft = familyMemberDraftSchema.parse(request.body);
      const familyMemberId = getRouteParam(request.params.familyMemberId);
      response.json({
        success: true,
        ...(await updateFamilyMember(request.authUser!, familyMemberId, draft)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.delete(
  "/family-members/:familyMemberId",
  requireCapabilities("family-member:manage"),
  async (request, response, next) => {
    try {
      const familyMemberId = getRouteParam(request.params.familyMemberId);
      response.json({
        success: true,
        ...(await unlinkFamilyMember(request.authUser!, familyMemberId)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.post(
  "/medical-history",
  requireCapabilities("medical-history:create"),
  async (request, response, next) => {
    try {
      const draft = medicalHistoryDraftSchema.parse(request.body);
      response.status(201).json({
        success: true,
        ...(await createMedicalHistoryEntry(request.authUser!, draft)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.post(
  "/clinical-attachments",
  requireCapabilities("clinical-attachment:create"),
  async (request, response, next) => {
    try {
      const draft = clinicalAttachmentDraftSchema.parse(request.body);
      response.status(201).json({
        success: true,
        ...(await createClinicalAttachment(request.authUser!, draft)),
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
  "/prescriptions/:prescriptionId",
  requireCapabilities("prescription:create"),
  requireVerifiedEmail,
  async (request, response, next) => {
    try {
      const draft = prescriptionDraftSchema.parse(request.body);
      const prescriptionId = getRouteParam(request.params.prescriptionId);
      response.json({
        success: true,
        ...(await updatePrescription(request.authUser!, prescriptionId, draft)),
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

hospitalRouter.post(
  "/invoices/:invoiceId/payments",
  async (request, response, next) => {
    try {
      const draft = paymentDraftSchema.parse(request.body);
      const invoiceId = getRouteParam(request.params.invoiceId);
      response.status(201).json({
        success: true,
        ...(await recordInvoicePayment(request.authUser!, invoiceId, draft)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.post(
  "/inventory-items",
  requireCapabilities("inventory:manage"),
  requireVerifiedEmail,
  async (request, response, next) => {
    try {
      const draft = inventoryDraftSchema.parse(request.body);
      response.status(201).json({
        success: true,
        ...(await createInventoryBatch(request.authUser!, draft)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.patch(
  "/inventory-items/:inventoryItemId",
  requireCapabilities("inventory:manage"),
  requireVerifiedEmail,
  async (request, response, next) => {
    try {
      const draft = inventoryDraftSchema.parse(request.body);
      const inventoryItemId = getRouteParam(request.params.inventoryItemId);
      response.json({
        success: true,
        ...(await updateInventoryBatch(request.authUser!, inventoryItemId, draft)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.patch(
  "/notifications/:notificationId/read",
  requireCapabilities("notifications:view"),
  async (request, response, next) => {
    try {
      const notificationId = getRouteParam(request.params.notificationId);
      response.json({
        success: true,
        ...(await markNotificationAsRead(request.authUser!, notificationId)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.post(
  "/notifications/read-all",
  requireCapabilities("notifications:view"),
  async (request, response, next) => {
    try {
      response.json({
        success: true,
        ...(await markAllUserNotificationsRead(request.authUser!)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.get(
  "/telemedicine/appointments/:appointmentId",
  requireCapabilities("telemedicine:join"),
  async (request, response, next) => {
    try {
      const appointmentId = getRouteParam(request.params.appointmentId);
      response.json({
        success: true,
        ...(await getTelemedicineSessionForAppointment(request.authUser!, appointmentId)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.post(
  "/telemedicine/appointments/:appointmentId/join",
  requireCapabilities("telemedicine:join"),
  async (request, response, next) => {
    try {
      const appointmentId = getRouteParam(request.params.appointmentId);
      response.json({
        success: true,
        ...(await joinTelemedicineSession(request.authUser!, appointmentId)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.get(
  "/telemedicine/sessions/:sessionId/messages",
  requireCapabilities("telemedicine:join"),
  async (request, response, next) => {
    try {
      const sessionId = getRouteParam(request.params.sessionId);
      response.json({
        success: true,
        ...(await getTelemedicineMessages(request.authUser!, sessionId)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.post(
  "/telemedicine/sessions/:sessionId/messages",
  requireCapabilities("telemedicine:join"),
  async (request, response, next) => {
    try {
      const { message } = telemedicineMessageSchema.parse(request.body);
      const sessionId = getRouteParam(request.params.sessionId);
      response.status(201).json({
        success: true,
        ...(await sendTelemedicineMessage(request.authUser!, sessionId, message)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.get(
  "/telemedicine/sessions/:sessionId/signals",
  requireCapabilities("telemedicine:join"),
  async (request, response, next) => {
    try {
      const sessionId = getRouteParam(request.params.sessionId);
      const since = typeof request.query.since === "string" ? request.query.since : undefined;
      response.json({
        success: true,
        ...(await getConversationSignals(request.authUser!, sessionId, since)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.post(
  "/telemedicine/sessions/:sessionId/signals",
  requireCapabilities("telemedicine:join"),
  async (request, response, next) => {
    try {
      const draft = telemedicineSignalSchema.parse(request.body);
      const sessionId = getRouteParam(request.params.sessionId);
      response.status(201).json({
        success: true,
        ...(await sendTelemedicineSignal(request.authUser!, sessionId, draft)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.patch(
  "/telemedicine/sessions/:sessionId/status",
  requireCapabilities("telemedicine:join"),
  async (request, response, next) => {
    try {
      const { status } = telemedicineStatusSchema.parse(request.body);
      const sessionId = getRouteParam(request.params.sessionId);
      response.json({
        success: true,
        ...(await setTelemedicineSessionStatus(request.authUser!, sessionId, status)),
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
