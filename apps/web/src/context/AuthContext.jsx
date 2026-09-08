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
    // Load user from localStorage (simulating a saved session)
    const storedUser = localStorage.getItem('sentinelph_user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        console.error('Failed to parse stored user:', e);
        localStorage.removeItem('sentinelph_user');
      }
    }
    setLoading(false);
  }, []);

  const login = async (credentials) => {
    // This simulates a successful login. In the future, replace with a fetch call.
    // For now, we rely on the Demo users saved in Login.jsx
    return true;
  };

  const logout = async () => {
    localStorage.removeItem('sentinelph_user');
    setUser(null);
  };

  const value = {
    isAuthenticated: !!user,
    user,
    profile: user,
    role: user?.role,
    loading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}