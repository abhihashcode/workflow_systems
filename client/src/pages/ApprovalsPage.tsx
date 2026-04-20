import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { approvalsApi } from '../api';
import { ApprovalRequest, PaginatedResult } from '../types';

export function ApprovalsPage() {
  const { currentTenant } = useAuth();
  const navigate = useNavigate();
  const [result, setResult] = useState<PaginatedResult<ApprovalRequest> | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [page, setPage] = useState(1);

  const loadApprovals = useCallback(async () => {
    if (!currentTenant) return;
    setLoading(true);
    try {
      const res = await approvalsApi.list(currentTenant.id, {
        page,
        status: statusFilter || undefined,
      });
      setResult(res as PaginatedResult<ApprovalRequest>);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [currentTenant, page, statusFilter]);

  useEffect(() => { loadApprovals(); }, [loadApprovals]);

  if (!currentTenant) {
    return (
      <div className="page-body">
        <div className="empty-state"><h3>Select a Tenant</h3></div>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <h1>Approvals</h1>
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            style={{ padding: '8px 12px', border: '1px solid var(--gray-200)', borderRadius: '6px' }}
          >
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>
      <div className="page-body">
        <div className="card">
          {loading ? (
            <div className="loading">Loading...</div>
          ) : !result?.data.length ? (
            <div className="empty-state">
              <h3>No approval requests found</h3>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Requested By</th>
                    <th>Transition To</th>
                    <th>Strategy</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((req: ApprovalRequest) => (
                    <tr key={req.id}>
                      <td>{req.item_title ?? req.item_id.slice(0, 8)}</td>
                      <td>{req.requester_name ?? '—'}</td>
                      <td>{req.to_state_name ?? '—'}</td>
                      <td><span className="badge badge-blue">{req.approval_strategy ?? '—'}</span></td>
                      <td>
                        <span className={`badge status-${req.status}`}>{req.status}</span>
                      </td>
                      <td className="text-gray">{new Date(req.created_at).toLocaleDateString()}</td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/approvals/${req.id}`)}>
                          {req.status === 'pending' ? 'ReView' : 'View'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.pagination.totalPages > 1 && (
                <div className="pagination">
                  <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
                  <span className="text-gray text-sm">Page {page} of {result.pagination.totalPages}</span>
                  <button className="btn btn-ghost btn-sm" disabled={page >= result.pagination.totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
