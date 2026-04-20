import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../api';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">

      <div className="auth-panel-left">
        <h1>Workflow<br />System</h1>
        <div className="auth-demo-box">
          <div className="alert alert-info">
            <strong>Test accounts</strong>
            user1@admin.com / test1234 (admin)<br />
            user2@approver.com / test1234 (approver)<br />
            user3@member.com / test1234 (member)
          </div>
        </div>
      </div>

      <div className="auth-panel-right">
        <div className="auth-box card">
          <p className="auth-heading-eyebrow">Welcome back</p>
          <h1>Sign in to your account</h1>
          {error && <div className="alert alert-error">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
          <p className="auth-register-link">
            Don't have an account? <Link to="/register">Register</Link>
          </p>
        </div>
      </div>

    </div>
  );
}