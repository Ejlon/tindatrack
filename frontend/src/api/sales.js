import api from './axios';

export const salesAPI = {
  list:   (params) => api.get('/sales', { params }),
  get:    (id)     => api.get(`/sales/${id}`),
  create: (data)   => api.post('/sales', data),
};
