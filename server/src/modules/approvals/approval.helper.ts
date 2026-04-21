import { performTransition } from "../items/items.service";
import { WorkflowTransition, Item } from "../../types";
import { createAuditLog } from "../audit/audit.service";

// Resolve whether a request reaches approval threshold.
// Called after every vote is cast.
export async function checkAndResolveApproval(
  approvalRequestId: string,
  tenantId: string,
  transition: WorkflowTransition,
  item: Item,
  client: import("pg").PoolClient,
  actorId: string,   // the actor who just voted (used for audit trail on transition)
): Promise<void> {
  const votes = await client.query<{ decision: string; count: string }>(
    `SELECT decision, COUNT(*) as count
     FROM approval_votes
     WHERE approval_request_id = $1
     GROUP BY decision`,
    [approvalRequestId],
  );

  const approveCount = parseInt(
    votes.rows.find((v) => v.decision === "approved")?.count ?? "0",
    10,
  );
  const rejectCount = parseInt(
    votes.rows.find((v) => v.decision === "rejected")?.count ?? "0",
    10,
  );

  let finalDecision: "approved" | "rejected" | null = null;

  const strategy = transition.approval_strategy;

  if (strategy === "single") {
    // First vote wins
    if (approveCount >= 1) finalDecision = "approved";
    else if (rejectCount >= 1) finalDecision = "rejected";
  } else if (strategy === "quorum") {
    const quorum = transition.quorum_count ?? 1;
    if (approveCount >= quorum) finalDecision = "approved";
    else if (rejectCount >= quorum) finalDecision = "rejected";
  } else if (strategy === "all") {
    // All eligible approvers (admin + approver role) must vote approve.
    // Any rejection immediately resolves as rejected.
    const eligibleResult = await client.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM tenant_memberships
       WHERE tenant_id = $1 AND role IN ('admin', 'approver')`,
      [tenantId],
    );
    const totalEligible = parseInt(eligibleResult.rows[0]?.count ?? "0", 10);
    if (approveCount >= totalEligible) finalDecision = "approved";
    else if (rejectCount > 0) finalDecision = "rejected"; // any rejection blocks
  }

  if (finalDecision) {
    await client.query(
      `UPDATE approval_requests
       SET status = $1, resolved_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [finalDecision, approvalRequestId],
    );

    await createAuditLog(
      {
        tenantId,
        actorId,
        action: "approval_request.resolved",
        entityType: "approval_request",
        entityId: approvalRequestId,
        afterState: { decision: finalDecision },
      },
      client,
    );

    if (finalDecision === "approved") {
      // Perform the actual state transition on the item
      await performTransition(
        client,
        item,
        transition,
        actorId,   // correctly use the approver as actor, not item.created_by
        tenantId,
      );
    }
  }
}
