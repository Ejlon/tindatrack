// Dashboard.jsx — KPI cards, sales trend chart, recent sales, low-stock alerts.

import { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { reportsAPI } from '../api/reports';
import { useAuth }     from '../context/AuthContext';
import StatCard        from '../components/ui/StatCard';
import Spinner         from '../components/ui/Spinner';
import Alert           from '../components/ui/Alert';
import { formatCurrency, formatDateTime } from '../utils/formatters';

export default function Dashboard() {
  const { hasRole } = useAuth();
  const [dash,  setDash]  = useState(null);
  const [trend, setTrend] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [dashRes, trendRes] = await Promise.all([
          reportsAPI.dashboard(),
          reportsAPI.salesTrend({ days: 14 }),
        ]);
        setDash(dashRes.data);
        // Format dates for the chart x-axis
        setTrend(
          trendRes.data.trend.map(r => ({
            ...r,
            sale_date: new Date(r.sale_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
          }))
        );
      } catch {
        setError('Failed to load dashboard data.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Spinner size="lg" />
    </div>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      <Alert type="error" message={error} onClose={() => setError('')} />

      {/* ── KPI Cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Today's Revenue"
          value={formatCurrency(dash?.today?.revenue)}
          subtitle={`${dash?.today?.transaction_count ?? 0} transaction(s)`}
          icon="💰" color="blue"
        />
        <StatCard
          title="Today's Profit"
          value={formatCurrency(dash?.today?.profit)}
          subtitle="Revenue minus COGS"
          icon="📈" color="green"
        />
        <StatCard
          title="Monthly Revenue"
          value={formatCurrency(dash?.this_month?.revenue)}
          subtitle={formatCurrency(dash?.this_month?.profit) + ' profit'}
          icon="🗓️" color="blue"
        />
        <StatCard
          title="Low-Stock Alerts"
          value={(dash?.low_stock?.bodega ?? 0) + (dash?.low_stock?.store ?? 0)}
          subtitle={`Bodega: ${dash?.low_stock?.bodega ?? 0}  ·  Store: ${dash?.low_stock?.store ?? 0}`}
          icon="⚠️" color="yellow"
        />
      </div>

      {/* ── Sales Trend Chart ──────────────────────────────────────── */}
      <div className="card">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Sales Trend — Last 14 Days</h2>
        {trend.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">No sales data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="sale_date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₱${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Legend />
              <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} dot={false} name="Revenue" />
              <Line type="monotone" dataKey="profit"  stroke="#10b981" strokeWidth={2} dot={false} name="Profit" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Recent Sales ──────────────────────────────────────────── */}
      <div className="card">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Recent Transactions</h2>
        {!dash?.recent_sales?.length ? (
          <p className="text-sm text-gray-400 text-center py-6">No recent sales.</p>
        ) : (
          <div className="overflow-x-auto -mx-6 px-6">
            <table className="table-auto w-full">
              <thead>
                <tr>
                  <th>Sale #</th>
                  <th>Branch</th>
                  <th>Cashier</th>
                  <th>Total</th>
                  <th>Date & Time</th>
                </tr>
              </thead>
              <tbody>
                {dash.recent_sales.map(s => (
                  <tr key={s.sale_id}>
                    <td className="font-mono text-xs text-blue-600">#{s.sale_id}</td>
                    <td>{s.branch_name}</td>
                    <td>{s.cashier_name ?? '—'}</td>
                    <td className="font-semibold">{formatCurrency(s.total_amount)}</td>
                    <td className="text-gray-400 text-xs">{formatDateTime(s.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Branch Comparison (Owner only) ───────────────────────── */}
      {hasRole('owner') && <BranchComparison />}
    </div>
  );
}

// Sub-component so it only fetches when mounted (owner only)
function BranchComparison() {
  const [data, setData] = useState([]);
  useEffect(() => {
    reportsAPI.branchComparison({ days: 30 })
      .then(r => setData(r.data.comparison))
      .catch(() => {});
  }, []);

  if (!data.length) return null;

  return (
    <div className="card">
      <h2 className="text-base font-semibold text-gray-800 mb-4">Branch Comparison — Last 30 Days</h2>
      <div className="overflow-x-auto -mx-6 px-6">
        <table className="table-auto w-full">
          <thead>
            <tr>
              <th>Branch</th>
              <th>Transactions</th>
              <th>Revenue</th>
              <th>COGS</th>
              <th>Profit</th>
            </tr>
          </thead>
          <tbody>
            {data.map(b => (
              <tr key={b.branch_id}>
                <td className="font-medium">{b.branch_name}</td>
                <td>{b.transactions}</td>
                <td className="font-semibold text-blue-700">{formatCurrency(b.revenue)}</td>
                <td className="text-gray-500">{formatCurrency(b.cogs)}</td>
                <td className="font-semibold text-green-700">{formatCurrency(b.profit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
