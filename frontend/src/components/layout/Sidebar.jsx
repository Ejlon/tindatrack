// Sidebar.jsx — the left-side navigation panel.
// Nav items are filtered by the logged-in user's role.

import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const NAV_ITEMS = [
  { to: '/',           label: 'Dashboard',  icon: '📊', roles: ['owner', 'manager', 'cashier'] },
  { to: '/inventory',  label: 'Inventory',  icon: '📦', roles: ['owner', 'manager', 'cashier'] },
  { to: '/bodega',     label: 'Bodega',     icon: '🏭', roles: ['owner', 'manager'] },
  { to: '/transfers',  label: 'Transfers',  icon: '🔁', roles: ['owner', 'manager'] },
  { to: '/sales',      label: 'Sales (POS)',icon: '🛒', roles: ['owner', 'manager', 'cashier'] },
  { to: '/reports',    label: 'Reports',    icon: '📈', roles: ['owner', 'manager'] },
];

export default function Sidebar({ isOpen, onClose }) {
  const { user, hasRole } = useAuth();

  const visibleItems = NAV_ITEMS.filter(item => hasRole(...item.roles));

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <aside className={`
        fixed top-0 left-0 h-full w-64 bg-gray-900 text-white z-30
        flex flex-col transition-transform duration-300
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:z-auto
      `}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-700">
          <span className="text-2xl">🏪</span>
          <div>
            <p className="font-bold text-lg leading-tight">TindaTrack</p>
            <p className="text-xs text-gray-400">Inventory & Sales</p>
          </div>
        </div>

        {/* User info */}
        <div className="px-6 py-4 border-b border-gray-700">
          <p className="text-sm font-medium truncate">{user?.name}</p>
          <p className="text-xs text-gray-400 capitalize mt-0.5">
            {user?.role}
            {user?.branchName && ` · ${user.branchName}`}
          </p>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {visibleItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700">
          <p className="text-xs text-gray-500">© 2026 TindaTrack</p>
        </div>
      </aside>
    </>
  );
}
