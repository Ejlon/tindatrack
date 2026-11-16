import api from './axios';

export const branchesAPI = {
  list:   ()         => api.get('/branches'),
  get:    (id)       => api.get(`/branches/${id}`),
  create: (data)     => api.post('/branches', data),
  update: (id, data) => api.put(`/branches/${id}`, data),
};
