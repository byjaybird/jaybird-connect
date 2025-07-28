import axios from 'axios';
import { API_URL } from '../config';

// Create an axios instance with default config
export const api = axios.create({
  baseURL: API_URL.replace('/api', ''), // Remove /api since we include it in the routes
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    } else {
      // If no token is found, redirect to login
      window.location.href = '/login';
      return Promise.reject('No auth token found');
    }
    return config;
  },
  (error) => {
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
    console.log('Checking auth status...');
    await api.get('/api/auth/check');
    console.log('Auth check successful');
    return true;
  } catch (error) {
    console.error('Auth check failed:', error);
    localStorage.removeItem('token');
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