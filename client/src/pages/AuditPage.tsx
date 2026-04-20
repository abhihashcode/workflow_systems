import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { auditApi } from '../api';
import { AuditLog, PaginatedResult } from '../types';

export function AuditPage() {
  const { currentTenant } = useAuth();
  const [result, setResult] = useState<PaginatedResult<AuditLog> | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [actionFilter, _setActionFilter] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('');

  const loadAudit = useCallback(async () => {
    if (!currentTenant) return;
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: '30' };
      if (actionFilter) params['action'] = actionFilter;
      if (entityTypeFilter) params['entity_type'] = entityTypeFilter;
      const res = await auditApi.list(currentTenant.id, params);
      setResult(res as PaginatedResult<AuditLog>);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [currentTenant, page, actionFilter, entityTypeFilter]);

  useEffect(() => { loadAudit(); }, [loadAudit]);

  if (!currentTenant) {
    return <div className="page-body"><div className="empty-state"><h3>Select a Tenant</h3></div></div>;
  }

  const actionColors: Record<string, string> = {
    'item.created': 'badge-blue',
    'item.transitioned': 'badge-green',
    'item.transition_requested': 'badge-yellow',
    'approval_vote.cast': 'badge-purple',
    'approval_request.resolved': 'badge-green',
    'workflow.created': 'badge-blue',
    'delegation.created': 'badge-purple',
    'delegation.revoked': 'badge-red',
    'tenant.membership_added': 'badge-green',
  };

  return (
    <>
      <div className="page-header">
        <h1>Audit Log</h1>
        <div className="flex gap-2">
          <select
            value={entityTypeFilter}
            onChange={e => { setEntityTypeFilter(e.target.value); setPage(1); }}
            style={{ padding: '8px 12px', border: '1px solid var(--gray-200)', borderRadius: '6px' }}
          >
            <option value="">All Entities</option>
            <option value="item">Items</option>
            <option value="workflow">Workflows</option>
            <option value="approval_request">Approvals</option>
            <option value="delegation">Delegations</option>
            <option value="user">Users</option>
          </select>
        </div>
      </div>
      <div className="page-body">
        <div className="card">
          {loading ? (
            <div className="loading">Loading...</div>
          ) : !result?.data.length ? (
            <div className="empty-state"><h3>No audit logs found</h3></div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((log: AuditLog) => (
                    <tr key={log.id}>
                      <td className="text-gray" style={{ whiteSpace: 'nowrap' }}>
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td>{(log as { actor_name?: string }).actor_name ?? (log.actor_id ? log.actor_id.slice(0, 8) : 'System')}</td>
                      <td>
                        <span className={`badge ${actionColors[log.action] ?? 'badge-gray'}`} style={{ fontSize: '11px' }}>
                          {log.action}
                        </span>
                      </td>
                      <td className="text-gray">
                        {log.entity_type && <span>{log.entity_type}</span>}
                        {log.entity_id && <span style={{ marginLeft: '4px', opacity: 0.6 }}>{log.entity_id.slice(0, 8)}</span>}
                      </td>
                      <td className="text-gray text-sm">
                        {log.metadata && Object.keys(log.metadata).length > 0 &&
                          JSON.stringify(log.metadata).slice(0, 60)}
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
