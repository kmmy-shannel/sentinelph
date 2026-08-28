import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  ShieldCheck,
  LayoutDashboard,
  BarChart3,
  ScrollText,
  ClipboardCheck,
  X,
} from 'lucide-react';
import { useAuth, ROLES } from '../context/AuthContext';

const NAV_ITEMS = [
  {
    to: '/officer',
    label: 'Case Review',
    icon: ClipboardCheck,
    roles: [ROLES.OFFICER],
  },
  {
    to: '/analyst',
    label: 'Analytics',
    icon: BarChart3,
    roles: [ROLES.ANALYST],
  },
  {
    to: '/auditor',
    label: 'Audit Log',
    icon: ScrollText,
    roles: [ROLES.AUDITOR],
  },
];

export default function Sidebar({ isOpen, onClose }) {
  const { role, profile } = useAuth();

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(role));

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-slate-900 text-slate-200
          flex flex-col transform transition-transform duration-200 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
      >
        <div className="flex items-center justify-between px-5 h-16 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <ShieldCheck size={22} className="text-blue-400" />
            <span className="font-bold text-white text-lg tracking-tight">SentinelPH</span>
          </div>
          <button
            className="lg:hidden text-slate-400 hover:text-white"
            onClick={onClose}
            aria-label="Close sidebar"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
          <p className="px-3 text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
            Workspace
          </p>
          {visibleItems.length === 0 ? (
            <p className="px-3 text-sm text-slate-500">No dashboards available for your role.</p>
          ) : (
            visibleItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`
                }
              >
                <Icon size={18} />
                {label}
              </NavLink>
            ))
          )}
        </nav>

        <div className="px-4 py-4 border-t border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center">
              <LayoutDashboard size={16} className="text-slate-300" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">
                {profile?.displayName || profile?.email || 'User'}
              </p>
              <p className="text-xs text-slate-500 capitalize">{role || 'unassigned'}</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}