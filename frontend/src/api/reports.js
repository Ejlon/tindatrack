import api from './axios';

export const reportsAPI = {
  dashboard:        (params) => api.get('/reports/dashboard',        { params }),
  salesTrend:       (params) => api.get('/reports/sales-trend',      { params }),
  bestSellers:      (params) => api.get('/reports/best-sellers',     { params }),
  stockLevels:      ()       => api.get('/reports/stock-levels'),
  branchComparison: (params) => api.get('/reports/branch-comparison',{ params }),
};
