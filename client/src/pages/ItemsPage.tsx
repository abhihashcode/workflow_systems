import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { itemsApi, workflowsApi } from '../api';
import { Item, Workflow, PaginatedResult } from '../types';
import { ApiError } from '../api';

export function ItemsPage() {
  const { currentTenant } = useAuth();
  const navigate = useNavigate();
  const [result, setResult] = useState<PaginatedResult<Item> | null>(null);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [workflowFilter, setWorkflowFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const loadItems = useCallback(async () => {
    if (!currentTenant) return;
    setLoading(true);
    try {
      const res = await itemsApi.list(currentTenant.id, {
        page,
        search: search || undefined,
        workflow_id: workflowFilter || undefined,
      });
      setResult(res as PaginatedResult<Item>);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [currentTenant, page, search, workflowFilter]);

  useEffect(() => {
    if (currentTenant) {
      workflowsApi.list(currentTenant.id, { page: 1 })
        .then(r => setWorkflows(r.data as Workflow[]))
        .catch(() => {});
    }
  }, [currentTenant]);

  useEffect(() => { loadItems(); }, [loadItems]);

  if (!currentTenant) {
    return (
      <div className="page-body">
        <div className="empty-state">
          <h3>Select a Tenant</h3>
          <p>Choose a tenant from the sidebar to view items.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <h1>Items</h1>
        {['admin', 'member', 'approver'].includes(currentTenant.role ?? '') && (
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New Item</button>
        )}
      </div>
      <div className="page-body">
        <div className="card" style={{ marginBottom: '16px' }}>
          <div className="flex gap-3">
            <input
              placeholder="Search items..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--gray-200)', borderRadius: '6px' }}
            />
            <select
              value={workflowFilter}
              onChange={e => { setWorkflowFilter(e.target.value); setPage(1); }}
              style={{ padding: '8px 12px', border: '1px solid var(--gray-200)', borderRadius: '6px' }}
            >
              <option value="">All Workflows</option>
              {workflows.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        </div>

        <div className="card">
          {loading ? (
            <div className="loading">Loading...</div>
          ) : !result?.data.length ? (
            <div className="empty-state">
              <h3>No items found</h3>
              <p>Create your first item to get started.</p>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Workflow</th>
                    <th>State</th>
                    <th>Created By</th>
                    <th>Updated</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.map(item => (
                    <tr key={item.id}>
                      <td>{item.title}</td>
                      <td><span className="badge badge-blue">{item.workflow_name}</span></td>
                      <td>
                        <span className={`badge ${item.is_terminal ? 'badge-green' : 'badge-yellow'}`}>
                          {item.current_state_name}
                        </span>
                      </td>
                      <td>{item.created_by_name}</td>
                      <td className="text-gray">{new Date(item.updated_at).toLocaleDateString()}</td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/items/${item.id}`)}>
                          View
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

      {showCreate && (
        <CreateItemModal
          tenantId={currentTenant.id}
          workflows={workflows}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadItems(); }}
        />
      )}
    </>
  );
}

function CreateItemModal({ tenantId, workflows, onClose, onCreated }: {
  tenantId: string;
  workflows: Workflow[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({ workflow_id: workflows[0]?.id ?? '', title: '', description: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.workflow_id) { setError('Select a workflow'); return; }
    setLoading(true);
    try {
      await itemsApi.create(tenantId, { workflow_id: form.workflow_id, title: form.title, description: form.description || undefined });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create item');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Create Item</h2>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Workflow</label>
            <select value={form.workflow_id} onChange={e => setForm(f => ({ ...f, workflow_id: e.target.value }))} required>
              {workflows.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Title</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required autoFocus />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} />
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
