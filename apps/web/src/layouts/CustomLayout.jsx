// apps/web/src/layouts/CustomLayout.jsx
import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';

export default function CustomLayout() {
  return (
    <div style={{ width: "100%", height: "100vh", display: "flex", overflow: "hidden", fontFamily: "'Inter',sans-serif", background: "#09090f" }}>
      <Sidebar />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <Topbar />
        <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}