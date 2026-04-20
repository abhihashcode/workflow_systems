import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { approvalsApi } from "../api";
import { ApprovalRequest } from "../types";
import { ApiError } from "../api";

export function ApprovalDetailPage() {
  const { requestId } = useParams<{ requestId: string }>();
  const { currentTenant } = useAuth();
  const navigate = useNavigate();
  const [request, setRequest] = useState<ApprovalRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [comment, setComment] = useState("");
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState("");

  const loadDetail = async () => {
    if (!currentTenant || !requestId) return;
    try {
      const result = await approvalsApi.get(currentTenant.id, requestId);
      setRequest(result as ApprovalRequest);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
  }, [currentTenant, requestId]);

  const handleResolve = async (decision: "approved" | "rejected") => {
    if (!currentTenant) return;
    setResolving(true);
    setResolveError("");
    try {
      await approvalsApi.resolve(currentTenant.id, requestId!, {
        decision,
        comment: comment || undefined,
      });
      await loadDetail();
      setComment("");
    } catch (e) {
      setResolveError(e instanceof ApiError ? e.message : "Failed to resolve");
    } finally {
      setResolving(false);
    }
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (error)
    return (
      <div className="page-body">
        <div className="alert alert-error">{error}</div>
      </div>
    );
  if (!request) return null;

  const canResolve =
    ["admin", "approver"].includes(currentTenant?.role ?? "") &&
    request.status === "pending";

  return (
    <>
      <div className="page-header">
        <div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate("/approvals")}
            style={{ marginBottom: "4px" }}
          >
            ← Back
          </button>
          <h1>Approval Request</h1>
        </div>
        <span
          className={`badge status-${request.status}`}
          style={{ fontSize: "14px", padding: "4px 12px" }}
        >
          {request.status}
        </span>
      </div>
      <div className="page-body">
        <div className="grid-2" style={{ alignItems: "start" }}>
          <div className="card">
            <div className="card-title">Request Details</div>
            <table style={{ width: "100%" }}>
              <tbody>
                <tr>
                  <td
                    style={{
                      padding: "6px 0",
                      color: "var(--gray-600)",
                      width: "130px",
                    }}
                  >
                    Item
                  </td>
                  <td>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => navigate(`/items/${request.item_id}`)}
                    >
                      {request.item_title ?? request.item_id.slice(0, 8)} →
                    </button>
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: "6px 0", color: "var(--gray-600)" }}>
                    Transition To
                  </td>
                  <td>
                    <span className="badge badge-green">
                      {request.to_state_name ?? "—"}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: "6px 0", color: "var(--gray-600)" }}>
                    Requested By
                  </td>
                  <td>{request.requester_name ?? "—"}</td>
                </tr>
                <tr>
                  <td style={{ padding: "6px 0", color: "var(--gray-600)" }}>
                    Requested
                  </td>
                  <td>{new Date(request.created_at).toLocaleString()}</td>
                </tr>
                {request.resolved_at && (
                  <tr>
                    <td style={{ padding: "6px 0", color: "var(--gray-600)" }}>
                      Resolved
                    </td>
                    <td>{new Date(request.resolved_at).toLocaleString()}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {canResolve && (
            <div className="card">
              <div className="card-title">Decision</div>
              {resolveError && (
                <div
                  className="alert alert-error"
                  style={{ marginBottom: "12px" }}
                >
                  {resolveError}
                </div>
              )}
              <div className="form-group">
                <label>Comment (optional)</label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  placeholder="Add a comment..."
                />
              </div>
              <div className="flex gap-2">
                <button
                  className="btn btn-success"
                  style={{ flex: 1 }}
                  onClick={() => handleResolve("approved")}
                  disabled={resolving}
                >
                  {resolving ? "..." : "Approve"}
                </button>
                <button
                  className="btn btn-danger"
                  style={{ flex: 1 }}
                  onClick={() => handleResolve("rejected")}
                  disabled={resolving}
                >
                  {resolving ? "..." : "Reject"}
                </button>
              </div>
            </div>
          )}

          {!canResolve && request.status !== "pending" && (
            <div className="card">
              <div className="card-title">Decision</div>
              <div
                className={`alert ${request.status === "approved" ? "alert-success" : "alert-error"}`}
              >
                This request was <strong>{request.status}</strong>
                {request.resolved_at &&
                  ` on ${new Date(request.resolved_at).toLocaleString()}`}
                .
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
