import axios from 'axios'
import toast from 'react-hot-toast'

// Create axios instance with default configuration
const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 10000,
})

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
      toast.error('Session expired. Please login again.')
    } else if (error.response?.status >= 500) {
      toast.error('Server error. Please try again later.')
    } else if (!error.response) {
      toast.error('Network error. Please check your connection.')
    }
    return Promise.reject(error)
  }
)

// Auth API
export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData),
  getProfile: () => api.get('/auth/profile'),
  updateProfile: (userData) => api.put('/auth/profile', userData),
  refreshToken: () => api.post('/auth/refresh'),
  logout: () => api.post('/auth/logout'),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token, password) => api.post('/auth/reset-password', { token, password }),
}

// Products API
export const productsAPI = {
  getAll: (params) => api.get('/products', { params }),
  getById: (id) => api.get(`/products/${id}`),
  search: (params) => api.get('/products/search', { params }),
  getSuggestions: (query) => api.get('/products/suggestions', { params: { query } }),
  getFeatured: () => api.get('/products/featured'),
  getCategories: () => api.get('/products/categories'),
  getBrands: () => api.get('/products/brands'),
  getFilters: () => api.get('/products/filters'),
  create: (productData) => api.post('/products', productData),
  update: (id, productData) => api.put(`/products/${id}`, productData),
  delete: (id) => api.delete(`/products/${id}`),
  uploadImage: (id, formData) => api.post(`/products/${id}/image`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
}

// Cart API
export const cartAPI = {
  get: () => api.get('/cart'),
  add: (productId, quantity = 1) => api.post('/cart/add', { productId, quantity }),
  update: (productId, quantity) => api.put('/cart/update', { productId, quantity }),
  remove: (productId) => api.delete(`/cart/remove/${productId}`),
  clear: () => api.delete('/cart/clear'),
  getRecommendations: () => api.get('/cart/recommendations'),
  applyCoupon: (code) => api.post('/cart/coupon', { code }),
  removeCoupon: () => api.delete('/cart/coupon'),
}

// Orders API
export const ordersAPI = {
  getAll: (params) => api.get('/orders', { params }),
  getById: (id) => api.get(`/orders/${id}`),
  create: (orderData) => api.post('/orders', orderData),
  update: (id, updates) => api.put(`/orders/${id}`, updates),
  cancel: (id) => api.put(`/orders/${id}/cancel`),
  getTracking: (id) => api.get(`/orders/${id}/tracking`),
  downloadInvoice: (id) => api.get(`/orders/${id}/invoice`, { responseType: 'blob' }),
}

// AI API
export const aiAPI = {
  // Chat
  startChatSession: (userId) => api.post('/ai/chat/session', { userId }),
  sendMessage: (data) => api.post('/ai/chat', data),
  getChatHistory: (userId) => api.get('/ai/chat/history', { params: { userId } }),
  loadChatSession: (sessionId) => api.get(`/ai/chat/session/${sessionId}`),
  getQuickSuggestions: (params) => api.get('/ai/chat/suggestions', { params }),
  rateMessage: (data) => api.post('/ai/chat/rate', data),

  // Search
  aiSearch: (data) => api.post('/ai/search', data),
  getTrendingSearches: () => api.get('/ai/trending-searches'),
  getSearchAnalytics: (userId) => api.get('/ai/search-analytics', { params: { userId } }),

  // Recommendations
  getRecommendations: (params) => api.get('/ai/recommendations', { params }),
  getPersonalized: (userId) => api.get(`/ai/recommendations/personalized/${userId}`),
  recordInteraction: (data) => api.post('/ai/interactions', data),
}

// Recommendations API
export const recommendationsAPI = {
  getForUser: (userId, params) => api.get(`/recommendations/user/${userId}`, { params }),
  getForProduct: (productId, params) => api.get(`/recommendations/product/${productId}`, { params }),
  getTrending: (params) => api.get('/recommendations/trending', { params }),
  getSeasonal: (params) => api.get('/recommendations/seasonal', { params }),
  getCollaborative: (userId, params) => api.get(`/recommendations/collaborative/${userId}`, { params }),
  getContentBased: (userId, params) => api.get(`/recommendations/content/${userId}`, { params }),
  recordView: (data) => api.post('/recommendations/view', data),
  recordPurchase: (data) => api.post('/recommendations/purchase', data),
}

// Admin API
export const adminAPI = {
  getDashboard: () => api.get('/admin/dashboard'),
  getUsers: (params) => api.get('/admin/users', { params }),
  getUserById: (id) => api.get(`/admin/users/${id}`),
  updateUser: (id, userData) => api.put(`/admin/users/${id}`, userData),
  deleteUser: (id) => api.delete(`/admin/users/${id}`),
  getOrders: (params) => api.get('/admin/orders', { params }),
  updateOrder: (id, orderData) => api.put(`/admin/orders/${id}`, orderData),
  getAnalytics: (params) => api.get('/admin/analytics', { params }),
  exportData: (type, params) => api.get(`/admin/export/${type}`, { params, responseType: 'blob' }),
}

// Utility functions
export const uploadFile = async (file, onProgress) => {
  const formData = new FormData()
  formData.append('file', file)
  
  return api.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (progressEvent) => {
      if (onProgress) {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total)
        onProgress(percentCompleted)
      }
    }
  })
}

export default api