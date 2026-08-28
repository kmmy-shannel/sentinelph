import React, { useState, useRef, useEffect } from 'react';
import { Menu, LogOut, ChevronDown, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const PAGE_TITLES = {
  '/officer': 'Case Review Dashboard',
  '/analyst': 'Scam Pattern Analytics',
  '/auditor': 'Audit Log Viewer',
};

export default function Topbar({ onMenuClick, currentPath }) {
  const { profile, role, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const title =
    Object.entries(PAGE_TITLES).find(([prefix]) => currentPath?.startsWith(prefix))?.[1] ||
    'Dashboard';

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
  };

  return (
    <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-20">
      <div className="flex items-center gap-3">
        <button
          className="lg:hidden text-slate-300 hover:text-white"
          onClick={onMenuClick}
          aria-label="Open sidebar"
        >
          <Menu size={22} />
        </button>
        <h1 className="text-white font-semibold text-base lg:text-lg">{title}</h1>
      </div>

      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((open) => !open)}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-slate-800 transition-colors"
        >
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
            <User size={15} className="text-white" />
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-sm text-white font-medium leading-tight">
              {profile?.displayName || profile?.email || 'User'}
            </p>
            <p className="text-[11px] text-slate-400 capitalize leading-tight">{role}</p>
          </div>
          <ChevronDown size={16} className="text-slate-400" />
        </button>

        {menuOpen && (
          <div className="absolute right-0 mt-2 w-48 bg-slate-800 border border-slate-700 rounded-xl shadow-lg py-1 z-30">
            <div className="px-4 py-2 border-b border-slate-700">
              <p className="text-xs text-slate-400 truncate">{profile?.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-slate-700 transition-colors"
            >
              <LogOut size={15} />
              Log Out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}