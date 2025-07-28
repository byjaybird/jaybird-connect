import axios from 'axios';
import { API_URL } from '../config';

// Create an axios instance with default config
export const api = axios.create({
  baseURL: `${API_URL}/api`, // Add /api here since we removed it from API_URL
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add token to requests
api.interceptors.request.use(
  (config) => {
    console.log('Request interceptor - URL:', config.url);
    
    // Skip token check for login and other public endpoints
    if (config.url.includes('/auth/login')) {
      console.log('Skipping token check for login request');
      return config;
    }
    
    const token = localStorage.getItem('token');
    console.log('Request interceptor - Token:', token ? 'Present' : 'Missing');
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      console.log('Request interceptor - Headers set');
      return config;
    }
    
    // Don't redirect on auth check requests
    if (config.url.includes('/auth/check')) {
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

// Handle 401 responses
api.interceptors.response.use(
  (response) => response,
  async (error) => {
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
    const response = await api.get('/auth/check');
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