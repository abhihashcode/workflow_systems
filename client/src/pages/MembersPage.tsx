import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { tenantsApi } from '../api';
import { TenantMembership, PaginatedResult } from '../types';
import { ApiError } from '../api';

export function MembersPage() {
  const { currentTenant } = useAuth();
  const [result, setResult] = useState<PaginatedResult<TenantMembership & { email: string; full_name: string }> | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const loadMembers = useCallback(async () => {
    if (!currentTenant) return;
    setLoading(true);
    try {
      const res = await tenantsApi.getMembers(currentTenant.id);
      setResult(res as unknown as PaginatedResult<TenantMembership & { email: string; full_name: string }>);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [currentTenant]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  const handleRoleChange = async (userId: string, role: string) => {
    if (!currentTenant) return;
    try {
      await tenantsApi.updateMember(currentTenant.id, userId, role);
      await loadMembers();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : 'Failed to update role');
    }
  };

  if (!currentTenant) {
    return <div className="page-body"><div className="empty-state"><h3>Select a Tenant</h3></div></div>;
  }

  return (
    <>
      <div className="page-header">
        <h1>Members</h1>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add Member</button>
      </div>
      <div className="page-body">
        <div className="card">
          {loading ? (
            <div className="loading">Loading...</div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Joined</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {result?.data.map((m: TenantMembership & { email: string; full_name: string }) => (
                    <tr key={m.id}>
                      <td>{m.full_name}</td>
                      <td className="text-gray">{m.email}</td>
                      <td>
                        <span className={`badge status-${m.role}`}>{m.role}</span>
                      </td>
                      <td className="text-gray">{new Date(m.created_at).toLocaleDateString()}</td>
                      <td>
                        <select
                          value={m.role}
                          onChange={e => handleRoleChange(m.user_id, e.target.value)}
                          style={{ padding: '4px 8px', border: '1px solid var(--gray-200)', borderRadius: '4px', fontSize: '12px' }}
                        >
                          <option value="admin">Admin</option>
                          <option value="approver">Approver</option>
                          <option value="member">Member</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showAdd && (
        <AddMemberModal
          tenantId={currentTenant.id}
          onClose={() => setShowAdd(false)}
          onAdded={() => { setShowAdd(false); loadMembers(); }}
        />
      )}
    </>
  );
}

function AddMemberModal({ tenantId, onClose, onAdded }: {
  tenantId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [form, setForm] = useState({ email: '', role: 'member' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await tenantsApi.addMember(tenantId, form);
      onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add member');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Add Member</h2>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required autoFocus />
          </div>
          <div className="form-group">
            <label>Role</label>
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              <option value="admin">Admin</option>
              <option value="approver">Approver</option>
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Adding...' : 'Add Member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
