export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "MediVanta API",
    version: "0.1.0",
    description: "API documentation for authentication, hospital operations, clinical workflows, billing, procurement, and patient journey endpoints.",
  },
  servers: [
    {
      url: "http://localhost:4000",
      description: "Local backend server",
    },
  ],
  components: {
    securitySchemes: {
      sessionCookie: {
        type: "apiKey",
        in: "cookie",
        name: "medivanta_access",
      },
    },
  },
  security: [{ sessionCookie: [] }],
  tags: [
    { name: "Authentication" },
    { name: "Patients" },
    { name: "Family Members" },
    { name: "Appointments" },
    { name: "Queue/Emergency" },
    { name: "Doctors" },
    { name: "Medical Records/EMR" },
    { name: "Prescriptions" },
    { name: "Laboratory" },
    { name: "Pharmacy/Inventory" },
    { name: "Suppliers" },
    { name: "Purchase Orders" },
    { name: "Billing/Payments" },
    { name: "Notifications" },
    { name: "Search" },
    { name: "Admin" },
    { name: "Telemedicine/Journey" },
  ],
  paths: {
    "/api/auth/login": {
      post: {
        tags: ["Authentication"],
        summary: "Sign in with email and password",
      },
    },
    "/api/auth/logout": {
      post: {
        tags: ["Authentication"],
        summary: "Sign out and clear the active session",
      },
    },
    "/api/auth/register": {
      post: {
        tags: ["Authentication", "Patients"],
        summary: "Create a patient account",
      },
    },
    "/api/auth/verify-email": {
      post: {
        tags: ["Authentication"],
        summary: "Confirm email verification with the current verification code",
      },
    },
    "/api/auth/forgot-password": {
      post: {
        tags: ["Authentication"],
        summary: "Request a password reset token and code",
      },
    },
    "/api/auth/reset-password": {
      post: {
        tags: ["Authentication"],
        summary: "Reset a password using the active reset token and code",
      },
    },
    "/api/auth/me": {
      get: {
        tags: ["Authentication"],
        summary: "Return the current authenticated session",
      },
    },
    "/api/hospital/state": {
      get: {
        tags: ["Admin", "Patients", "Doctors", "Laboratory", "Pharmacy/Inventory", "Notifications"],
        summary: "Load the authenticated hospital workspace state",
      },
    },
    "/api/hospital/search": {
      get: {
        tags: ["Search"],
        summary: "Search the authenticated hospital workspace with role scoping",
      },
    },
    "/api/hospital/appointments": {
      post: {
        tags: ["Appointments"],
        summary: "Create an appointment in the authenticated workspace",
      },
    },
    "/api/hospital/appointments/{appointmentId}": {
      patch: {
        tags: ["Appointments"],
        summary: "Update an existing appointment",
      },
    },
    "/api/hospital/appointments/{appointmentId}/status": {
      patch: {
        tags: ["Appointments", "Queue/Emergency"],
        summary: "Update appointment workflow status",
      },
    },
    "/api/hospital/queue/{queueEntryId}/status": {
      patch: {
        tags: ["Queue/Emergency"],
        summary: "Advance queue workflow for a queue entry",
      },
    },
    "/api/hospital/queue/{queueEntryId}/priority": {
      patch: {
        tags: ["Queue/Emergency"],
        summary: "Update queue priority for reception or operations",
      },
    },
    "/api/hospital/admin/emergency-visits": {
      get: {
        tags: ["Queue/Emergency", "Admin"],
        summary: "Load the current emergency operations activity view",
      },
      post: {
        tags: ["Queue/Emergency", "Admin"],
        summary: "Create an operational emergency visit",
      },
    },
    "/api/hospital/medical-records": {
      post: {
        tags: ["Medical Records/EMR"],
        summary: "Create a clinical medical record",
      },
    },
    "/api/hospital/medical-records/{recordId}": {
      patch: {
        tags: ["Medical Records/EMR"],
        summary: "Update an existing medical record",
      },
    },
    "/api/hospital/medical-history": {
      post: {
        tags: ["Medical Records/EMR"],
        summary: "Create a structured medical history entry",
      },
    },
    "/api/hospital/clinical-attachments": {
      post: {
        tags: ["Medical Records/EMR"],
        summary: "Upload a clinical attachment for an authorized patient context",
      },
    },
    "/api/hospital/prescriptions": {
      post: {
        tags: ["Prescriptions"],
        summary: "Create a structured prescription",
      },
    },
    "/api/hospital/prescriptions/{prescriptionId}": {
      patch: {
        tags: ["Prescriptions"],
        summary: "Update a structured prescription",
      },
    },
    "/api/hospital/prescriptions/{prescriptionId}/status": {
      patch: {
        tags: ["Prescriptions", "Pharmacy/Inventory"],
        summary: "Dispense a prescription",
      },
    },
    "/api/hospital/lab-requests": {
      get: {
        tags: ["Laboratory"],
        summary: "List lab requests scoped to the authenticated role",
      },
      post: {
        tags: ["Laboratory"],
        summary: "Create a lab request from patient, doctor, or staff context",
      },
    },
    "/api/hospital/lab-requests/{labRequestId}/status": {
      patch: {
        tags: ["Laboratory"],
        summary: "Advance a lab request status",
      },
    },
    "/api/hospital/lab-requests/{labRequestId}/report": {
      post: {
        tags: ["Laboratory"],
        summary: "Upload or save a lab report for a lab request",
      },
    },
    "/api/hospital/lab-reports/{labReportId}": {
      get: {
        tags: ["Laboratory"],
        summary: "Load a lab report with role and ownership checks",
      },
    },
    "/api/hospital/invoices/{invoiceId}/payments": {
      post: {
        tags: ["Billing/Payments"],
        summary: "Record an invoice payment",
      },
    },
    "/api/hospital/invoices/{invoiceId}/adjustments": {
      patch: {
        tags: ["Billing/Payments"],
        summary: "Apply discount and tax adjustments to an invoice",
      },
    },
    "/api/hospital/admin/billing/days": {
      get: {
        tags: ["Billing/Payments", "Admin"],
        summary: "Load day-wise billing summaries",
      },
    },
    "/api/hospital/admin/billing/days/{billingDate}": {
      get: {
        tags: ["Billing/Payments", "Admin"],
        summary: "Load the invoice history for a billing date",
      },
    },
    "/api/hospital/admin/billing/invoices/{invoiceId}": {
      get: {
        tags: ["Billing/Payments", "Admin"],
        summary: "Load a single invoice detail for admin review",
      },
    },
    "/api/hospital/notifications/{notificationId}/read": {
      patch: {
        tags: ["Notifications"],
        summary: "Mark one authenticated user notification as read",
      },
    },
    "/api/hospital/notifications/read-all": {
      post: {
        tags: ["Notifications"],
        summary: "Mark all authenticated user notifications as read",
      },
    },
    "/api/hospital/inventory-items": {
      post: {
        tags: ["Pharmacy/Inventory"],
        summary: "Create an inventory batch",
      },
    },
    "/api/hospital/inventory-items/{inventoryItemId}": {
      patch: {
        tags: ["Pharmacy/Inventory"],
        summary: "Update an inventory batch",
      },
    },
    "/api/hospital/suppliers": {
      get: {
        tags: ["Suppliers"],
        summary: "List suppliers with search, filters, and pagination",
      },
      post: {
        tags: ["Suppliers"],
        summary: "Create a supplier",
      },
    },
    "/api/hospital/suppliers/{supplierId}": {
      patch: {
        tags: ["Suppliers"],
        summary: "Update or activate/deactivate a supplier",
      },
    },
    "/api/hospital/purchase-orders": {
      get: {
        tags: ["Purchase Orders"],
        summary: "List purchase orders with item details",
      },
      post: {
        tags: ["Purchase Orders"],
        summary: "Create a draft or ordered purchase order",
      },
    },
    "/api/hospital/purchase-orders/{purchaseOrderId}": {
      patch: {
        tags: ["Purchase Orders"],
        summary: "Update or cancel a purchase order before receiving",
      },
    },
    "/api/hospital/purchase-orders/{purchaseOrderId}/receive": {
      post: {
        tags: ["Purchase Orders", "Pharmacy/Inventory"],
        summary: "Receive a purchase order into inventory",
      },
    },
    "/api/hospital/doctor-ratings": {
      post: {
        tags: ["Doctors"],
        summary: "Create or update a patient doctor rating after a completed appointment",
      },
    },
    "/api/hospital/doctor-ratings/mine": {
      get: {
        tags: ["Doctors"],
        summary: "List the authenticated patient's submitted doctor ratings",
      },
    },
    "/api/hospital/doctors/{doctorId}/rating-summary": {
      get: {
        tags: ["Doctors"],
        summary: "Load average rating and rating count for a doctor",
      },
    },
    "/api/hospital/family-members": {
      get: {
        tags: ["Family Members"],
        summary: "List family members for the authenticated patient",
      },
      post: {
        tags: ["Family Members"],
        summary: "Create a family member record",
      },
    },
    "/api/hospital/family-members/{familyMemberId}": {
      patch: {
        tags: ["Family Members"],
        summary: "Update a family member record",
      },
      delete: {
        tags: ["Family Members"],
        summary: "Unlink a family member record",
      },
    },
    "/api/hospital/analytics": {
      get: {
        tags: ["Admin"],
        summary: "Load operational analytics for the administrator dashboard",
      },
    },
    "/api/hospital/journeys": {
      get: {
        tags: ["Telemedicine/Journey"],
        summary: "Resolve a patient journey from the opaque token",
      },
    },
    "/api/hospital/telemedicine/sessions/{appointmentId}": {
      get: {
        tags: ["Telemedicine/Journey"],
        summary: "Load a telemedicine session for an appointment",
      },
    },
    "/api/hospital/telemedicine/sessions/{appointmentId}/join": {
      post: {
        tags: ["Telemedicine/Journey"],
        summary: "Join a telemedicine consultation session",
      },
    },
    "/api/hospital/telemedicine/sessions/{appointmentId}/messages": {
      get: {
        tags: ["Telemedicine/Journey"],
        summary: "List telemedicine chat messages",
      },
      post: {
        tags: ["Telemedicine/Journey"],
        summary: "Send a telemedicine chat message",
      },
    },
    "/api/hospital/telemedicine/sessions/{appointmentId}/signals": {
      post: {
        tags: ["Telemedicine/Journey"],
        summary: "Send telemedicine call signalling events",
      },
    },
    "/api/hospital/telemedicine/sessions/{appointmentId}/status": {
      patch: {
        tags: ["Telemedicine/Journey"],
        summary: "Update telemedicine session status",
      },
    },
  },
} as const;
