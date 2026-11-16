// Transfers.jsx — create bodega→branch transfers and view transfer history.

import { useState, useEffect, useCallback } from 'react';
import { transfersAPI } from '../api/transfers';
import { productsAPI }  from '../api/products';
import { bodegaAPI }    from '../api/bodega';
import { branchesAPI }  from '../api/branches';
import Modal   from '../components/ui/Modal';
import Alert   from '../components/ui/Alert';
import Spinner from '../components/ui/Spinner';
import { formatDateTime } from '../utils/formatters';

export default function Transfers() {
  const [transfers, setTransfers] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [alert,     setAlert]     = useState({ type: '', msg: '' });
  const [filter,    setFilter]    = useState({ from: '', to: '' });

  // Transfer modal
  const [modalOpen, setModalOpen] = useState(false);
  const [products,  setProducts]  = useState([]);
  const [branches,  setBranches]  = useState([]);
  const [bodegaQty, setBodegaQty] = useState(null); // live bodega qty preview
  const [form,      setForm]      = useState({ product_id: '', branch_id: '', quantity: '', notes: '' });
  const [saving,    setSaving]    = useState(false);
  const [formError, setFormError] = useState('');

  const loadTransfers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await transfersAPI.list({ ...filter, limit: 100 });
      setTransfers(data.transfers);
    } catch { setAlert({ type: 'error', msg: 'Failed to load transfers.' }); }
    finally  { setLoading(false); }
  }, [filter]);

  useEffect(() => { loadTransfers(); }, [loadTransfers]);

  const openModal = async () => {
    if (!products.length) {
      const [pRes, bRes] = await Promise.all([productsAPI.list(), branchesAPI.list()]);
      setProducts(pRes.data.products);
      setBranches(bRes.data.branches);
    }
    setForm({ product_id: '', branch_id: '', quantity: '', notes: '' });
    setBodegaQty(null);
    setFormError('');
    setModalOpen(true);
  };

  // Live-update bodega qty preview when product changes
  const handleProductChange = async (productId) => {
    setForm(f => ({ ...f, product_id: productId }));
    if (!productId) { setBodegaQty(null); return; }
    try {
      const { data } = await bodegaAPI.stock();
      const found = data.stock.find(s => s.product_id === parseInt(productId));
      setBodegaQty(found ? found.quantity : 0);
    } catch { setBodegaQty(null); }
  };

  const handleTransfer = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const { data } = await transfersAPI.create({
        product_id: parseInt(form.product_id),
        branch_id:  parseInt(form.branch_id),
        quantity:   parseInt(form.quantity),
        notes:      form.notes || undefined,
      });
      setAlert({ type: 'success', msg: data.message });
      setModalOpen(false);
      loadTransfers();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Transfer failed.');
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Stock Transfers</h1>
        <button onClick={openModal} className="btn-primary">🔁 New Transfer</button>
      </div>

      <Alert type={alert.type} message={alert.msg} onClose={() => setAlert({ type:'', msg:'' })} />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input type="date" className="input w-40" value={filter.from}
          onChange={e => setFilter(f => ({ ...f, from: e.target.value }))} />
        <input type="date" className="input w-40" value={filter.to}
          onChange={e => setFilter(f => ({ ...f, to: e.target.value }))} />
      </div>

      {/* Transfers table */}
      <div className="card p-0 overflow-hidden">
        {loading ? <div className="flex justify-center py-16"><Spinner size="lg" /></div> : (
          <div className="overflow-x-auto">
            <table className="table-auto w-full">
              <thead>
                <tr>
                  <th>#</th><th>Date</th><th>Product</th><th>SKU</th>
                  <th>Qty</th><th>To Branch</th><th>By</th>
                </tr>
              </thead>
              <tbody>
                {transfers.length === 0
                  ? <tr><td colSpan={7} className="text-center py-10 text-gray-400">No transfers found.</td></tr>
                  : transfers.map(t => (
                    <tr key={t.transfer_id}>
                      <td className="font-mono text-xs text-blue-600">#{t.transfer_id}</td>
                      <td className="text-xs text-gray-400 whitespace-nowrap">{formatDateTime(t.date)}</td>
                      <td className="font-medium">{t.product_name}</td>
                      <td className="font-mono text-xs text-gray-500">{t.sku}</td>
                      <td><span className="badge badge-blue">{t.quantity} {t.unit}</span></td>
                      <td>{t.branch_name}</td>
                      <td className="text-xs text-gray-500">{t.transferred_by_name ?? '—'}</td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Transfer Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="🔁 Transfer to Branch">
        <Alert type="error" message={formError} onClose={() => setFormError('')} />
        <form onSubmit={handleTransfer} className="mt-3 space-y-4">
          <div>
            <label className="label">Product</label>
            <select required className="input" value={form.product_id}
              onChange={e => handleProductChange(e.target.value)}>
              <option value="">Select product…</option>
              {products.map(p => <option key={p.product_id} value={p.product_id}>{p.name} ({p.sku})</option>)}
            </select>
            {bodegaQty !== null && (
              <p className="text-xs mt-1 text-gray-500">
                Available in bodega:{' '}
                <span className={`font-semibold ${bodegaQty === 0 ? 'text-red-600' : 'text-green-700'}`}>
                  {bodegaQty}
                </span>
              </p>
            )}
          </div>
          <div>
            <label className="label">Destination Branch</label>
            <select required className="input" value={form.branch_id}
              onChange={e => setForm(f => ({ ...f, branch_id: e.target.value }))}>
              <option value="">Select branch…</option>
              {branches.map(b => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Quantity</label>
            <input required type="number" min="1" className="input" value={form.quantity}
              onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
          </div>
          <div>
            <label className="label">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
            <input className="input" value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? <Spinner size="sm" /> : 'Transfer Stock'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
