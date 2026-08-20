import axios from 'axios'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'https://quickplan-u2wx.onrender.com',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const userId = localStorage.getItem('quickplan-user-id')
  if (userId) config.headers['x-user-id'] = userId
  return config
})
