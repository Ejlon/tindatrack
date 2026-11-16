// utils/formatters.js  — Pure helper functions used across all pages.

// Format a number as Philippine Peso
export const formatCurrency = (value) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value ?? 0);

// Format a date string as "Nov 09, 2026"
export const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: '2-digit',
  });
};

// Format a date string with time as "Nov 09, 2026 2:35 PM"
export const formatDateTime = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-PH', {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
};

// Format a number with commas: 12345.6 → "12,345.60"
export const formatNumber = (value, decimals = 2) =>
  Number(value ?? 0).toLocaleString('en-PH', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

// Role badge colour helper
export const roleBadgeClass = (role) => {
  const map = { owner: 'badge-blue', manager: 'badge-green', cashier: 'badge-gray' };
  return map[role] || 'badge-gray';
};
