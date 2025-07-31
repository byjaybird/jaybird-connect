import axios from 'axios';
import { API_URL } from '../config';

// Create an axios instance with default config
export const api = axios.create({
  baseURL: API_URL, // Use API_URL directly since routes include /api
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 10000, // 10 second timeout
  withCredentials: true // Include credentials like cookies
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
    
    // Skip token for public endpoints
    if (config.url.includes('/auth/login')) {
      console.log('Request interceptor - Skipping token for login request');
      return config;
    }
    
    const token = localStorage.getItem('token');
    console.log('Request interceptor - URL:', config.url);
    console.log('Request interceptor - Token:', token ? 'Present' : 'Missing');
    
    if (!token) {
      // Only redirect for non-auth-check requests
      if (!config.url.includes('/api/auth/check')) {
        console.log('Request interceptor - No token found, redirecting to login');
        window.location.href = '/login';
      }
      return Promise.reject('No auth token found');
    }
    
    // Add token to headers
    config.headers.Authorization = `Bearer ${token}`;
    console.log('Request interceptor - Headers set');
    return config;
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
      response: error.response,
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