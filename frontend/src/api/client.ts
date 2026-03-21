import axios from 'axios';
import { useConfigStore } from '../store/configStore';

const client = axios.create({
  timeout: 10000,
});

// Request interceptor: Dynamic Base URL and JWT Authorization
client.interceptors.request.use((config) => {
  const { serverUrl, jwtToken } = useConfigStore.getState();
  
  if (serverUrl) {
    // Ensure Base URL is dynamic for every request
    config.baseURL = serverUrl.endsWith('/') ? serverUrl.slice(0, -1) : serverUrl;
  }
  
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
    // Clear token
    useConfigStore.getState().logout();
    console.warn("Unauthorized request. Token cleared.");
  }
  return Promise.reject(error);
});

export default client;
