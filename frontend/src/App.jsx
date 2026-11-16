// App.jsx
// Defines the entire client-side route tree using React Router v6.
//
// Route structure:
//   /login                 → Login page (public)
//   /                      → Protected shell (Layout with Sidebar + Navbar)
//     /                    → Dashboard
//     /inventory           → Inventory management
//     /bodega              → Bodega / warehouse  (owner + manager only)
//     /transfers           → Stock transfers     (owner + manager only)
//     /sales               → Sales / POS
//     /reports             → Reports & charts    (owner + manager only)
//   *                      → 404 Not Found

import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider }     from './context/AuthContext';
import ProtectedRoute       from './components/layout/ProtectedRoute';
import Layout               from './components/layout/Layout';
import Login                from './pages/Login';
import Dashboard            from './pages/Dashboard';
import Inventory            from './pages/Inventory';
import Bodega               from './pages/Bodega';
import Transfers            from './pages/Transfers';
import Sales                from './pages/Sales';
import Reports              from './pages/Reports';
import NotFound             from './pages/NotFound';

export default function App() {
  return (
    // AuthProvider must wrap Routes so every child can call useAuth()
    <AuthProvider>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />

        {/* Protected shell — requires login */}
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="inventory"  element={<Inventory />} />
            <Route path="sales"      element={<Sales />} />

            {/* Owner + Manager only */}
            <Route element={<ProtectedRoute roles={['owner', 'manager']} />}>
              <Route path="bodega"    element={<Bodega />} />
              <Route path="transfers" element={<Transfers />} />
              <Route path="reports"   element={<Reports />} />
            </Route>
          </Route>
        </Route>

        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  );
}
