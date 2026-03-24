import axios from 'axios';
import { useConfigStore } from '../store/configStore';

const client = axios.create({
  timeout: 10000,
});

// Request interceptor: Dynamic Base URL and JWT Authorization
client.interceptors.request.use((config) => {
  const state = useConfigStore.getState();
  const effectiveUrl = state.getEffectiveServerUrl();
  
  if (effectiveUrl) {
    // Ensure Base URL is dynamic for every request (env var takes precedence)
    config.baseURL = effectiveUrl.endsWith('/') ? effectiveUrl.slice(0, -1) : effectiveUrl;
  }
  
  const { jwtToken } = state;
  
  if (jwtToken && config.headers) {
    config.headers.Authorization = `Bearer ${jwtToken}`;
  }
  
  return config;
}, (error) => {
  return Promise.reject(error);
});

// Response interceptor: Handle 401 Unauthorized globally
client.interceptors.response.use((response) => {
  return response;
}, (error) => {
  if (error.response && error.response.status === 401) {
    // Don't logout for password-change requests — wrong current password is not a session issue
    const url = error.config?.url || '';
    if (!url.includes('/change-password')) {
      useConfigStore.getState().logout();
      console.warn("Unauthorized request. Token cleared.");
    }
  }
  return Promise.reject(error);
});

export default client;
