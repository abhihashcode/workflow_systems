import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { itemsApi, approvalsApi } from '../api';

export function DashboardPage() {
  const { currentTenant, user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ items: 0, pendingApprovals: 0 });

  useEffect(() => {
    if (!currentTenant) return;
    Promise.all([
      itemsApi.list(currentTenant.id, { limit: 1 }),
      approvalsApi.list(currentTenant.id, { status: 'pending', page: 1 }),
    ]).then(([items, approvals]) => {
      setStats({
        items: (items as { pagination: { total: number } }).pagination.total,
        pendingApprovals: (approvals as { pagination: { total: number } }).pagination.total,
      });
    }).catch(() => {});
  }, [currentTenant]);

  if (!currentTenant) {
    return (
      <div className="dashboard-empty">
        <h2>Welcome, {user?.full_name}!</h2>
        <p>Select a tenant from the sidebar to get started.</p>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <h1>Dashboard</h1>
        <span className="text-gray text-sm">{currentTenant.name} · {currentTenant.role}</span>
      </div>

      <div className="page-body">
        <div className="grid-3">
          <div className="card stat-card" onClick={() => navigate('/items')}>
            <div className="stat-label">Total Items</div>
            <div className="stat-value">{stats.items}</div>
          </div>
          <div className="card stat-card" onClick={() => navigate('/approvals?status=pending')}>
            <div className="stat-label">Pending Approvals</div>
            <div className="stat-value">{stats.pendingApprovals}</div>
          </div>
          <div className="card stat-card" onClick={() => navigate('/workflows')}>
            <div className="stat-label">Workflows</div>
            <div className="stat-value">—</div>
          </div>
        </div>
      </div>
    </>
  );
}