// apps/web/src/App.jsx
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';

import Activate from './pages/Activate';
import ResetPassword from './pages/ResetPassword';
import Unauthorized from './pages/Unauthorized';

// Officer Tabs
import OfficerDashboard from './pages/Officer-Tabs/OfficerDashboard';
import ReviewQueue from './pages/Officer-Tabs/ReviewQueue';
import BlacklistRegistry from './pages/Officer-Tabs/BlacklistRegistry';
import Notifications from './pages/Officer-Tabs/Notifications';
import Account from './pages/Officer-Tabs/Account';

// Agency Admin Tabs
import AdminDashboard from './pages/Admin-Tabs/AdminDashboard';
import Officers from './pages/Admin-Tabs/Officers';
import AIModelInsights from './pages/Admin-Tabs/AIModelInsights';
import RegionalReports from './pages/Admin-Tabs/RegionalReports';
import AdminAccount from './pages/Admin-Tabs/Account';

// Super Admin Tabs
import SuperAdminDashboard from './pages/SuperAdmin-Tabs/SuperAdminDashboard';
import UsersRBAC from './pages/SuperAdmin-Tabs/UsersRBAC';
import ChainIntegrity from './pages/SuperAdmin-Tabs/ChainIntegrity';
import AuditLogs from './pages/SuperAdmin-Tabs/AuditLogs';
import SystemHealth from './pages/SuperAdmin-Tabs/SystemHealth';
import SuperAdminAccount from './pages/SuperAdmin-Tabs/Account';

import CustomLayout from './layouts/CustomLayout';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/activate" element={<Activate />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/unauthorized" element={<Unauthorized />} />

          {/* Officer Routes */}
          <Route element={<ProtectedRoute allowedRoles={['officer']}><CustomLayout /></ProtectedRoute>}>
            <Route path="/officer/dashboard" element={<OfficerDashboard />} />
            <Route path="/officer/queue" element={<ReviewQueue />} />
            <Route path="/officer/registry" element={<BlacklistRegistry />} />
            <Route path="/officer/notifications" element={<Notifications />} />
            <Route path="/officer/account" element={<Account />} />
          </Route>

          {/* Agency Admin Routes */}
          <Route element={<ProtectedRoute allowedRoles={['admin']}><CustomLayout /></ProtectedRoute>}>
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/officers" element={<Officers />} />
            <Route path="/admin/model" element={<AIModelInsights />} />
            <Route path="/admin/reports" element={<RegionalReports />} />
            <Route path="/admin/account" element={<AdminAccount />} />
          </Route>

          {/* Super Admin Routes */}
          <Route element={<ProtectedRoute allowedRoles={['superadmin']}><CustomLayout /></ProtectedRoute>}>
            <Route path="/superadmin/dashboard" element={<SuperAdminDashboard />} />
            <Route path="/superadmin/users-rbac" element={<UsersRBAC />} />
            <Route path="/superadmin/chain-integrity" element={<ChainIntegrity />} />
            <Route path="/superadmin/audit-logs" element={<AuditLogs />} />
            <Route path="/superadmin/system-health" element={<SystemHealth />} />
            <Route path="/superadmin/account" element={<SuperAdminAccount />} />
          </Route>

          {/* Catch-all: Redirect to Login */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}