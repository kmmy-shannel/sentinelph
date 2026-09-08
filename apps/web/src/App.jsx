// apps/web/src/App.jsx
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Unauthorized from './pages/Unauthorized';
import OfficerDashboard from './pages/OfficerDashboard';
import AnalystDashboard from './pages/AnalystDashboard';
import AuditorDashboard from './pages/AuditorDashboard';
import CustomLayout from './layouts/CustomLayout';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/unauthorized" element={<Unauthorized />} />
          
          {/* Wrap all dashboards in your custom layout */}
          <Route element={<ProtectedRoute><CustomLayout /></ProtectedRoute>}>
            <Route
              path="/officer"
              element={
                <ProtectedRoute allowedRoles={['officer']}>
                  <OfficerDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/analyst"
              element={
                <ProtectedRoute allowedRoles={['analyst']}>
                  <AnalystDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/auditor"
              element={
                <ProtectedRoute allowedRoles={['auditor']}>
                  <AuditorDashboard />
                </ProtectedRoute>
              }
            />
          </Route>
          
          <Route path="/" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}