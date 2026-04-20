-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- USERS & AUTH
-- ============================================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);

-- ============================================================
-- TENANTS
-- ============================================================
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tenants_slug ON tenants(slug);

-- ============================================================
-- TENANT MEMBERSHIPS (multi-tenant user roles)
-- ============================================================
CREATE TYPE tenant_role AS ENUM ('admin', 'member', 'approver', 'viewer');

CREATE TABLE tenant_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role tenant_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id)
);

CREATE INDEX idx_memberships_tenant ON tenant_memberships(tenant_id);
CREATE INDEX idx_memberships_user ON tenant_memberships(user_id);

-- ============================================================
-- WORKFLOWS
-- ============================================================
CREATE TABLE workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workflows_tenant ON workflows(tenant_id);
CREATE UNIQUE INDEX idx_workflows_tenant_name ON workflows(tenant_id, name) WHERE is_active = true;

-- ============================================================
-- WORKFLOW STATES
-- ============================================================
CREATE TABLE workflow_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_initial BOOLEAN NOT NULL DEFAULT false,
  is_terminal BOOLEAN NOT NULL DEFAULT false,
  position_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workflow_id, name)
);

CREATE INDEX idx_states_workflow ON workflow_states(workflow_id);
CREATE INDEX idx_states_tenant ON workflow_states(tenant_id);

-- ============================================================
-- WORKFLOW TRANSITIONS
-- ============================================================
CREATE TYPE approval_strategy AS ENUM ('none', 'single', 'all', 'quorum');

CREATE TABLE workflow_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  from_state_id UUID NOT NULL REFERENCES workflow_states(id) ON DELETE CASCADE,
  to_state_id UUID NOT NULL REFERENCES workflow_states(id) ON DELETE CASCADE,
  name VARCHAR(100),
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  approval_strategy approval_strategy NOT NULL DEFAULT 'none',
  quorum_count INTEGER, -- used when strategy = 'quorum'
  allowed_roles tenant_role[], -- NULL means all roles allowed
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workflow_id, from_state_id, to_state_id),
  CHECK (from_state_id != to_state_id),
  CHECK (
    (requires_approval = false AND approval_strategy = 'none') OR
    (requires_approval = true AND approval_strategy != 'none')
  ),
  CHECK (
    (approval_strategy != 'quorum') OR
    (approval_strategy = 'quorum' AND quorum_count IS NOT NULL AND quorum_count > 0)
  )
);

CREATE INDEX idx_transitions_workflow ON workflow_transitions(workflow_id);
CREATE INDEX idx_transitions_from_state ON workflow_transitions(from_state_id);
CREATE INDEX idx_transitions_tenant ON workflow_transitions(tenant_id);

-- ============================================================
-- ITEMS
-- ============================================================
CREATE TABLE items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES workflows(id),
  current_state_id UUID NOT NULL REFERENCES workflow_states(id),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1, -- optimistic lock
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_items_tenant ON items(tenant_id);
CREATE INDEX idx_items_workflow ON items(workflow_id);
CREATE INDEX idx_items_state ON items(current_state_id);
CREATE INDEX idx_items_created_by ON items(created_by);

-- ============================================================
-- APPROVAL REQUESTS
-- ============================================================
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled', 'superseded');

CREATE TABLE approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  transition_id UUID NOT NULL REFERENCES workflow_transitions(id),
  requested_by UUID NOT NULL REFERENCES users(id),
  status approval_status NOT NULL DEFAULT 'pending',
  idempotency_key VARCHAR(255),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX idx_approval_requests_item ON approval_requests(item_id);
CREATE INDEX idx_approval_requests_tenant ON approval_requests(tenant_id);
CREATE INDEX idx_approval_requests_status ON approval_requests(status);

-- ============================================================
-- APPROVAL VOTES
-- ============================================================
CREATE TYPE vote_decision AS ENUM ('approved', 'rejected');

CREATE TABLE approval_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_request_id UUID NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  voter_id UUID NOT NULL REFERENCES users(id),
  delegated_from_id UUID REFERENCES users(id), -- original approver if delegated
  decision vote_decision NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (approval_request_id, voter_id) -- one vote per approver per request
);

CREATE INDEX idx_votes_request ON approval_votes(approval_request_id);
CREATE INDEX idx_votes_voter ON approval_votes(voter_id);

-- ============================================================
-- APPROVAL DELEGATIONS
-- ============================================================
CREATE TABLE approval_delegations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  delegator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delegate_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ, -- NULL = indefinite
  is_active BOOLEAN NOT NULL DEFAULT true,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (delegator_id != delegate_id),
  UNIQUE (tenant_id, delegator_id, delegate_id, is_active)
);

CREATE INDEX idx_delegations_delegator ON approval_delegations(delegator_id, tenant_id);
CREATE INDEX idx_delegations_delegate ON approval_delegations(delegate_id, tenant_id);
CREATE INDEX idx_delegations_active ON approval_delegations(tenant_id, is_active) WHERE is_active = true;

-- ============================================================
-- AUDIT LOG (immutable)
-- ============================================================
CREATE TYPE audit_action AS ENUM (
  'user.registered',
  'user.logged_in',
  'tenant.created',
  'tenant.membership_added',
  'tenant.membership_updated',
  'workflow.created',
  'workflow.updated',
  'workflow.state_added',
  'workflow.transition_added',
  'item.created',
  'item.transition_requested',
  'item.transitioned',
  'approval_request.created',
  'approval_request.cancelled',
  'approval_vote.cast',
  'approval_request.resolved',
  'delegation.created',
  'delegation.revoked'
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id), -- nullable for system events
  actor_id UUID REFERENCES users(id),
  action audit_action NOT NULL,
  entity_type VARCHAR(100),
  entity_id UUID,
  before_state JSONB,
  after_state JSONB,
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit log is append-only - prevent updates and deletes via trigger
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_no_update
  BEFORE UPDATE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

CREATE TRIGGER audit_no_delete
  BEFORE DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

CREATE INDEX idx_audit_tenant ON audit_logs(tenant_id);
CREATE INDEX idx_audit_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_created_at ON audit_logs(created_at DESC);

-- ============================================================
-- AUTO-UPDATE updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tenants_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER memberships_updated_at BEFORE UPDATE ON tenant_memberships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER workflows_updated_at BEFORE UPDATE ON workflows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER items_updated_at BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER approval_requests_updated_at BEFORE UPDATE ON approval_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
