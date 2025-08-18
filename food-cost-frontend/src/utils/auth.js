import axios from 'axios';
import { API_URL } from '../config';

// Create an axios instance with default config
export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 10000,
  withCredentials: true
});

// Add token to requests
api.interceptors.request.use(
  (config) => {
    console.log('Request interceptor - Full config:', {
      url: config.url,
      method: config.method,
      headers: config.headers,
      data: config.data
    });

    // Ensure we have a string URL to check
    const url = config?.url || '';

    // Public endpoints that do NOT require an auth token
    const publicPaths = [
      '/auth/login',
      '/auth/register',
      '/auth/forgot-password',
      '/auth/reset-password',
      '/auth/check'
    ];

    if (publicPaths.some((p) => url.includes(p))) {
      console.log('Skipping token check for public endpoint:', url);
      return config;
    }

    const token = localStorage.getItem('token');
    console.log('Request interceptor - Token:', token ? 'Present' : 'Missing');

    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
      console.log('Request interceptor - Headers after token:', config.headers);
      return config;
    }

    // Don't redirect on auth check requests
    if (url.includes('/api/auth/check') || url.includes('/auth/check')) {
      console.log('Skipping redirect for auth check');
      return Promise.reject('No auth token found');
    }

    // If no token is found, redirect to login
    console.log('No token found, redirecting to login');
    window.location.href = '/login';
    return Promise.reject('No auth token found');
  },
  (error) => {
    console.error('Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// Handle responses
api.interceptors.response.use(
  (response) => {
    console.log('Response interceptor - Success:', {
      status: response.status,
      headers: response.headers,
      data: response.data
    });
    return response;
  },
  async (error) => {
    console.log('Response interceptor - Error:', {
      message: error.message,
      code: error.code,
      config: error.config,
      response: error.response
    });

    if (error.response?.status === 401) {
      console.log('Auth error detected, clearing token and redirecting to login');
      localStorage.removeItem('token');
      window.location.href = '/login';
      return Promise.reject('Authentication failed');
    }
    return Promise.reject(error);
  }
);

export const checkAuthStatus = async () => {
  const token = localStorage.getItem('token');
  if (!token) {
    console.error('No auth token found during status check');
    throw new Error('No token found');
  }

  try {
    console.log('Checking auth status with token:', token);
    const response = await api.get('/api/auth/check');
    console.log('Auth check successful:', response.data);
    return true;
  } catch (error) {
    console.error('Auth check failed with error:', error.response || error);
    if (error.response?.status === 401) {
      console.log('Received 401 from auth check, clearing token');
      localStorage.removeItem('token');
    }
    throw error;
  }
};

export const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
};