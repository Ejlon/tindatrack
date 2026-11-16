// Inventory.jsx — full CRUD product list with stock levels and low-stock badges.

import { useState, useEffect, useCallback } from 'react';
import { productsAPI } from '../api/products';
import { useAuth }     from '../context/AuthContext';
import Modal           from '../components/ui/Modal';
import Alert           from '../components/ui/Alert';
import Spinner         from '../components/ui/Spinner';
import { formatCurrency } from '../utils/formatters';

const EMPTY_FORM = {
  name: '', category: '', sku: '', cost_price: '', selling_price: '', unit: 'pc',
};

export default function Inventory() {
  const { hasRole } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [alert,    setAlert]    = useState({ type: '', msg: '' });

  // Modal state
  const [modalOpen,    setModalOpen]    = useState(false);
  const [editProduct,  setEditProduct]  = useState(null); // null = create mode
  const [form,         setForm]         = useState(EMPTY_FORM);
  const [saving,       setSaving]       = useState(false);
  const [formError,    setFormError]    = useState('');

  // Low-stock panel
  const [showLowStock, setShowLowStock] = useState(false);
  const [lowStock,     setLowStock]     = useState([]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await productsAPI.list();
      setProducts(data.products);
    } catch {
      setAlert({ type: 'error', msg: 'Failed to load products.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const loadLowStock = async () => {
    const { data } = await productsAPI.lowStock();
    setLowStock(data.alerts);
    setShowLowStock(true);
  };

  // ── Open modal ──────────────────────────────────────────────────
  const openCreate = () => {
    setEditProduct(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setModalOpen(true);
  };
  const openEdit = (p) => {
    setEditProduct(p);
    setForm({
      name: p.name, category: p.category, sku: p.sku,
      cost_price: p.cost_price, selling_price: p.selling_price, unit: p.unit,
    });
    setFormError('');
    setModalOpen(true);
  };

  // ── Save ────────────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        ...form,
        cost_price:    parseFloat(form.cost_price),
        selling_price: parseFloat(form.selling_price),
      };
      if (editProduct) {
        await productsAPI.update(editProduct.product_id, payload);
        setAlert({ type: 'success', msg: 'Product updated.' });
      } else {
        await productsAPI.create(payload);
        setAlert({ type: 'success', msg: 'Product created.' });
      }
      setModalOpen(false);
      loadProducts();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  // ── Archive ─────────────────────────────────────────────────────
  const handleArchive = async (p) => {
    if (!window.confirm(`Archive "${p.name}"? It will no longer appear in sales.`)) return;
    try {
      await productsAPI.remove(p.product_id);
      setAlert({ type: 'success', msg: `"${p.name}" archived.` });
      loadProducts();
    } catch {
      setAlert({ type: 'error', msg: 'Archive failed.' });
    }
  };

  // ── Filter ──────────────────────────────────────────────────────
  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.sku.toLowerCase().includes(search.toLowerCase()) ||
    p.category.toLowerCase().includes(search.toLowerCase())
  );

  const canEdit = hasRole('owner', 'manager');

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
        <div className="flex gap-2">
          <button onClick={loadLowStock} className="btn-secondary text-yellow-700 border-yellow-300 bg-yellow-50 hover:bg-yellow-100">
            ⚠️ Low Stock
          </button>
          {canEdit && <button onClick={openCreate} className="btn-primary">+ Add Product</button>}
        </div>
      </div>

      <Alert type={alert.type} message={alert.msg} onClose={() => setAlert({ type:'', msg:'' })} />

      {/* Search */}
      <input
        type="text" placeholder="Search by name, SKU, or category…"
        value={search} onChange={e => setSearch(e.target.value)}
        className="input max-w-sm"
      />

      {/* Products table */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-auto w-full">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>SKU</th>
                  <th>Cost</th>
                  <th>Price</th>
                  <th>Unit</th>
                  <th>Bodega</th>
                  <th>Branch Stock</th>
                  {canEdit && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={canEdit ? 9 : 8} className="text-center py-10 text-gray-400">No products found.</td></tr>
                ) : filtered.map(p => {
                  const bodegaLow = p.bodega_qty <= p.bodega_low_stock_level;
                  return (
                    <tr key={p.product_id}>
                      <td className="font-medium">{p.name}</td>
                      <td><span className="badge badge-gray">{p.category}</span></td>
                      <td className="font-mono text-xs text-gray-500">{p.sku}</td>
                      <td>{formatCurrency(p.cost_price)}</td>
                      <td className="font-semibold text-blue-700">{formatCurrency(p.selling_price)}</td>
                      <td>{p.unit}</td>
                      <td>
                        <span className={bodegaLow ? 'badge badge-red' : 'badge badge-green'}>
                          {p.bodega_qty ?? 0}
                        </span>
                      </td>
                      <td>
                        <div className="flex flex-col gap-0.5">
                          {(p.store_stock || []).map(ss => (
                            <span key={ss.branch_id} className="text-xs text-gray-600">
                              {ss.branch_name}:{' '}
                              <span className={ss.is_low_stock ? 'text-red-600 font-semibold' : 'font-medium'}>
                                {ss.quantity}
                              </span>
                            </span>
                          ))}
                        </div>
                      </td>
                      {canEdit && (
                        <td>
                          <div className="flex gap-2">
                            <button onClick={() => openEdit(p)}
                              className="text-blue-600 hover:underline text-xs font-medium">Edit</button>
                            <button onClick={() => handleArchive(p)}
                              className="text-red-500 hover:underline text-xs font-medium">Archive</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Low-stock modal */}
      <Modal isOpen={showLowStock} onClose={() => setShowLowStock(false)} title="⚠️ Low-Stock Alerts" size="lg">
        {lowStock.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">No low-stock items. 🎉</p>
        ) : (
          <table className="table-auto w-full">
            <thead>
              <tr><th>Product</th><th>Location</th><th>Qty</th><th>Threshold</th></tr>
            </thead>
            <tbody>
              {lowStock.map((item, i) => (
                <tr key={i}>
                  <td className="font-medium">{item.name}</td>
                  <td>{item.branch_name}</td>
                  <td><span className="badge badge-red">{item.quantity}</span></td>
                  <td className="text-gray-400">≤ {item.low_stock_level}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>

      {/* Add / Edit product modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editProduct ? 'Edit Product' : 'Add New Product'}
      >
        <Alert type="error" message={formError} onClose={() => setFormError('')} />
        <form onSubmit={handleSave} className="mt-3 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Product Name</label>
              <input required className="input" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="label">Category</label>
              <input required className="input" value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
            </div>
            <div>
              <label className="label">SKU / Barcode</label>
              <input required className="input" value={form.sku}
                onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} />
            </div>
            <div>
              <label className="label">Cost Price (₱)</label>
              <input required type="number" min="0" step="0.01" className="input"
                value={form.cost_price}
                onChange={e => setForm(f => ({ ...f, cost_price: e.target.value }))} />
            </div>
            <div>
              <label className="label">Selling Price (₱)</label>
              <input required type="number" min="0" step="0.01" className="input"
                value={form.selling_price}
                onChange={e => setForm(f => ({ ...f, selling_price: e.target.value }))} />
            </div>
            <div>
              <label className="label">Unit</label>
              <select className="input" value={form.unit}
                onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                {['pc','pack','kg','can','bottle','sachet','sack','tray','box','liter'].map(u =>
                  <option key={u} value={u}>{u}</option>
                )}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? <Spinner size="sm" /> : editProduct ? 'Save Changes' : 'Create Product'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
