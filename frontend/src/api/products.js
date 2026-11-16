import api from './axios';

export const productsAPI = {
  list:              (params) => api.get('/products', { params }),
  get:               (id)     => api.get(`/products/${id}`),
  create:            (data)   => api.post('/products', data),
  update:            (id, data) => api.put(`/products/${id}`, data),
  remove:            (id)     => api.delete(`/products/${id}`),
  lowStock:          ()       => api.get('/products/low-stock'),
  updateStockLevels: (id, data) => api.put(`/products/${id}/stock-level`, data),
};
