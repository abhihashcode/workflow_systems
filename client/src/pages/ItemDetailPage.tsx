import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { itemsApi } from "../api";
import { Item, WorkflowTransition, ApprovalRequest } from "../types";
import { ApiError } from "../api";

interface ItemDetail {
  item: Item;
  transitions: WorkflowTransition[];
  pendingApprovals: ApprovalRequest[];
}

export function ItemDetailPage() {
  const { itemId } = useParams<{ itemId: string }>();
  const { currentTenant } = useAuth();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [transitionError, setTransitionError] = useState("");
  const [transitioning, setTransitioning] = useState(false);

  const loadItem = async () => {
    if (!currentTenant || !itemId) return;
    try {
      const result = await itemsApi.get(currentTenant.id, itemId);
      setDetail(result as unknown as ItemDetail);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load item");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItem();
  }, [currentTenant, itemId]);

  const handleTransition = async (transitionId: string) => {
    if (!currentTenant || !detail) return;
    setTransitioning(true);
    setTransitionError("");
    try {
      const result = await itemsApi.transition(currentTenant.id, itemId!, {
        transition_id: transitionId,
        version: detail.item.version,
        idempotency_key: `${itemId}-${transitionId}-${Date.now()}`,
      });
      if ((result as { approvalRequest?: unknown }).approvalRequest) {
        await loadItem();
      } else {
        await loadItem();
      }
    } catch (e) {
      setTransitionError(
        e instanceof ApiError ? e.message : "Transition failed",
      );
    } finally {
      setTransitioning(false);
    }
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (error)
    return (
      <div className="page-body">
        <div className="alert alert-error">{error}</div>
      </div>
    );
  if (!detail) return null;

  const { item, transitions, pendingApprovals } = detail;

  return (
    <>
      <div className="page-header">
        <div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate("/items")}
            style={{ marginBottom: "4px" }}
          >
            ← Back
          </button>
          <h1>{item.title}</h1>
        </div>
        <span
          className={`badge ${item.is_terminal ? "badge-green" : "badge-yellow"}`}
          style={{ fontSize: "14px", padding: "4px 12px" }}
        >
          {item.current_state_name}
        </span>
      </div>
      <div className="page-body">
        <div className="grid-2" style={{ gap: "16px", alignItems: "start" }}>
          <div>
            <div className="card">
              <div className="card-title">Details</div>
              {item.description && (
                <p className="text-gray" style={{ marginBottom: "16px" }}>
                  {item.description}
                </p>
              )}
              <table style={{ width: "100%" }}>
                <tbody>
                  <tr>
                    <td
                      style={{
                        padding: "6px 0",
                        color: "var(--gray-600)",
                        width: "120px",
                      }}
                    >
                      Workflow
                    </td>
                    <td>
                      <span className="badge badge-blue">
                        {item.workflow_name}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: "6px 0", color: "var(--gray-600)" }}>
                      Created by
                    </td>
                    <td>{item.created_by_name}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: "6px 0", color: "var(--gray-600)" }}>
                      Created
                    </td>
                    <td>{new Date(item.created_at).toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: "6px 0", color: "var(--gray-600)" }}>
                      Version
                    </td>
                    <td>v{item.version}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {pendingApprovals.length > 0 && (
              <div className="card mt-4">
                <div className="card-title">⏳ Pending Approvals</div>
                {pendingApprovals.map((apr: ApprovalRequest) => (
                  <div key={apr.id} style={{ marginBottom: "8px" }}>
                    <div className="flex items-center justify-between">
                      <span className="badge status-pending">
                        Awaiting Approval
                      </span>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => navigate(`/approvals/${apr.id}`)}
                      >
                        ReView
                      </button>
                    </div>
                    <div className="text-sm text-gray mt-2">
                      Requested {new Date(apr.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title">Available Transitions</div>
            {transitionError && (
              <div className="alert alert-error">{transitionError}</div>
            )}
            {transitions.length === 0 ? (
              <div className="empty-state" style={{ padding: "24px 0" }}>
                <p>No transitions available from current state.</p>
              </div>
            ) : (
              <div
                style={{ display: "flex", flexDirection: "column", gap: "8px" }}
              >
                {transitions.map((t: WorkflowTransition) => (
                  <div
                    key={t.id}
                    style={{
                      border: "1px solid var(--gray-200)",
                      borderRadius: "6px",
                      padding: "12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: "500" }}>
                        {t.name ?? `→ ${t.to_state_name}`}
                      </div>
                      <div
                        className="text-sm text-gray"
                        style={{ marginTop: "2px" }}
                      >
                        To: <strong>{t.to_state_name}</strong>
                        {t.requires_approval && (
                          <span
                            className="text-xs"
                            style={{
                              marginLeft: "8px",
                              color: "var(--gray-500)",
                            }}
                          >
                            Will go to approvers for review
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      className={`btn btn-sm btn-primary`}
                      disabled={transitioning || pendingApprovals.length > 0}
                      onClick={() => handleTransition(t.id)}
                    >
                      {transitioning ? "..." : "Execute"}
                    </button>
                  </div>
                ))}
              </div>
            )}
            {pendingApprovals.length > 0 && (
              <div className="alert alert-info mt-4">
                Transitions are locked while an approval request is pending.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
