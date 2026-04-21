import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { delegationsApi } from '../api';
import { ApprovalDelegation, PaginatedResult } from '../types';
import { ApiError } from '../api';

export function DelegationsPage() {
  const { currentTenant, user } = useAuth();
  const [result, setResult] = useState<PaginatedResult<ApprovalDelegation> | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState('');

  const loadDelegations = useCallback(async () => {
    if (!currentTenant) return;
    setLoading(true);
    setError('');
    try {
      const res = await delegationsApi.list(currentTenant.id);
      setResult(res as PaginatedResult<ApprovalDelegation>);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load delegations');
    } finally {
      setLoading(false);
    }
  }, [currentTenant]);

  useEffect(() => { loadDelegations(); }, [loadDelegations]);

  const handleRevoke = async (delegationId: string) => {
    if (!currentTenant || !window.confirm('Revoke this delegation?')) return;
    setRevoking(delegationId);
    try {
      await delegationsApi.revoke(currentTenant.id, delegationId);
      await loadDelegations();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to revoke delegation');
    } finally {
      setRevoking(null);
    }
  };

  if (!currentTenant) {
    return (
      <div className="page-body">
        <div className="empty-state"><h3>Select a Tenant</h3></div>
      </div>
    );
  }

  const canCreate = ['admin', 'approver'].includes(currentTenant.role ?? '');
  const activeDelegations = result?.data.filter(d => d.is_active) ?? [];
  const inactiveDelegations = result?.data.filter(d => !d.is_active) ?? [];

  return (
    <>
      <div className="page-header">
        <h1>Delegations</h1>
        {canCreate && (
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            + Create Delegation
          </button>
        )}
      </div>

      <div className="page-body">
        {error && (
          <div className="alert alert-error" style={{ marginBottom: '16px' }}>{error}</div>
        )}

        <div className="card" style={{ marginBottom: '16px' }}>
          <div className="card-title">Delegations</div>
          {loading ? (
            <div className="loading">Loading...</div>
          ) : activeDelegations.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px 0' }}>
              <h3>No data found</h3>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Delegator</th>
                    <th>Delegate</th>
                    <th>Valid From</th>
                    <th>Valid Until</th>
                    <th>Reason</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {activeDelegations.map((d: ApprovalDelegation) => {
                    const isOwn = d.delegator_id === user?.id;
                    const isDelegate = d.delegate_id === user?.id;
                    return (
                      <tr key={d.id}>
                        <td>
                          <div>{d.delegator_name ?? d.delegator_id.slice(0, 8)}</div>
                          <div className="text-xs text-gray">{d.delegator_email}</div>
                        </td>
                        <td>
                          <div>{d.delegate_name ?? d.delegate_id.slice(0, 8)}</div>
                          <div className="text-xs text-gray">{d.delegate_email}</div>
                        </td>
                        <td className="text-gray">{new Date(d.valid_from).toLocaleDateString()}</td>
                        <td className="text-gray">
                          {d.valid_until ? new Date(d.valid_until).toLocaleDateString() : '—'}
                        </td>
                        <td className="text-gray text-sm">{d.reason ?? '—'}</td>
                        <td>
                          {(isOwn || currentTenant.role === 'admin') && (
                            <button
                              className="btn btn-ghost btn-sm"
                              disabled={revoking === d.id}
                              onClick={() => handleRevoke(d.id)}
                            >
                              {revoking === d.id ? '...' : 'Revoke'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {inactiveDelegations.length > 0 && (
          <div className="card">
            <div className="card-title">Revoked</div>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Delegator</th>
                    <th>Delegate</th>
                    <th>Created</th>
                    <th>Revoked</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {inactiveDelegations.map((d: ApprovalDelegation) => (
                    <tr key={d.id} style={{ opacity: 0.6 }}>
                      <td>
                        <div>{d.delegator_name ?? d.delegator_id.slice(0, 8)}</div>
                        <div className="text-xs text-gray">{d.delegator_email}</div>
                      </td>
                      <td>
                        <div>{d.delegate_name ?? d.delegate_id.slice(0, 8)}</div>
                        <div className="text-xs text-gray">{d.delegate_email}</div>
                      </td>
                      <td className="text-gray">{new Date(d.created_at).toLocaleDateString()}</td>
                      <td className="text-gray">
                        {d.valid_until ? new Date(d.valid_until).toLocaleDateString() : '—'}
                      </td>
                      <td className="text-gray text-sm">{d.reason ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateDelegationModal
          tenantId={currentTenant.id}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadDelegations(); }}
        />
      )}
    </>
  );
}

function CreateDelegationModal({
  tenantId,
  onClose,
  onCreated,
}: {
  tenantId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({ delegate_email: '', valid_until: '', reason: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await delegationsApi.create(tenantId, {
        delegate_email: form.delegate_email,
        valid_until: form.valid_until ? new Date(form.valid_until).toISOString() : undefined,
        reason: form.reason || undefined,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create delegation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Create Delegation</h2>
        {error && <div className="alert alert-error" style={{ marginBottom: '12px' }}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Delegate Email</label>
            <input
              type="email"
              value={form.delegate_email}
              onChange={e => setForm(f => ({ ...f, delegate_email: e.target.value }))}
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Valid Until</label>
            <input
              type="datetime-local"
              value={form.valid_until}
              onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label>Reason</label>
            <input
              value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
            />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
