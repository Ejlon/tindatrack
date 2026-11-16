// context/AuthContext.jsx
// Provides authentication state to the entire app via React Context.
//
// What it stores:
//   user  — the decoded user object (or null if not logged in)
//   token — the raw JWT string (also stored in localStorage for persistence)
//
// What it exposes:
//   login(token, user)  — called after a successful /api/auth/login response
//   logout()            — clears state and localStorage, redirects to /login
//   isAuthenticated     — boolean convenience flag
//   hasRole(...roles)   — returns true if the current user has one of the given roles

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Initialise from localStorage so the user stays logged in after a page refresh
  const [token, setToken] = useState(() => localStorage.getItem('tt_token') || null);
  const [user,  setUser]  = useState(() => {
    try {
      const stored = localStorage.getItem('tt_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const navigate = useNavigate();

  // Persist to localStorage whenever they change
  useEffect(() => {
    if (token && user) {
      localStorage.setItem('tt_token', token);
      localStorage.setItem('tt_user',  JSON.stringify(user));
    } else {
      localStorage.removeItem('tt_token');
      localStorage.removeItem('tt_user');
    }
  }, [token, user]);

  const login = useCallback((newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    navigate('/login', { replace: true });
  }, [navigate]);

  const hasRole = useCallback((...roles) => {
    if (!user) return false;
    return roles.includes(user.role);
  }, [user]);

  const value = {
    token,
    user,
    isAuthenticated: Boolean(token && user),
    login,
    logout,
    hasRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Custom hook — components import this instead of useContext(AuthContext) directly
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
