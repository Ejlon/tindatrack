// Bodega.jsx — central warehouse stock view, receive deliveries, audit log.

import { useState, useEffect, useCallback } from 'react';
import { bodegaAPI }   from '../api/bodega';
import { productsAPI } from '../api/products';
import Modal   from '../components/ui/Modal';
import Alert   from '../components/ui/Alert';
import Spinner from '../components/ui/Spinner';
import { formatCurrency, formatDateTime } from '../utils/formatters';

export default function Bodega() {
  const [stock,   setStock]   = useState([]);
  const [logs,    setLogs]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState('stock'); // 'stock' | 'logs'
  const [alert,   setAlert]   = useState({ type: '', msg: '' });

  // Receive modal
  const [receiveOpen,  setReceiveOpen]  = useState(false);
  const [products,     setProducts]     = useState([]);
  const [receiveForm,  setReceiveForm]  = useState({ product_id: '', quantity: '', reference: '', supplier: '' });
  const [saving,       setSaving]       = useState(false);
  const [formError,    setFormError]    = useState('');

  // Log filters
  const [logFilter, setLogFilter] = useState({ type: '', from: '', to: '' });

  const loadStock = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await bodegaAPI.stock();
      setStock(data.stock);
    } catch { setAlert({ type: 'error', msg: 'Failed to load bodega stock.' }); }
    finally  { setLoading(false); }
  }, []);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await bodegaAPI.logs({ ...logFilter, limit: 100 });
      setLogs(data.logs);
    } catch { setAlert({ type: 'error', msg: 'Failed to load logs.' }); }
    finally  { setLoading(false); }
  }, [logFilter]);

  useEffect(() => { if (tab === 'stock') loadStock(); else loadLogs(); }, [tab, loadStock, loadLogs]);

  const openReceive = async () => {
    if (!products.length) {
      const { data } = await productsAPI.list();
      setProducts(data.products);
    }
    setReceiveForm({ product_id: '', quantity: '', reference: '', supplier: '' });
    setFormError('');
    setReceiveOpen(true);
  };

  const handleReceive = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const { data } = await bodegaAPI.receive({
        product_id: parseInt(receiveForm.product_id),
        quantity:   parseInt(receiveForm.quantity),
        reference:  receiveForm.reference || undefined,
        supplier:   receiveForm.supplier  || undefined,
      });
      setAlert({ type: 'success', msg: data.message });
      setReceiveOpen(false);
      loadStock();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Receive failed.');
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Bodega (Warehouse)</h1>
        <button onClick={openReceive} className="btn-primary">📥 Receive Delivery</button>
      </div>

      <Alert type={alert.type} message={alert.msg} onClose={() => setAlert({ type:'', msg:'' })} />

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {['stock', 'logs'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tab === t ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t === 'stock' ? '📦 Current Stock' : '📋 Audit Log'}
          </button>
        ))}
      </div>

      {/* Stock tab */}
      {tab === 'stock' && (
        <div className="card p-0 overflow-hidden">
          {loading ? <div className="flex justify-center py-16"><Spinner size="lg" /></div> : (
            <div className="overflow-x-auto">
              <table className="table-auto w-full">
                <thead>
                  <tr>
                    <th>Product</th><th>Category</th><th>SKU</th><th>Unit</th>
                    <th>Qty in Bodega</th><th>Alert at</th><th>Status</th>
                    <th>Cost Price</th>
                  </tr>
                </thead>
                <tbody>
                  {stock.length === 0
                    ? <tr><td colSpan={8} className="text-center py-10 text-gray-400">No stock records.</td></tr>
                    : stock.map(s => (
                      <tr key={s.product_id}>
                        <td className="font-medium">{s.name}</td>
                        <td><span className="badge badge-gray">{s.category}</span></td>
                        <td className="font-mono text-xs text-gray-500">{s.sku}</td>
                        <td>{s.unit}</td>
                        <td className="text-lg font-bold">{s.quantity}</td>
                        <td className="text-gray-400">{s.low_stock_level}</td>
                        <td>
                          {s.is_low_stock
                            ? <span className="badge badge-red">⚠️ Low</span>
                            : <span className="badge badge-green">OK</span>}
                        </td>
                        <td>{formatCurrency(s.cost_price)}</td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Logs tab */}
      {tab === 'logs' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <select className="input w-36" value={logFilter.type}
              onChange={e => setLogFilter(f => ({ ...f, type: e.target.value }))}>
              <option value="">All types</option>
              <option value="in">Incoming (in)</option>
              <option value="out">Outgoing (out)</option>
            </select>
            <input type="date" className="input w-40" value={logFilter.from}
              onChange={e => setLogFilter(f => ({ ...f, from: e.target.value }))} />
            <input type="date" className="input w-40" value={logFilter.to}
              onChange={e => setLogFilter(f => ({ ...f, to: e.target.value }))} />
          </div>

          <div className="card p-0 overflow-hidden">
            {loading ? <div className="flex justify-center py-16"><Spinner size="lg" /></div> : (
              <div className="overflow-x-auto">
                <table className="table-auto w-full">
                  <thead>
                    <tr><th>Date</th><th>Type</th><th>Product</th><th>Qty</th><th>Reference</th><th>Supplier</th><th>By</th></tr>
                  </thead>
                  <tbody>
                    {logs.length === 0
                      ? <tr><td colSpan={7} className="text-center py-10 text-gray-400">No log entries.</td></tr>
                      : logs.map(l => (
                        <tr key={l.log_id}>
                          <td className="text-xs text-gray-400 whitespace-nowrap">{formatDateTime(l.date)}</td>
                          <td>
                            <span className={l.type === 'in' ? 'badge badge-green' : 'badge badge-yellow'}>
                              {l.type === 'in' ? '↓ IN' : '↑ OUT'}
                            </span>
                          </td>
                          <td className="font-medium">{l.product_name}</td>
                          <td className="font-semibold">{l.quantity}</td>
                          <td className="text-xs text-gray-500">{l.reference ?? '—'}</td>
                          <td className="text-xs text-gray-500">{l.supplier   ?? '—'}</td>
                          <td className="text-xs">{l.recorded_by_name ?? '—'}</td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Receive Delivery Modal */}
      <Modal isOpen={receiveOpen} onClose={() => setReceiveOpen(false)} title="📥 Receive Delivery">
        <Alert type="error" message={formError} onClose={() => setFormError('')} />
        <form onSubmit={handleReceive} className="mt-3 space-y-4">
          <div>
            <label className="label">Product</label>
            <select required className="input" value={receiveForm.product_id}
              onChange={e => setReceiveForm(f => ({ ...f, product_id: e.target.value }))}>
              <option value="">Select a product…</option>
              {products.map(p => (
                <option key={p.product_id} value={p.product_id}>{p.name} ({p.sku})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Quantity Received</label>
            <input required type="number" min="1" className="input" value={receiveForm.quantity}
              onChange={e => setReceiveForm(f => ({ ...f, quantity: e.target.value }))} />
          </div>
          <div>
            <label className="label">Reference / Invoice # <span className="text-gray-400 font-normal">(optional)</span></label>
            <input className="input" placeholder="e.g. DR-1001" value={receiveForm.reference}
              onChange={e => setReceiveForm(f => ({ ...f, reference: e.target.value }))} />
          </div>
          <div>
            <label className="label">Supplier <span className="text-gray-400 font-normal">(optional)</span></label>
            <input className="input" placeholder="e.g. JMR Grocery Distributor" value={receiveForm.supplier}
              onChange={e => setReceiveForm(f => ({ ...f, supplier: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setReceiveOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? <Spinner size="sm" /> : 'Record Delivery'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
