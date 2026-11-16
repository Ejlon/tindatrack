import api from './axios';

export const transfersAPI = {
  list:   (params) => api.get('/transfers', { params }),
  get:    (id)     => api.get(`/transfers/${id}`),
  create: (data)   => api.post('/transfers', data),
};
