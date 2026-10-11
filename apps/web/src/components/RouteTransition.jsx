// apps/web/src/components/RouteTransition.jsx
import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

export default function RouteTransition({ children }) {
  const location = useLocation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(false);
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, [location.pathname]);

  return (
    <div style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.15s ease', height: '100%' }}>
      {children}
    </div>
  );
}