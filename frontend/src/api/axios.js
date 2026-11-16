// api/axios.js
// Creates a pre-configured Axios instance used by all API modules.
//
// - baseURL points to /api  (Vite proxy forwards it to localhost:5000 during dev)
// - Request interceptor:  automatically attaches the JWT from localStorage
// - Response interceptor: logs out the user on 401 (expired/invalid token)

import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000, // 10 seconds
});

// ── Request interceptor ────────────────────────────────────────────────────
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('tt_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response interceptor ───────────────────────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid — clear storage and redirect to login
      localStorage.removeItem('tt_token');
      localStorage.removeItem('tt_user');
      window.location.href = '/login';
    }
    // Bubble up the error so each call site can handle it
    return Promise.reject(error);
  }
);

export default api;
