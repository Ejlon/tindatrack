// Sales.jsx — Point of Sale (POS) with cart + sales history tab.

import { useState, useEffect, useCallback } from 'react';
import { salesAPI }    from '../api/sales';
import { productsAPI } from '../api/products';
import { useAuth }     from '../context/AuthContext';
import Modal   from '../components/ui/Modal';
import Alert   from '../components/ui/Alert';
import Spinner from '../components/ui/Spinner';
import { formatCurrency, formatDateTime } from '../utils/formatters';

export default function Sales() {
  const { user } = useAuth();
  const [tab, setTab] = useState('pos'); // 'pos' | 'history'

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Sales</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {[['pos','🛒 Point of Sale'], ['history','📋 Sales History']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tab === key ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'pos'     && <POSPanel user={user} />}
      {tab === 'history' && <SalesHistory />}
    </div>
  );
}

// ── POS Panel ───────────────────────────────────────────────────────────────
function POSPanel({ user }) {
  const [products, setProducts]   = useState([]);
  const [search,   setSearch]     = useState('');
  const [cart,     setCart]       = useState([]); // [{ product, quantity }]
  const [saving,   setSaving]     = useState(false);
  const [alert,    setAlert]      = useState({ type: '', msg: '' });
  const [receipt,  setReceipt]    = useState(null); // successful sale data

  useEffect(() => {
    productsAPI.list()
      .then(r => setProducts(r.data.products))
      .catch(() => {});
  }, []);

  const filtered = search.trim()
    ? products.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.sku.toLowerCase().includes(search.toLowerCase()))
    : products;

  // Add to cart or increment qty
  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(c => c.product.product_id === product.product_id);
      if (existing) {
        return prev.map(c =>
          c.product.product_id === product.product_id
            ? { ...c, quantity: c.quantity + 1 }
            : c
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateQty = (productId, qty) => {
    if (qty < 1) { removeFromCart(productId); return; }
    setCart(prev => prev.map(c =>
      c.product.product_id === productId ? { ...c, quantity: qty } : c
    ));
  };

  const removeFromCart = (productId) =>
    setCart(prev => prev.filter(c => c.product.product_id !== productId));

  const cartTotal = cart.reduce((s, c) => s + c.quantity * c.product.selling_price, 0);

  const handleCheckout = async () => {
    if (!cart.length) return;
    setSaving(true);
    setAlert({ type: '', msg: '' });
    try {
      const payload = {
        items: cart.map(c => ({ product_id: c.product.product_id, quantity: c.quantity })),
      };
      const { data } = await salesAPI.create(payload);
      setReceipt(data);
      setCart([]);
      setSearch('');
    } catch (err) {
      const errData = err.response?.data;
      if (errData?.insufficient_items) {
        const names = errData.insufficient_items.map(i => `${i.name} (have ${i.available}, need ${i.requested})`);
        setAlert({ type: 'error', msg: 'Insufficient stock: ' + names.join('; ') });
      } else {
        setAlert({ type: 'error', msg: errData?.message || 'Checkout failed.' });
      }
    } finally { setSaving(false); }
  };

  // Find the store stock for the user's branch
  const getStoreQty = (product) => {
    if (!user?.branchId) return null;
    // branch_id from API and branchId from JWT are both numbers; coerce to be safe
    const ss = product.store_stock?.find(s => Number(s.branch_id) === Number(user.branchId));
    return ss?.quantity ?? 0;
  };

  return (
    <>
      <Alert type={alert.type} message={alert.msg} onClose={() => setAlert({ type:'', msg:'' })} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Product picker */}
        <div className="lg:col-span-2 space-y-3">
          <input type="text" placeholder="Search product by name or SKU…"
            value={search} onChange={e => setSearch(e.target.value)} className="input" />
          <div className="card p-0 overflow-hidden max-h-[55vh] overflow-y-auto">
            <table className="table-auto w-full">
              <thead className="sticky top-0">
                <tr><th>Product</th><th>Price</th><th>In Stock</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.length === 0
                  ? <tr><td colSpan={4} className="text-center py-10 text-gray-400">No products.</td></tr>
                  : filtered.map(p => {
                    const qty = getStoreQty(p);
                    return (
                      <tr key={p.product_id}>
                        <td>
                          <p className="font-medium text-sm">{p.name}</p>
                          <p className="text-xs text-gray-400">{p.sku}</p>
                        </td>
                        <td className="font-semibold text-blue-700 text-sm">{formatCurrency(p.selling_price)}</td>
                        <td>
                          <span className={`badge ${qty === 0 ? 'badge-red' : qty <= 5 ? 'badge-yellow' : 'badge-green'}`}>
                            {qty ?? '—'}
                          </span>
                        </td>
                        <td>
                          <button
                            onClick={() => addToCart(p)}
                            disabled={qty === 0}
                            className="btn-primary text-xs px-3 py-1 disabled:opacity-40"
                          >
                            + Add
                          </button>
                        </td>
                      </tr>
                    );
                  })
                }
              </tbody>
            </table>
          </div>
        </div>

        {/* Cart */}
        <div className="card flex flex-col gap-4">
          <h2 className="font-semibold text-gray-800">🛒 Cart</h2>
          {cart.length === 0
            ? <p className="text-sm text-gray-400 text-center py-8">Cart is empty. Add products from the left.</p>
            : (
              <div className="flex-1 space-y-3 overflow-y-auto max-h-72">
                {cart.map(c => (
                  <div key={c.product.product_id} className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.product.name}</p>
                      <p className="text-xs text-gray-400">{formatCurrency(c.product.selling_price)} each</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => updateQty(c.product.product_id, c.quantity - 1)}
                        className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-sm font-bold flex items-center justify-center">
                        −
                      </button>
                      <input
                        type="number" min="1" value={c.quantity}
                        onChange={e => updateQty(c.product.product_id, parseInt(e.target.value) || 1)}
                        className="w-12 text-center input py-0.5 px-1 text-sm"
                      />
                      <button onClick={() => updateQty(c.product.product_id, c.quantity + 1)}
                        className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-sm font-bold flex items-center justify-center">
                        +
                      </button>
                    </div>
                    <span className="text-sm font-semibold w-20 text-right">
                      {formatCurrency(c.quantity * c.product.selling_price)}
                    </span>
                    <button onClick={() => removeFromCart(c.product.product_id)}
                      className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
                  </div>
                ))}
              </div>
            )
          }

          {/* Total & checkout */}
          <div className="border-t border-gray-200 pt-4 space-y-3">
            <div className="flex justify-between text-lg font-bold">
              <span>Total</span>
              <span className="text-blue-700">{formatCurrency(cartTotal)}</span>
            </div>
            <button
              onClick={handleCheckout}
              disabled={!cart.length || saving}
              className="btn-primary w-full justify-center py-2.5 text-base"
            >
              {saving ? <Spinner size="sm" /> : '✅ Complete Sale'}
            </button>
            {cart.length > 0 && (
              <button onClick={() => setCart([])} className="btn-secondary w-full justify-center text-xs">
                Clear Cart
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Receipt Modal */}
      {receipt && (
        <Modal isOpen={true} onClose={() => setReceipt(null)} title="✅ Sale Complete!">
          <div className="text-center space-y-2 py-2">
            <p className="text-4xl">🧾</p>
            <p className="text-sm text-gray-500">Sale #{receipt.sale_id}</p>
            <p className="text-3xl font-bold text-blue-700">{formatCurrency(receipt.total_amount)}</p>
          </div>
          <div className="mt-4 border rounded-lg overflow-hidden">
            <table className="table-auto w-full text-sm">
              <thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Subtotal</th></tr></thead>
              <tbody>
                {receipt.items.map(item => (
                  <tr key={item.product_id}>
                    <td>{item.name}</td>
                    <td>{item.quantity}</td>
                    <td>{formatCurrency(item.price)}</td>
                    <td className="font-semibold">{formatCurrency(item.quantity * item.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={() => setReceipt(null)} className="btn-primary w-full justify-center mt-4">
            New Sale
          </button>
        </Modal>
      )}
    </>
  );
}

// ── Sales History ────────────────────────────────────────────────────────────
function SalesHistory() {
  const [sales,   setSales]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState({ from: '', to: '' });
  const [detail,  setDetail]  = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await salesAPI.list({ ...filter, limit: 100 });
      setSales(data.sales);
    } catch {} finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const viewDetail = async (saleId) => {
    const { data } = await salesAPI.get(saleId);
    setDetail(data.sale);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <input type="date" className="input w-40" value={filter.from}
          onChange={e => setFilter(f => ({ ...f, from: e.target.value }))} />
        <input type="date" className="input w-40" value={filter.to}
          onChange={e => setFilter(f => ({ ...f, to: e.target.value }))} />
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? <div className="flex justify-center py-16"><Spinner size="lg" /></div> : (
          <div className="overflow-x-auto">
            <table className="table-auto w-full">
              <thead>
                <tr><th>Sale #</th><th>Date</th><th>Branch</th><th>Cashier</th><th>Items</th><th>Total</th><th></th></tr>
              </thead>
              <tbody>
                {sales.length === 0
                  ? <tr><td colSpan={7} className="text-center py-10 text-gray-400">No sales found.</td></tr>
                  : sales.map(s => (
                    <tr key={s.sale_id}>
                      <td className="font-mono text-xs text-blue-600">#{s.sale_id}</td>
                      <td className="text-xs text-gray-400 whitespace-nowrap">{formatDateTime(s.date)}</td>
                      <td>{s.branch_name}</td>
                      <td>{s.cashier_name ?? '—'}</td>
                      <td>{s.item_count}</td>
                      <td className="font-semibold text-blue-700">{formatCurrency(s.total_amount)}</td>
                      <td>
                        <button onClick={() => viewDetail(s.sale_id)}
                          className="text-blue-600 hover:underline text-xs font-medium">View</button>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sale detail modal */}
      {detail && (
        <Modal isOpen={true} onClose={() => setDetail(null)} title={`Sale #${detail.sale_id} Receipt`}>
          <p className="text-xs text-gray-500 mb-3">
            {formatDateTime(detail.date)} · {detail.branch_name} · {detail.cashier_name ?? 'N/A'}
          </p>
          <table className="table-auto w-full text-sm border rounded-lg overflow-hidden">
            <thead>
              <tr><th>Product</th><th>Qty</th><th>Price</th><th>Subtotal</th><th>Profit</th></tr>
            </thead>
            <tbody>
              {detail.items?.map(item => (
                <tr key={item.sale_item_id}>
                  <td>{item.product_name}</td>
                  <td>{item.quantity}</td>
                  <td>{formatCurrency(item.price)}</td>
                  <td className="font-semibold">{formatCurrency(item.line_revenue)}</td>
                  <td className="text-green-700">{formatCurrency(item.line_profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-between font-bold text-lg border-t border-gray-200 mt-3 pt-3">
            <span>Total</span>
            <span className="text-blue-700">{formatCurrency(detail.total_amount)}</span>
          </div>
        </Modal>
      )}
    </div>
  );
}
