export type TenantRole = 'admin' | 'member' | 'approver' | 'viewer';
export type ApprovalStrategy = 'none' | 'single' | 'all' | 'quorum';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'superseded';
export type VoteDecision = 'approved' | 'rejected';

export interface User {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
}

export interface TenantMembership {
  id: string;
  tenant_id: string;
  user_id: string;
  role: TenantRole;
  created_at: string;
  updated_at: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  role?: TenantRole;
}

export interface WorkflowState {
  id: string;
  workflow_id: string;
  name: string;
  is_initial: boolean;
  is_terminal: boolean;
  position_order: number;
}

export interface WorkflowTransition {
  id: string;
  workflow_id: string;
  from_state_id: string;
  to_state_id: string;
  to_state_name?: string;
  name: string | null;
  requires_approval: boolean;
  approval_strategy: ApprovalStrategy;
  quorum_count: number | null;
}

export interface Workflow {
  id: string;
  name: string;
  description: string | null;
  version: number;
  is_active: boolean;
  created_by_name?: string;
}

export interface Item {
  id: string;
  title: string;
  description: string | null;
  current_state_id: string;
  current_state_name: string;
  is_terminal?: boolean;
  workflow_id: string;
  workflow_name: string;
  created_by_name: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ApprovalRequest {
  id: string;
  item_id: string;
  item_title?: string;
  transition_id: string;
  to_state_name?: string;
  requested_by: string;
  requester_name?: string;
  status: ApprovalStatus;
  created_at: string;
  approval_strategy?: ApprovalStrategy;
  quorum_count?: number | null;
}

export interface ApprovalVote {
  id: string;
  voter_id: string;
  voter_name: string;
  voter_email: string;
  delegated_from_name?: string;
  decision: VoteDecision;
  comment: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  action: string;
  actor_id: string | null;
  actor_name?: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AuthState {
  user: User | null;
  token: string | null;
  currentTenant: Tenant | null;
}
