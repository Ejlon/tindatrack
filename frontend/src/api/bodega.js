import api from './axios';

export const bodegaAPI = {
  stock:   (params) => api.get('/bodega/stock', { params }),
  receive: (data)   => api.post('/bodega/receive', data),
  logs:    (params) => api.get('/bodega/logs', { params }),
};
