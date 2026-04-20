import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { tenantsApi } from '../api';
import { Tenant } from '../types';
import { NavLink } from "react-router-dom";


export function TenantSelector() {
  const { currentTenant, setCurrentTenant } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    tenantsApi.list({ limit: 50 })
      .then(res => setTenants(res.data as Tenant[]))
      .catch(() => setTenants([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: '8px 16px', color: 'var(--gray-400)', fontSize: '12px' }}>Loading...</div>;
  if (tenants.length === 0) return (
    <div style={{ padding: '8px 16px' }}>
      <NavLink to="/tenants/new" style={{ color: 'var(--primary)', fontSize: '12px' }}>+ Create tenant</NavLink>
    </div>
  );

  return (
    <div>
      <div style={{ padding: '4px 16px', fontSize: '11px', color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
        Tenant
      </div>
      {tenants.map(t => (
        <div
          key={t.id}
          className={`tenant-option ${currentTenant?.id === t.id ? 'selected' : ''}`}
          onClick={() => setCurrentTenant(t)}
        >
          <div className="name">{t.name}</div>
          <div className="role">{(t as { role?: string }).role ?? 'member'}</div>
        </div>
      ))}
    </div>
  );
}
