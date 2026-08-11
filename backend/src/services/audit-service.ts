import { randomBytes } from "node:crypto";

import { insertAuditLog, loadAuditLogsByOrganization } from "../repositories/postgres-store.js";
import { measurePerfStep } from "../utils/perf-trace.js";

export async function writeAuditLog(input: {
  organizationId?: string;
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, string | undefined>;
}) {
  await measurePerfStep("audit.write", async () => {
    const metadata = input.metadata
      ? Object.fromEntries(
          Object.entries(input.metadata).filter((entry): entry is [string, string] => Boolean(entry[1])),
        )
      : undefined;

    await insertAuditLog({
      id: `AUD-${Date.now()}-${randomBytes(3).toString("hex")}`,
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadataJson: metadata ? JSON.stringify(metadata) : undefined,
    });
  });
}

export async function getAuditLogs(organizationId: string) {
  return loadAuditLogsByOrganization(organizationId, 120);
}
