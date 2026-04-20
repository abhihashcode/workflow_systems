const BASE_URL = "/api";

function getToken(): string | null {
  return localStorage.getItem("token");
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  tenantId?: string;
}

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (options.tenantId) headers["X-Tenant-Id"] = options.tenantId;

  const res = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, err.message ?? "Request failed", err.error);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
  }
}

function buildQuery(
  params?: Record<string, string | number | boolean | undefined | null>,
): string {
  if (!params) return "";
  const filtered = Object.fromEntries(
    Object.entries(params).filter(
      ([, v]) => v !== undefined && v !== null && v !== "",
    ),
  ) as Record<string, string>;
  const q = new URLSearchParams(filtered).toString();
  return q ? `?${q}` : "";
}

// Auth
export const authApi = {
  register: (data: { email: string; password: string; full_name: string }) =>
    request<{
      user: { id: string; email: string; full_name: string };
      token: string;
    }>("/auth/register", {
      method: "POST",
      body: data,
    }),
  login: (data: { email: string; password: string }) =>
    request<{
      user: { id: string; email: string; full_name: string };
      token: string;
    }>("/auth/login", {
      method: "POST",
      body: data,
    }),
  me: () =>
    request<{ id: string; email: string; full_name: string }>("/auth/me"),
};

// Tenants
export const tenantsApi = {
  list: (params?: { page?: number; limit?: number }) =>
    request<{
      data: Array<{ id: string; name: string; slug: string; role: string }>;
      pagination: unknown;
    }>(`/tenants${buildQuery(params)}`),
  get: (tenantId: string) =>
    request<{ id: string; name: string; slug: string }>(
      `/tenants/${tenantId}`,
      { tenantId },
    ),
  create: (data: { name: string; slug: string }) =>
    request<{ id: string; name: string; slug: string }>("/tenants", {
      method: "POST",
      body: data,
    }),
  getMembers: (tenantId: string, params?: { page?: number }) =>
    request<{
      data: Array<{
        id: string;
        user_id: string;
        role: string;
        email: string;
        full_name: string;
      }>;
      pagination: unknown;
    }>(`/tenants/${tenantId}/members${buildQuery(params)}`, { tenantId }),
  addMember: (tenantId: string, data: { email: string; role: string }) =>
    request(`/tenants/${tenantId}/members`, {
      method: "POST",
      body: data,
      tenantId,
    }),
  updateMember: (tenantId: string, userId: string, role: string) =>
    request(`/tenants/${tenantId}/members/${userId}`, {
      method: "PATCH",
      body: { role },
      tenantId,
    }),
};

// Workflows
export const workflowsApi = {
  list: (tenantId: string, params?: { page?: number }) =>
    request<{ data: unknown[]; pagination: unknown }>(
      `/tenants/${tenantId}/workflows${buildQuery(params)}`,
      { tenantId },
    ),
  get: (tenantId: string, workflowId: string) =>
    request<{ workflow: unknown; states: unknown[]; transitions: unknown[] }>(
      `/tenants/${tenantId}/workflows/${workflowId}`,
      { tenantId },
    ),
  create: (tenantId: string, data: unknown) =>
    request(`/tenants/${tenantId}/workflows`, {
      method: "POST",
      body: data,
      tenantId,
    }),
};

// Items
export const itemsApi = {
  list: (
    tenantId: string,
    params?: {
      page?: number;
      limit?: number;
      workflow_id?: string;
      state_id?: string;
      search?: string;
    },
  ) =>
    request<{ data: unknown[]; pagination: unknown }>(
      `/tenants/${tenantId}/items${buildQuery(params)}`,
      { tenantId },
    ),
  get: (tenantId: string, itemId: string) =>
    request<{
      item: unknown;
      transitions: unknown[];
      pendingApprovals: unknown[];
    }>(`/tenants/${tenantId}/items/${itemId}`, { tenantId }),
  create: (
    tenantId: string,
    data: { workflow_id: string; title: string; description?: string },
  ) =>
    request(`/tenants/${tenantId}/items`, {
      method: "POST",
      body: data,
      tenantId,
    }),
  transition: (
    tenantId: string,
    itemId: string,
    data: { transition_id: string; version: number; idempotency_key?: string },
  ) =>
    request<{ item?: unknown; approvalRequest?: unknown }>(
      `/tenants/${tenantId}/items/${itemId}/transitions`,
      { method: "POST", body: data, tenantId },
    ),
};

// Approvals
export const approvalsApi = {
  list: (
    tenantId: string,
    params?: { page?: number; item_id?: string; status?: string },
  ) => {
    const q = buildQuery(params);
    return request<{ data: unknown[]; pagination: unknown }>(
      `/tenants/${tenantId}/approvals${q ? `?${q}` : ""}`,
      { tenantId },
    );
  },
  get: (tenantId: string, requestId: string) =>
    request<{ request: unknown }>(
      `/tenants/${tenantId}/approvals/${requestId}`,
      { tenantId },
    ),
  resolve: (
    tenantId: string,
    requestId: string,
    data: { decision: "approved" | "rejected"; comment?: string },
  ) =>
    request(`/tenants/${tenantId}/approvals/${requestId}/resolve`, {
      method: "POST",
      body: data,
      tenantId,
    }),
};

// Audit
export const auditApi = {
  list: (tenantId: string, params?: Record<string, string>) =>
    request<{ data: unknown[]; pagination: unknown }>(
      `/tenants/${tenantId}/audit${buildQuery(params)}`,
      { tenantId },
    ),
};
