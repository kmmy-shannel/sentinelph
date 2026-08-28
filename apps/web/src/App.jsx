import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { AuthProvider, useAuth, ROLES } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardLayout from './layouts/DashboardLayout';
import Login from './pages/Login';
import OfficerDashboard from './pages/OfficerDashboard';
import AnalystDashboard from './pages/AnalystDashboard';
import AuditorDashboard from './pages/AuditorDashboard';

function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <div className="text-center max-w-sm">
        <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
          <ShieldOff size={26} className="text-red-600" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Access Denied</h1>
        <p className="text-slate-500 text-sm mt-2">
          Your account role does not have permission to view this dashboard.
        </p>
        <Link
          to="/login"
          className="inline-block mt-5 bg-blue-900 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-blue-800 transition-colors"
        >
          Back to Login
        </Link>
      </div>
    </div>
  );
}

function RootRedirect() {
  const { isAuthenticated, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <p className="text-slate-400 text-sm">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  switch (role) {
    case ROLES.OFFICER:
      return <Navigate to="/officer" replace />;
    case ROLES.ANALYST:
      return <Navigate to="/analyst" replace />;
    case ROLES.AUDITOR:
      return <Navigate to="/auditor" replace />;
    default:
      return <Navigate to="/unauthorized" replace />;
  }
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />
          <Route path="/" element={<RootRedirect />} />

          <Route
            element={
              <ProtectedRoute allowedRoles={[ROLES.OFFICER, ROLES.ANALYST, ROLES.AUDITOR]}>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route
              path="/officer"
              element={
                <ProtectedRoute allowedRoles={[ROLES.OFFICER]}>
                  <OfficerDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/analyst"
              element={
                <ProtectedRoute allowedRoles={[ROLES.ANALYST]}>
                  <AnalystDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/auditor"
              element={
                <ProtectedRoute allowedRoles={[ROLES.AUDITOR]}>
                  <AuditorDashboard />
                </ProtectedRoute>
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}