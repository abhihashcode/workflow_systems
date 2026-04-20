import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../api';
import { User, Tenant } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  currentTenant: Tenant | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => void;
  setCurrentTenant: (tenant: Tenant | null) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [currentTenant, setCurrentTenantState] = useState<Tenant | null>(() => {
    const stored = localStorage.getItem('currentTenant');
    return stored ? JSON.parse(stored) : null;
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (token) {
      authApi.me()
        .then((u) => setUser(u as User))
        .catch(() => {
          localStorage.removeItem('token');
          setToken(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [token]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await authApi.login({ email, password });
    localStorage.setItem('token', result.token);
    setToken(result.token);
    setUser(result.user as User);
  }, []);

  const register = useCallback(async (email: string, password: string, fullName: string) => {
    const result = await authApi.register({ email, password, full_name: fullName });
    localStorage.setItem('token', result.token);
    setToken(result.token);
    setUser(result.user as User);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('currentTenant');
    setToken(null);
    setUser(null);
    setCurrentTenantState(null);
  }, []);

  const setCurrentTenant = useCallback((tenant: Tenant | null) => {
    setCurrentTenantState(tenant);
    if (tenant) {
      localStorage.setItem('currentTenant', JSON.stringify(tenant));
    } else {
      localStorage.removeItem('currentTenant');
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, currentTenant, isLoading, login, register, logout, setCurrentTenant }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
