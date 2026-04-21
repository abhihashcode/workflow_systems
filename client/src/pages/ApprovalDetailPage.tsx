import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { approvalsApi } from "../api";
import { ApprovalRequest, ApprovalVote } from "../types";
import { ApiError } from "../api";

export function ApprovalDetailPage() {
  const { requestId } = useParams<{ requestId: string }>();
  const { currentTenant, user } = useAuth();
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

  const handleCancel = async () => {
    if (!currentTenant || !window.confirm("Cancel this approval request?")) return;
    setResolving(true);
    try {
      await approvalsApi.cancel(currentTenant.id, requestId!);
      navigate("/approvals");
    } catch (e) {
      setResolveError(e instanceof ApiError ? e.message : "Failed to cancel");
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

  const votes: ApprovalVote[] = request.votes ?? [];
  const approveCount = votes.filter((v) => v.decision === "approved").length;
  const rejectCount = votes.filter((v) => v.decision === "rejected").length;

  // Has the current user already voted?
  const alreadyVoted = votes.some((v) => v.voter_id === user?.id);

  const canResolve =
    ["admin", "approver"].includes(currentTenant?.role ?? "") &&
    request.status === "pending" &&
    !alreadyVoted;

  const canCancel =
    (request.requested_by === user?.id || currentTenant?.role === "admin") &&
    request.status === "pending";

  // Human-readable strategy label
  const strategyLabel = () => {
    switch (request.approval_strategy) {
      case "single": return "First approver to vote wins";
      case "all": return "All approvers must approve";
      case "quorum": return `${request.quorum_count} approver(s) must agree`;
      default: return null;
    }
  };

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
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span
            className={`badge status-${request.status}`}
            style={{ fontSize: "14px", padding: "4px 12px" }}
          >
            {request.status}
          </span>
          {canCancel && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ color: "var(--red-500)" }}
              onClick={handleCancel}
              disabled={resolving}
            >
              Cancel Request
            </button>
          )}
        </div>
      </div>

      <div className="page-body">
        <div className="grid-2" style={{ alignItems: "start" }}>
          {/* Request details */}
          <div>
            <div className="card" style={{ marginBottom: "16px" }}>
              <div className="card-title">Request Details</div>
              <table style={{ width: "100%" }}>
                <tbody>
                  <tr>
                    <td style={{ padding: "6px 0", color: "var(--gray-600)", width: "130px" }}>
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
                  {request.approval_strategy && request.approval_strategy !== "none" && (
                    <tr>
                      <td style={{ padding: "6px 0", color: "var(--gray-600)" }}>
                        Strategy
                      </td>
                      <td>
                        <span className="badge badge-blue">
                          {request.approval_strategy}
                          {request.approval_strategy === "quorum" && ` (need ${request.quorum_count})`}
                        </span>
                        {strategyLabel() && (
                          <span className="text-sm text-gray" style={{ marginLeft: "8px" }}>
                            {strategyLabel()}
                          </span>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Votes cast so far */}
            {votes.length > 0 && (
              <div className="card">
                <div className="card-title">
                  Votes Cast ({approveCount} approve / {rejectCount} reject)
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {votes.map((vote) => (
                    <div
                      key={vote.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 12px",
                        background: "var(--gray-50)",
                        borderRadius: "6px",
                        borderLeft: `3px solid ${vote.decision === "approved" ? "var(--green-500)" : "var(--red-500)"}`,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 500, fontSize: "14px" }}>
                          {vote.voter_name}
                          {vote.delegated_from_name && (
                            <span className="text-sm text-gray" style={{ marginLeft: "6px" }}>
                              (delegated by {vote.delegated_from_name})
                            </span>
                          )}
                        </div>
                        {vote.comment && (
                          <div className="text-sm text-gray" style={{ marginTop: "2px" }}>
                            "{vote.comment}"
                          </div>
                        )}
                        <div className="text-xs text-gray">
                          {new Date(vote.created_at).toLocaleString()}
                        </div>
                      </div>
                      <span
                        className={`badge ${vote.decision === "approved" ? "badge-green" : "badge-red"}`}
                      >
                        {vote.decision}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {votes.length === 0 && request.status === "pending" && (
              <div className="card">
                <div className="empty-state" style={{ padding: "16px 0" }}>
                  <p>No votes have been cast yet.</p>
                </div>
              </div>
            )}
          </div>

          {/* Decision panel */}
          <div>
            {canResolve && (
              <div className="card">
                <div className="card-title">Cast Your Vote</div>
                {resolveError && (
                  <div className="alert alert-error" style={{ marginBottom: "12px" }}>
                    {resolveError}
                  </div>
                )}
                <div className="form-group">
                  <label>Comment (optional)</label>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={3}
                    placeholder="Add a comment to your vote..."
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn btn-success"
                    style={{ flex: 1 }}
                    onClick={() => handleResolve("approved")}
                    disabled={resolving}
                  >
                    {resolving ? "..." : "✓ Approve"}
                  </button>
                  <button
                    className="btn btn-danger"
                    style={{ flex: 1 }}
                    onClick={() => handleResolve("rejected")}
                    disabled={resolving}
                  >
                    {resolving ? "..." : "✕ Reject"}
                  </button>
                </div>
              </div>
            )}

            {alreadyVoted && request.status === "pending" && (
              <div className="card">
                <div className="alert alert-info">
                  You have already cast your vote on this request. Waiting for other approvers.
                </div>
              </div>
            )}

            {!canResolve && !alreadyVoted && request.status !== "pending" && (
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

            {!["admin", "approver"].includes(currentTenant?.role ?? "") &&
              request.status === "pending" && (
                <div className="card">
                  <div className="alert alert-info">
                    This request is awaiting approval. You do not have permission to vote.
                  </div>
                </div>
              )}
          </div>
        </div>
      </div>
    </>
  );
}
