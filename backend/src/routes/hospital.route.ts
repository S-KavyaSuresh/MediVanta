import { Router } from "express";
import { z } from "zod";

import {
  advanceQueue,
  createAppointment,
  createClinicalAttachment,
  createInventoryBatch,
  createHospitalBranch,
  createDepartment,
  createEmergencyVisitForOperations,
  createFamilyMember,
  createLabReport,
  createLabRequest,
  createMedicalRecord,
  createMedicalHistoryEntry,
  createPatientProfile,
  createPrescription,
  createStaffMember,
  dispensePrescription,
  getAdminBillingDayDetails,
  getAdminBillingDaySummaries,
  getAdminBillingInvoice,
  getAdminEmergencyActivity,
  getFamilyMembers,
  getConversationSignals,
  getDoctorHandoffSummary,
  getDoctorHistory,
  getLabReportForUser,
  getLabRequestsForUser,
  getJourneyByToken,
  loadScopedNotificationsForUser,
  getOperationalAnalytics,
  listHospitalBranches,
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
  updateDoctorBranch,
  updateHospitalBranch,
  updateUserAccountStatus,
  updateHospitalSettings,
  updateInventoryBatch,
  updateMedicalRecord,
  updatePrescription,
  updatePatientProfile,
  updateLabRequestStatus,
  updateQueuePriority,
  updateAppointment,
} from "../services/hospital-service.js";
import { getAuditLogs } from "../services/audit-service.js";
import {
  createPurchaseOrder,
  createSupplier,
  getDoctorRatingSummary,
  listPatientDoctorRatings,
  listPurchaseOrders,
  listSuppliers,
  receivePurchaseOrder,
  updateInvoiceAdjustments,
  updatePurchaseOrder,
  updateSupplier,
  upsertDoctorRating,
} from "../services/operations-extensions-service.js";
import { getCapabilitiesForRole, landingPathByRole } from "../auth/permissions.js";
import {
  requireAuthenticatedUser,
  requireCapabilities,
  requireVerifiedEmail,
} from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limit.js";

const hospitalRouter = Router();

const appointmentDraftSchema = z.object({
  patientName: z.string(),
  familyMemberId: z.string().optional(),
  branchId: z.string().optional(),
  doctorId: z.string(),
  appointmentDate: z.string(),
  appointmentTime: z.string(),
  reasonForAppointment: z.string(),
  consultationMode: z.enum(["In Person", "Online"]).default("In Person"),
  paymentMethod: z
    .enum(["UPI", "Credit Card", "Debit Card", "Net Banking"])
    .optional(),
  paymentReferenceNumber: z.string().optional(),
});

const appointmentStatusSchema = z.object({
  status: z.enum(["Scheduled", "Checked in", "In consultation", "Completed", "Cancelled", "No Show"]),
});

const queueStatusSchema = z.object({
  status: z.enum(["Waiting", "Called", "In consultation", "Completed"]),
});

const queuePrioritySchema = z.object({
  priority: z.enum(["Normal", "Priority", "Emergency"]),
});

const departmentDraftSchema = z.object({
  code: z.string(),
  name: z.string(),
  description: z.string(),
  status: z.enum(["Operational", "Busy", "Limited", "Emergency priority"]),
  location: z.string(),
});

