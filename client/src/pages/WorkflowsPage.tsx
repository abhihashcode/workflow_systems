import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { workflowsApi } from "../api";
import { Workflow, PaginatedResult } from "../types";
import { ApiError } from "../api";

export function WorkflowsPage() {
  const { currentTenant } = useAuth();
  const navigate = useNavigate();
  const [result, setResult] = useState<PaginatedResult<Workflow> | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const loadWorkflows = useCallback(async () => {
    if (!currentTenant) return;
    setLoading(true);
    try {
      const res = await workflowsApi.list(currentTenant.id);
      setResult(res as PaginatedResult<Workflow>);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [currentTenant]);

  useEffect(() => {
    loadWorkflows();
  }, [loadWorkflows]);

  if (!currentTenant) {
    return (
      <div className="page-body">
        <div className="empty-state">
          <h3>Select a Tenant</h3>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <h1>Workflows</h1>
        {currentTenant.role === "admin" && (
          <button
            className="btn btn-primary"
            onClick={() => setShowCreate(true)}
          >
            + New Workflow
          </button>
        )}
      </div>
      <div className="page-body">
        <div className="card">
          {loading ? (
            <div className="loading">Loading...</div>
          ) : !result?.data.length ? (
            <div className="empty-state">
              <h3>No workflows found</h3>
              {currentTenant.role === "admin" && (
                <p>Create a workflow to get started.</p>
              )}
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Description</th>
                    <th>Version</th>
                    <th>Created By</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((wf: Workflow) => (
                    <tr key={wf.id}>
                      <td>
                        <strong>{wf.name}</strong>
                      </td>
                      <td className="text-gray">{wf.description ?? "—"}</td>
                      <td>
                        <span className="badge badge-gray">v{wf.version}</span>
                      </td>
                      <td>
                        {(wf as { created_by_name?: string }).created_by_name ??
                          "—"}
                      </td>
                      <td>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => navigate(`/workflows/${wf.id}`)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateWorkflowModal
          tenantId={currentTenant.id}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            loadWorkflows();
          }}
        />
      )}
    </>
  );
}

function CreateWorkflowModal({
  tenantId,
  onClose,
  onCreated,
}: {
  tenantId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await workflowsApi.create(tenantId, {
        name: form.name,
        description: form.description,
        states: [
          {
            name: "Draft",
            is_initial: true,
            is_terminal: false,
            position_order: 0,
          },
          {
            name: "In Review",
            is_initial: false,
            is_terminal: false,
            position_order: 1,
          },
          {
            name: "Approved",
            is_initial: false,
            is_terminal: true,
            position_order: 2,
          },
          {
            name: "Rejected",
            is_initial: false,
            is_terminal: true,
            position_order: 3,
          },
        ],
        transitions: [
          {
            from_state: "Draft",
            to_state: "In Review",
            name: "Submit",
            requires_approval: false,
            approval_strategy: "none",
          },
          {
            from_state: "In Review",
            to_state: "Approved",
            name: "Approve",
            requires_approval: true,
            approval_strategy: "single",
          },
          {
            from_state: "In Review",
            to_state: "Rejected",
            name: "Reject",
            requires_approval: true,
            approval_strategy: "single",
          },
          {
            from_state: "Rejected",
            to_state: "Draft",
            name: "Revise",
            requires_approval: false,
            approval_strategy: "none",
          },
        ],
      });
      onCreated();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to create workflow",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Create Workflow</h2>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Description</label>
            <input
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
