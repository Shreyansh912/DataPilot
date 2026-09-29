import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8000',
  timeout: 15000,
});

export const checkBackendHealth = async () => {
  const response = await api.get('/health');
  return response.data;
};

export const pingBackend = async () => {
  const response = await api.get('/api/v1/ping');
  return response.data;
};

export const uploadDataset = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post('/api/v1/datasets/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const listDatasets = async () => {
  const response = await api.get('/api/v1/datasets/');
  return response.data;
};

export const getDatasetProfile = async (datasetId) => {
  const response = await api.get(`/api/v1/datasets/${datasetId}/profile`);
  return response.data;
};

export const executeSQL = async (datasetId, query) => {
  const response = await api.post('/api/v1/analysis/sql', {
    dataset_id: datasetId,
    query: query,
  });
  return response.data;
};

export default api;