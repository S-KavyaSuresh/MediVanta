import { Router } from "express";
import { z } from "zod";

import {
  advanceQueue,
  createAppointment,
  createDepartment,
  createLabRequest,
  createStaffMember,
  getLabRequestsForUser,
  getScopedHospitalStateForUser,
  setAppointmentStatus,
  updateAppointment,
} from "../services/hospital-service.js";
import { requireAuthenticatedUser, requireCapabilities } from "../middleware/auth.js";

const hospitalRouter = Router();

const appointmentDraftSchema = z.object({
  patientName: z.string(),
  doctorId: z.string(),
  appointmentDate: z.string(),
  appointmentTime: z.string(),
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

function getRouteParam(param: string | string[]) {
  return Array.isArray(param) ? param[0] : param;
}

hospitalRouter.use(requireAuthenticatedUser);

hospitalRouter.get("/state", async (request, response, next) => {
  try {
    response.json({
      success: true,
      ...(await getScopedHospitalStateForUser(request.authUser!)),
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

export { hospitalRouter };
