// apps/web/src/layouts/CustomLayout.jsx
import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';

export default function CustomLayout() {
  return (
    <div style={{ width: "100%", height: "100vh", display: "flex", overflow: "hidden", fontFamily: "'Inter',sans-serif", background: "#09090f", animation: "fadeIn 0.3s ease" }}>
      <Sidebar />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <Topbar />
        <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
          <Outlet />
        </div>
      </main>

      {/* Add this style for the animation */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}