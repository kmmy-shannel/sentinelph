// apps/web/src/App.jsx
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Unauthorized from './pages/Unauthorized';

// Officer Tabs
import OfficerDashboard from './pages/Officer-Tabs/OfficerDashboard';
import ReviewQueue from './pages/Officer-Tabs/ReviewQueue';
import BlacklistRegistry from './pages/Officer-Tabs/BlacklistRegistry';
import Notifications from './pages/Officer-Tabs/Notifications';
import Account from './pages/Officer-Tabs/Account';

// Analyst Tabs
import AnalystDashboard from './pages/Analyst-Tabs/AnalystDashboard';
import PatternExplorer from './pages/Analyst-Tabs/PatternExplorer';
import AIModelInsights from './pages/Analyst-Tabs/AIModelInsights';
import RegionalReports from './pages/Analyst-Tabs/RegionalReports';
import AlertsConfiguration from './pages/Analyst-Tabs/AlertsConfiguration';
import AnalystAccount from './pages/Analyst-Tabs/Account';

// Auditor Tabs
import AuditorDashboard from './pages/Auditor-Tabs/AuditorDashboard';
import VerificationTool from './pages/Auditor-Tabs/VerificationTool';
import AuditTrail from './pages/Auditor-Tabs/AuditTrail';
import AnomalyReports from './pages/Auditor-Tabs/AnomalyReports';
import AuditorAccount from './pages/Auditor-Tabs/Account';

import CustomLayout from './layouts/CustomLayout';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/unauthorized" element={<Unauthorized />} />

          {/* Officer Routes */}
          <Route element={<ProtectedRoute allowedRoles={['officer']}><CustomLayout /></ProtectedRoute>}>
            <Route path="/officer/dashboard" element={<OfficerDashboard />} />
            <Route path="/officer/queue" element={<ReviewQueue />} />
            <Route path="/officer/registry" element={<BlacklistRegistry />} />
            <Route path="/officer/notifications" element={<Notifications />} />
            <Route path="/officer/account" element={<Account />} />
          </Route>

          {/* Analyst Routes */}
          <Route element={<ProtectedRoute allowedRoles={['analyst']}><CustomLayout /></ProtectedRoute>}>
            <Route path="/analyst/dashboard" element={<AnalystDashboard />} />
            <Route path="/analyst/patterns" element={<PatternExplorer />} />
            <Route path="/analyst/model" element={<AIModelInsights />} />
            <Route path="/analyst/reports" element={<RegionalReports />} />
            <Route path="/analyst/alerts" element={<AlertsConfiguration />} />
            <Route path="/analyst/account" element={<AnalystAccount />} />
          </Route>

          {/* Auditor Routes */}
          <Route element={<ProtectedRoute allowedRoles={['auditor']}><CustomLayout /></ProtectedRoute>}>
            <Route path="/auditor/dashboard" element={<AuditorDashboard />} />
            <Route path="/auditor/verify" element={<VerificationTool />} />
            <Route path="/auditor/trail" element={<AuditTrail />} />
            <Route path="/auditor/anomalies" element={<AnomalyReports />} />
            <Route path="/auditor/account" element={<AuditorAccount />} />
          </Route>

          {/* Catch-all: Redirect to Login */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}