export type TenantRole = 'admin' | 'member' | 'approver' | 'viewer';
export type ApprovalStrategy = 'none' | 'single' | 'all' | 'quorum';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'superseded';
export type VoteDecision = 'approved' | 'rejected';
export type AuditAction =
  | 'user.registered'
  | 'user.logged_in'
  | 'tenant.created'
  | 'tenant.membership_added'
  | 'tenant.membership_updated'
  | 'workflow.created'
  | 'workflow.updated'
  | 'workflow.state_added'
  | 'workflow.transition_added'
  | 'item.created'
  | 'item.transition_requested'
  | 'item.transitioned'
  | 'approval_request.created'
  | 'approval_request.cancelled'
  | 'approval_vote.cast'
  | 'approval_request.resolved'
  | 'delegation.created'
  | 'delegation.revoked';

export interface User {
  id: string;
  email: string;
  full_name: string;
  created_at: Date;
  updated_at: Date;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  created_at: Date;
  updated_at: Date;
}

export interface TenantMembership {
  id: string;
  tenant_id: string;
  user_id: string;
  role: TenantRole;
  created_at: Date;
  updated_at: Date;
}

export interface Workflow {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  version: number;
  is_active: boolean;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface WorkflowState {
  id: string;
  workflow_id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  is_initial: boolean;
  is_terminal: boolean;
  position_order: number;
  created_at: Date;
}

export interface WorkflowTransition {
  id: string;
  workflow_id: string;
  tenant_id: string;
  from_state_id: string;
  to_state_id: string;
  name: string | null;
  requires_approval: boolean;
  approval_strategy: ApprovalStrategy;
  quorum_count: number | null;
  allowed_roles: TenantRole[] | null;
  created_at: Date;
}

export interface Item {
  id: string;
  tenant_id: string;
  workflow_id: string;
  current_state_id: string;
  title: string;
  description: string | null;
  metadata: Record<string, unknown>;
  version: number;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface ApprovalRequest {
  id: string;
  tenant_id: string;
  item_id: string;
  transition_id: string;
  requested_by: string;
  status: ApprovalStatus;
  idempotency_key: string | null;
  resolved_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ApprovalVote {
  id: string;
  approval_request_id: string;
  tenant_id: string;
  voter_id: string;
  delegated_from_id: string | null;
  decision: VoteDecision;
  comment: string | null;
  created_at: Date;
}

export interface ApprovalDelegation {
  id: string;
  tenant_id: string;
  delegator_id: string;
  delegate_id: string;
  valid_from: Date;
  valid_until: Date | null;
  is_active: boolean;
  reason: string | null;
  created_at: Date;
}

export interface AuditLog {
  id: string;
  tenant_id: string | null;
  actor_id: string | null;
  action: AuditAction;
  entity_type: string | null;
  entity_id: string | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: Date;
}

// Request context attached to Express requests
export interface RequestContext {
  userId: string;
  tenantId?: string;
  tenantRole?: TenantRole;
}
