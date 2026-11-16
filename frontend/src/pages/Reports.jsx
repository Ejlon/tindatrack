// Reports.jsx — sales trend, branch comparison, best sellers, stock levels.

import { useState, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell,
} from 'recharts';
import { reportsAPI } from '../api/reports';
import { useAuth }    from '../context/AuthContext';
import Spinner        from '../components/ui/Spinner';
import Alert          from '../components/ui/Alert';
import { formatCurrency, formatNumber } from '../utils/formatters';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function Reports() {
  const { hasRole } = useAuth();
  const [days,   setDays]   = useState(30);
  const [tab,    setTab]    = useState('trend');
  const [error,  setError]  = useState('');

  const [trend,       setTrend]       = useState([]);
  const [bestSellers, setBestSellers] = useState([]);
  const [comparison,  setComparison]  = useState([]);
  const [stockLevels, setStockLevels] = useState([]);
  const [loading,     setLoading]     = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const promises = [
          reportsAPI.salesTrend({ days }),
          reportsAPI.bestSellers({ days, limit: 10 }),
          reportsAPI.stockLevels(),
        ];
        if (hasRole('owner')) promises.push(reportsAPI.branchComparison({ days }));

        const results = await Promise.all(promises);
        setTrend(results[0].data.trend.map(r => ({
          ...r,
          date: new Date(r.sale_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
        })));
        setBestSellers(results[1].data.best_sellers);
        setStockLevels(results[2].data.stock_levels);
        if (hasRole('owner')) setComparison(results[3].data.comparison);
      } catch {
        setError('Failed to load report data.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [days, hasRole]);

  const tabs = [
    { key: 'trend',       label: '📈 Sales Trend' },
    { key: 'best',        label: '🏆 Best Sellers' },
    { key: 'stock',       label: '📦 Stock Levels' },
    ...(hasRole('owner') ? [{ key: 'compare', label: '🏪 Branch Comparison' }] : []),
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">Period:</label>
          <select className="input w-32" value={days} onChange={e => setDays(+e.target.value)}>
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
        </div>
      </div>

      <Alert type="error" message={error} onClose={() => setError('')} />

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tab === t.key ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-24"><Spinner size="lg" /></div>
      ) : (
        <>
          {/* ── Sales Trend ───────────────────────────────────────── */}
          {tab === 'trend' && (
            <div className="card">
              <h2 className="font-semibold text-gray-800 mb-4">Daily Revenue & Profit — Last {days} Days</h2>
              {trend.length === 0
                ? <p className="text-gray-400 text-center py-10">No sales data for this period.</p>
                : (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={trend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₱${(v/1000).toFixed(0)}k`} />
                      <Tooltip formatter={v => formatCurrency(v)} />
                      <Legend />
                      <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} dot={false} name="Revenue" />
                      <Line type="monotone" dataKey="profit"  stroke="#10b981" strokeWidth={2} dot={false} name="Profit" />
                      <Line type="monotone" dataKey="cogs"    stroke="#f59e0b" strokeWidth={1} dot={false} name="COGS" strokeDasharray="5 5" />
                    </LineChart>
                  </ResponsiveContainer>
                )
              }
              {/* Summary row */}
              {trend.length > 0 && (
                <div className="grid grid-cols-3 gap-4 mt-6 pt-4 border-t border-gray-100">
                  {[
                    ['Total Revenue', trend.reduce((s, r) => s + +r.revenue, 0)],
                    ['Total Profit',  trend.reduce((s, r) => s + +r.profit, 0)],
                    ['Transactions',  trend.reduce((s, r) => s + +r.transactions, 0)],
                  ].map(([label, val]) => (
                    <div key={label} className="text-center">
                      <p className="text-xs text-gray-400">{label}</p>
                      <p className="font-bold text-gray-900 mt-1">
                        {typeof val === 'number' && label !== 'Transactions' ? formatCurrency(val) : formatNumber(val, 0)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Best Sellers ──────────────────────────────────────── */}
          {tab === 'best' && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <div className="card">
                <h2 className="font-semibold text-gray-800 mb-4">Top Products by Quantity Sold</h2>
                {bestSellers.length === 0
                  ? <p className="text-gray-400 text-center py-10">No data.</p>
                  : (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={bestSellers} layout="vertical" margin={{ left: 10, right: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="total_qty_sold" name="Units Sold" radius={[0,4,4,0]}>
                          {bestSellers.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )
                }
              </div>
              <div className="card">
                <h2 className="font-semibold text-gray-800 mb-4">Best Sellers Table</h2>
                <div className="overflow-x-auto -mx-6 px-6">
                  <table className="table-auto w-full">
                    <thead>
                      <tr><th>#</th><th>Product</th><th>Units Sold</th><th>Revenue</th><th>Profit</th></tr>
                    </thead>
                    <tbody>
                      {bestSellers.map((p, i) => (
                        <tr key={p.product_id}>
                          <td className="text-gray-400 text-xs">{i + 1}</td>
                          <td>
                            <p className="font-medium text-sm">{p.name}</p>
                            <p className="text-xs text-gray-400">{p.category}</p>
                          </td>
                          <td className="font-semibold">{p.total_qty_sold} {p.unit}</td>
                          <td className="text-blue-700 font-semibold">{formatCurrency(p.total_revenue)}</td>
                          <td className="text-green-700 font-semibold">{formatCurrency(p.total_profit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── Stock Levels ──────────────────────────────────────── */}
          {tab === 'stock' && (
            <div className="card p-0 overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-800">Current Stock Snapshot</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="table-auto w-full">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Category</th>
                      <th>Bodega</th>
                      {stockLevels[0]?.branches?.map(b => <th key={b.branch_id}>{b.branch_name}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {stockLevels.map(p => (
                      <tr key={p.product_id}>
                        <td className="font-medium">{p.name}</td>
                        <td><span className="badge badge-gray">{p.category}</span></td>
                        <td>
                          <span className={p.bodega_low ? 'badge badge-red' : 'badge badge-green'}>
                            {p.bodega_qty}
                          </span>
                        </td>
                        {p.branches.map(b => (
                          <td key={b.branch_id}>
                            <span className={b.is_low_stock ? 'badge badge-red' : 'badge badge-green'}>
                              {b.quantity}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Branch Comparison (Owner only) ──────────────────── */}
          {tab === 'compare' && hasRole('owner') && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <div className="card">
                <h2 className="font-semibold text-gray-800 mb-4">Revenue by Branch</h2>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={comparison} margin={{ top: 5, right: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="branch_name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₱${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={v => formatCurrency(v)} />
                    <Legend />
                    <Bar dataKey="revenue" name="Revenue" fill="#3b82f6" radius={[4,4,0,0]} />
                    <Bar dataKey="profit"  name="Profit"  fill="#10b981" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="card">
                <h2 className="font-semibold text-gray-800 mb-4">Branch Summary Table</h2>
                <table className="table-auto w-full">
                  <thead>
                    <tr><th>Branch</th><th>Transactions</th><th>Revenue</th><th>Profit</th></tr>
                  </thead>
                  <tbody>
                    {comparison.map(b => (
                      <tr key={b.branch_id}>
                        <td className="font-medium">{b.branch_name}</td>
                        <td>{b.transactions}</td>
                        <td className="font-semibold text-blue-700">{formatCurrency(b.revenue)}</td>
                        <td className="font-semibold text-green-700">{formatCurrency(b.profit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
