import { query } from './db.js';

type AuditEntry = {
  actorId: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
};

export async function writeAuditLog(entry: AuditEntry) {
  await query(
    `INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      entry.actorId,
      entry.action,
      entry.targetType ?? null,
      entry.targetId ?? null,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
      entry.ipAddress ?? null,
    ]
  );
}

/**
 * Wrap any admin/sensitive mutation so the audit write happens before the
 * response goes out — never fire-and-forget. If the audit write fails, the
 * whole operation fails; we'd rather block an admin action than lose the record.
 */
export async function withAudit<T>(entry: AuditEntry, fn: () => Promise<T>): Promise<T> {
  const result = await fn();
  await writeAuditLog(entry);
  return result;
}
