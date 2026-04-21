import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { TenantSelector } from "./TenantSelector";

export function AppShell() {
  const { user, currentTenant, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>⚙ Workflow</h2>
          <small>{user?.full_name}</small>
        </div>
        <div className="tenant-selector">
          <TenantSelector />
        </div>
        {currentTenant && (
          <nav className="sidebar-nav">
            <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
              Dashboard
            </NavLink>
            <NavLink to="/items" className={({ isActive }) => (isActive ? "active" : "")}>
              Items
            </NavLink>
            <NavLink to="/approvals" className={({ isActive }) => (isActive ? "active" : "")}>
              Approvals
            </NavLink>
            <NavLink to="/workflows" className={({ isActive }) => (isActive ? "active" : "")}>
              Workflows
            </NavLink>
            {["admin", "approver"].includes(currentTenant.role ?? "") && (
              <NavLink
                to="/delegations"
                className={({ isActive }) => (isActive ? "active" : "")}
              >
                Delegations
              </NavLink>
            )}
            <NavLink to="/audit" className={({ isActive }) => (isActive ? "active" : "")}>
              Audit Log
            </NavLink>
            {currentTenant.role === "admin" && (
              <NavLink
                to="/members"
                className={({ isActive }) => (isActive ? "active" : "")}
              >
                Members
              </NavLink>
            )}
          </nav>
        )}
        <div className="sidebar-footer">
          <button onClick={handleLogout}>Sign Out</button>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
