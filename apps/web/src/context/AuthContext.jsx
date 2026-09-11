// apps/web/src/context/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect } from 'react';

export const ROLES = {
  OFFICER: 'officer',
  ANALYST: 'analyst',
  AUDITOR: 'auditor',
};

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('sentinelph_user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const logout = async () => {
    localStorage.removeItem('sentinelph_user');
    setUser(null);
  };

  const value = {
    isAuthenticated: !!user,
    user,
    role: user?.role,
    loading,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}