const branchDraftSchema = z.object({
  code: z.string().optional(),
  name: z.string(),
  address: z.string(),
  city: z.string(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  active: z.boolean().optional(),
});

const branchQuerySchema = z.object({
  q: z.string().optional(),
  status: z.preprocess((value) => {
    if (typeof value !== "string" || !value.trim()) {
      return "All";
    }

    const normalized = value.trim().toLowerCase();
    if (normalized === "active") {
      return "Active";
    }
    if (normalized === "inactive") {
      return "Inactive";
    }
    if (normalized === "all") {
      return "All";
    }
    return value;
  }, z.enum(["All", "Active", "Inactive"])).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

const doctorBranchDraftSchema = z.object({
  branchId: z.string().optional(),
});

const staffDraftSchema = z.object({
  displayName: z.string(),
  email: z.string(),
  temporaryPassword: z.string(),
  role: z.enum(["doctor", "receptionist", "laboratory", "pharmacist", "administrator"]),
  departmentId: z.string().optional(),
  branchId: z.string().optional(),
  specialization: z.string().optional(),
  consultationFee: z.string().optional(),
  status: z.string(),
});

const labRequestDraftSchema = z.object({
  patientId: z.string().optional(),
  appointmentId: z.string().optional(),
  testId: z.string(),
  requestedDate: z.string(),
  requestedTime: z.string(),
  familyMemberId: z.string().optional(),
  clinicalNotes: z.string().optional(),
});

const labRequestStatusSchema = z.object({
  status: z.enum(["Requested", "Scheduled", "Sample Collected", "Processing", "Missed"]),
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
  method: z.enum([
    "Cash",
    "Card",
    "Credit Card",
    "Debit Card",
    "UPI",
    "Net Banking",
    "Bank Transfer",
    "Demo Payment",
  ]),
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

const supplierDraftSchema = z.object({
  supplierName: z.string(),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  status: z.enum(["Active", "Inactive"]).optional(),
});

const supplierUpdateSchema = supplierDraftSchema.extend({
  status: z.enum(["Active", "Inactive"]),
});

const supplierListQuerySchema = z.object({
  query: z.string().optional(),
  status: z.enum(["All", "Active", "Inactive"]).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

const purchaseOrderItemSchema = z.object({
  medicineId: z.string(),
  medicineName: z.string(),
  quantity: z.number().int().positive(),
  unitCost: z.number().nonnegative(),
});

const purchaseOrderDraftSchema = z.object({
  supplierId: z.string(),
  orderDate: z.string(),
  expectedDate: z.string().optional(),
  status: z.enum(["Draft", "Ordered"]),
  notes: z.string().optional(),
  items: z.array(purchaseOrderItemSchema),
});

const purchaseOrderUpdateSchema = purchaseOrderDraftSchema.extend({
  status: z.enum(["Draft", "Ordered", "Cancelled"]),
});

const purchaseOrderListQuerySchema = z.object({
  query: z.string().optional(),
  status: z.enum(["All", "Draft", "Ordered", "Received", "Cancelled"]).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

const purchaseOrderReceiveSchema = z.object({
  items: z.array(
    z.object({
      purchaseOrderItemId: z.string(),
      receivedQuantity: z.number().int().positive(),
      receivedUnitCost: z.number().nonnegative(),
      batchNumber: z.string(),
      expiryDate: z.string(),
    }),
  ),
});

const invoiceAdjustmentSchema = z.object({
  discount: z.number().nonnegative(),
  discountType: z.enum(["Amount", "Percentage"]).default("Amount"),
  tax: z.number().nonnegative(),
  taxType: z.enum(["Amount", "Percentage"]).default("Amount"),
});

const doctorRatingDraftSchema = z.object({
  appointmentId: z.string(),
  rating: z.number().int().min(1).max(5),
  reviewComment: z.string().optional(),
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
  totalBeds: z.number().int(),
  occupiedBeds: z.number().int(),
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
  patientId: z.string().optional(),
  category: z.enum(["Vaccination", "Surgery"]),
  title: z.string(),
  details: z.string().optional(),
  recordedDate: z.string(),
  familyMemberId: z.string().optional(),
});

const clinicalAttachmentDraftSchema = z.object({
  patientId: z.string().optional(),
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

const analyticsQuerySchema = z.object({
  scope: z.enum(["today", "7d", "30d"]).default("today"),
});

const adminBillingDaySummaryQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(31).default(10),
  sort: z
    .enum(["newest", "oldest", "highest-revenue", "highest-outstanding", "most-invoices"])
    .default("newest"),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

const adminBillingDayDetailQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(["newest", "oldest", "highest-total", "highest-due"]).default("newest"),
  q: z.string().optional(),
  paymentStatus: z
    .enum(["All", "Pending", "Partially Paid", "Paid", "Cancelled"])
    .default("All"),
  sourceType: z
    .enum(["All", "appointment", "lab-request", "prescription", "other"])
    .default("All"),
});

const adminEmergencyActivityQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  sort: z.enum(["newest", "oldest"]).default("newest"),
  severity: z.enum(["All", "Priority", "Emergency"]).default("All"),
  status: z.enum(["All", "Active", "In consultation", "Transferred", "Completed"]).default("All"),
  q: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

const journeyQuerySchema = z.object({
  token: z.string().min(1),
});

const handoffQuerySchema = z.object({
  appointmentId: z.string().optional(),
  patientId: z.string().optional(),
});

const emergencyVisitDraftSchema = z.object({
  patientId: z.string().optional(),
  familyMemberId: z.string().optional(),
  patientName: z.string().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  emergencyReason: z.string(),
  severity: z.enum(["Priority", "Emergency"]),
  allergies: z.string().optional(),
  medicalConditions: z.string().optional(),
  bloodGroup: z.string().optional(),
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

hospitalRouter.get(
  "/analytics",
  requireCapabilities("reports:view"),
  async (request, response, next) => {
    try {
      const { scope } = analyticsQuerySchema.parse(request.query);
      response.json({
        success: true,
        ...(await getOperationalAnalytics(request.authUser!, scope)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.get(
  "/admin/analytics",
  requireCapabilities("reports:view"),
  async (request, response, next) => {
    try {
      const { scope } = analyticsQuerySchema.parse(request.query);
      response.json({
        success: true,
        ...(await getOperationalAnalytics(request.authUser!, scope)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.get(
  "/branches",
  requireCapabilities("branch:view"),
  async (request, response, next) => {
    try {
      const query = branchQuerySchema.parse(request.query);
      response.json({
        success: true,
        ...(await listHospitalBranches(request.authUser!, {
          query: query.q,
          status: query.status,
          page: query.page,
          pageSize: query.pageSize,
        })),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.post(
  "/branches",
  rateLimit({ key: "branch-create", limit: 30, windowMs: 60_000 }),
  requireVerifiedEmail,
  requireCapabilities("branch:manage"),
  async (request, response, next) => {
    try {
      const draft = branchDraftSchema.parse(request.body);
      response.status(201).json({
        success: true,
        ...(await createHospitalBranch(request.authUser!, draft)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.patch(
  "/branches/:branchId",
  rateLimit({ key: "branch-update", limit: 60, windowMs: 60_000 }),
  requireVerifiedEmail,
  requireCapabilities("branch:manage"),
  async (request, response, next) => {
    try {
      const branchId = getRouteParam(request.params.branchId);
      const draft = branchDraftSchema.parse(request.body);
      response.json({
        success: true,
        ...(await updateHospitalBranch(request.authUser!, branchId, draft)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.patch(
  "/doctors/:doctorId/branch",
  rateLimit({ key: "doctor-branch-update", limit: 60, windowMs: 60_000 }),
  requireVerifiedEmail,
  requireCapabilities("branch:manage"),
  async (request, response, next) => {
    try {
      const doctorId = getRouteParam(request.params.doctorId);
      const draft = doctorBranchDraftSchema.parse(request.body);
      response.json({
        success: true,
        ...(await updateDoctorBranch(request.authUser!, doctorId, draft.branchId)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.get(
  "/admin/emergency-visits",
  requireCapabilities("operations:view"),
  async (request, response, next) => {
    try {
      const query = adminEmergencyActivityQuerySchema.parse(request.query);
      response.json({
        success: true,
        ...(await getAdminEmergencyActivity(request.authUser!, {
          page: query.page,
          pageSize: query.pageSize,
          sort: query.sort,
          severity: query.severity,
          status: query.status,
          queryText: query.q,
          dateFrom: query.dateFrom,
          dateTo: query.dateTo,
        })),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.get(
  "/admin/billing/days",
  requireCapabilities("billing:view"),
  async (request, response, next) => {
    try {
      const query = adminBillingDaySummaryQuerySchema.parse(request.query);
      response.json({
        success: true,
        ...(await getAdminBillingDaySummaries(request.authUser!, query)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.get(
  "/admin/billing/days/:billingDate",
  requireCapabilities("billing:view"),
  async (request, response, next) => {
    try {
      const billingDate = getRouteParam(request.params.billingDate);

      if (!/^\d{4}-\d{2}-\d{2}$/.test(billingDate)) {
        throw new Error("Invalid billing date.");
      }

      const query = adminBillingDayDetailQuerySchema.parse(request.query);
      response.json({
        success: true,
        ...(await getAdminBillingDayDetails(request.authUser!, {
          billingDate,
          page: query.page,
          pageSize: query.pageSize,
          sort: query.sort,
          queryText: query.q,
          paymentStatus: query.paymentStatus,
          sourceType: query.sourceType,
        })),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.get(
  "/admin/billing/invoices/:invoiceId",
  requireCapabilities("billing:view"),
  async (request, response, next) => {
    try {
      const invoiceId = getRouteParam(request.params.invoiceId);
      response.json({
        success: true,
        ...(await getAdminBillingInvoice(request.authUser!, invoiceId)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.get(
  "/journeys",
  async (request, response, next) => {
    try {
      const { token } = journeyQuerySchema.parse(request.query);
      response.json({
        success: true,
        ...(await getJourneyByToken(request.authUser!, token)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.get(
  "/handoff",
  requireCapabilities("health-records:view"),
  async (request, response, next) => {
    try {
      const query = handoffQuerySchema.parse(request.query);
      response.json({
        success: true,
        ...(await getDoctorHandoffSummary(request.authUser!, query)),
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
  "/emergency-visits",
  requireCapabilities("operations:view"),
  async (request, response, next) => {
    try {
      const draft = emergencyVisitDraftSchema.parse(request.body);
      response.status(201).json({
        success: true,
        ...(await createEmergencyVisitForOperations(request.authUser!, draft)),
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
  rateLimit({ key: "clinical-attachment-upload", limit: 30, windowMs: 60_000 }),
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
  rateLimit({ key: "invoice-payment", limit: 60, windowMs: 60_000 }),
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

hospitalRouter.patch(
  "/invoices/:invoiceId/adjustments",
  requireCapabilities("billing:manage"),
  requireVerifiedEmail,
  async (request, response, next) => {
    try {
      const draft = invoiceAdjustmentSchema.parse(request.body);
      const invoiceId = getRouteParam(request.params.invoiceId);
      response.json({
        success: true,
        ...(await updateInvoiceAdjustments(request.authUser!, invoiceId, draft)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.get(
  "/suppliers",
  requireCapabilities("supplier:view"),
  async (request, response, next) => {
    try {
      const query = supplierListQuerySchema.parse(request.query);
      response.json({
        success: true,
        ...(await listSuppliers(request.authUser!, query)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.post(
  "/suppliers",
  rateLimit({ key: "supplier-create", limit: 40, windowMs: 60_000 }),
  requireCapabilities("supplier:manage"),
  requireVerifiedEmail,
  async (request, response, next) => {
    try {
      const draft = supplierDraftSchema.parse(request.body);
      response.status(201).json({
        success: true,
        ...(await createSupplier(request.authUser!, draft)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.patch(
  "/suppliers/:supplierId",
  rateLimit({ key: "supplier-update", limit: 80, windowMs: 60_000 }),
  requireCapabilities("supplier:manage"),
  requireVerifiedEmail,
  async (request, response, next) => {
    try {
      const draft = supplierUpdateSchema.parse(request.body);
      const supplierId = getRouteParam(request.params.supplierId);
      response.json({
        success: true,
        ...(await updateSupplier(request.authUser!, supplierId, draft)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.get(
  "/purchase-orders",
  requireCapabilities("purchase-order:view"),
  async (request, response, next) => {
    try {
      const query = purchaseOrderListQuerySchema.parse(request.query);
      response.json({
        success: true,
        ...(await listPurchaseOrders(request.authUser!, query)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.post(
  "/purchase-orders",
  rateLimit({ key: "purchase-order-create", limit: 40, windowMs: 60_000 }),
  requireCapabilities("purchase-order:manage"),
  requireVerifiedEmail,
  async (request, response, next) => {
    try {
      const draft = purchaseOrderDraftSchema.parse(request.body);
      response.status(201).json({
        success: true,
        ...(await createPurchaseOrder(request.authUser!, draft)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.patch(
  "/purchase-orders/:purchaseOrderId",
  rateLimit({ key: "purchase-order-update", limit: 80, windowMs: 60_000 }),
  requireCapabilities("purchase-order:manage"),
  requireVerifiedEmail,
  async (request, response, next) => {
    try {
      const draft = purchaseOrderUpdateSchema.parse(request.body);
      const purchaseOrderId = getRouteParam(request.params.purchaseOrderId);
      response.json({
        success: true,
        ...(await updatePurchaseOrder(request.authUser!, purchaseOrderId, draft)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.post(
  "/purchase-orders/:purchaseOrderId/receive",
  rateLimit({ key: "purchase-order-receive", limit: 40, windowMs: 60_000 }),
  requireCapabilities("purchase-order:manage"),
  requireVerifiedEmail,
  async (request, response, next) => {
    try {
      const draft = purchaseOrderReceiveSchema.parse(request.body);
      const purchaseOrderId = getRouteParam(request.params.purchaseOrderId);
      response.status(201).json({
        success: true,
        ...(await receivePurchaseOrder(request.authUser!, purchaseOrderId, draft)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.post(
  "/inventory-items",
  rateLimit({ key: "inventory-create", limit: 60, windowMs: 60_000 }),
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
  rateLimit({ key: "inventory-update", limit: 90, windowMs: 60_000 }),
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

hospitalRouter.get(
  "/doctor-ratings/mine",
  requireCapabilities("doctor-rating:create"),
  async (request, response, next) => {
    try {
      response.json({
        success: true,
        ...(await listPatientDoctorRatings(request.authUser!)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.get(
  "/doctors/:doctorId/rating-summary",
  requireAuthenticatedUser,
  async (request, response, next) => {
    try {
      const doctorId = getRouteParam(request.params.doctorId);
      response.json({
        success: true,
        ...(await getDoctorRatingSummary(request.authUser!, doctorId)),
      });
    } catch (error) {
      next(error);
    }
  },
);

hospitalRouter.post(
  "/doctor-ratings",
  rateLimit({ key: "doctor-rating", limit: 40, windowMs: 60_000 }),
  requireCapabilities("doctor-rating:create"),
  requireVerifiedEmail,
  async (request, response, next) => {
    try {
      const draft = doctorRatingDraftSchema.parse(request.body);
      response.status(201).json({
        success: true,
        ...(await upsertDoctorRating(request.authUser!, draft)),
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

hospitalRouter.get(
  "/notifications/stream",
  requireCapabilities("notifications:view"),
  async (request, response) => {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    response.write(": connected\n\n");

    let closed = false;
    let lastPayload = "";

    const sendNotifications = async () => {
      if (closed) {
        return;
      }

      try {
        const notifications = await loadScopedNotificationsForUser(request.authUser!);
        const payload = JSON.stringify({ notifications });

        if (payload !== lastPayload) {
          response.write("event: notifications\n");
          response.write(`data: ${payload}\n\n`);
          lastPayload = payload;
        }
      } catch {
        response.write("event: error\n");
        response.write('data: {"message":"Notifications are not available right now."}\n\n');
      }
    };

    await sendNotifications();
    const interval = setInterval(() => {
      void sendNotifications();
    }, 5000);
    const heartbeat = setInterval(() => {
      if (!closed) {
        response.write(": heartbeat\n\n");
      }
    }, 15000);

    request.on("close", () => {
      closed = true;
      clearInterval(interval);
      clearInterval(heartbeat);
      if (!response.destroyed) {
        response.end();
      }
    });
  },
);

hospitalRouter.post(
  "/notifications/read-all",
  rateLimit({ key: "notifications-read-all", limit: 60, windowMs: 60_000 }),
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
  rateLimit({ key: "telemedicine-join", limit: 40, windowMs: 60_000 }),
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
  rateLimit({ key: "telemedicine-message", limit: 120, windowMs: 60_000 }),
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
  rateLimit({ key: "telemedicine-signal", limit: 240, windowMs: 60_000 }),
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

hospitalRouter.patch(
  "/queue/:queueEntryId/priority",
  requireCapabilities("queue:update"),
  async (request, response, next) => {
    try {
      const { priority } = queuePrioritySchema.parse(request.body);
      const queueEntryId = getRouteParam(request.params.queueEntryId);
      response.json({
        success: true,
        ...(await updateQueuePriority(request.authUser!, queueEntryId, priority)),
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
