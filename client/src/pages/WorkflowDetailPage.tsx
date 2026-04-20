import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { workflowsApi } from '../api';
import { WorkflowState, WorkflowTransition, Workflow } from '../types';

interface WorkflowDetail {
  workflow: Workflow;
  states: WorkflowState[];
  transitions: (WorkflowTransition & { from_state_name: string; to_state_name: string })[];
}

export function WorkflowDetailPage() {
  const { workflowId } = useParams<{ workflowId: string }>();
  const { currentTenant } = useAuth();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<WorkflowDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentTenant || !workflowId) return;
    workflowsApi.get(currentTenant.id, workflowId)
      .then(r => setDetail(r as unknown as WorkflowDetail))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [currentTenant, workflowId]);

  if (loading) return <div className="loading">Loading...</div>;
  if (!detail) return null;

  const { workflow, states, transitions } = detail;

  return (
    <>
      <div className="page-header">
        <div>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/workflows')} style={{ marginBottom: '4px' }}>← Back</button>
          <h1>{workflow.name}</h1>
        </div>
        <span className="badge badge-gray">v{workflow.version}</span>
      </div>
      <div className="page-body">
        {workflow.description && (
          <div className="alert alert-info" style={{ marginBottom: '16px' }}>{workflow.description}</div>
        )}
        <div className="grid-2" style={{ alignItems: 'start' }}>
          <div className="card">
            <div className="card-title">States ({states.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {states.map((s: WorkflowState) => (
                <div key={s.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 12px', background: 'var(--gray-50)', borderRadius: '6px'
                }}>
                  <span>{s.name}</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {s.is_initial && <span className="badge badge-blue">Initial</span>}
                    {s.is_terminal && <span className="badge badge-green">Terminal</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card-title">Transitions ({transitions.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {transitions.map((t) => (
                <div key={t.id} style={{
                  padding: '8px 12px', background: 'var(--gray-50)', borderRadius: '6px'
                }}>
                  <div style={{ fontWeight: '500', marginBottom: '4px' }}>
                    {t.name ?? `${t.from_state_name} → ${t.to_state_name}`}
                  </div>
                  <div className="text-sm text-gray">
                    {t.from_state_name} → {t.to_state_name}
                  </div>
                  {t.requires_approval && (
                    <div className="mt-2">
                      <span className="badge badge-yellow">
                        Requires {t.approval_strategy} approval
                        {t.approval_strategy === 'quorum' && ` (${t.quorum_count})`}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
