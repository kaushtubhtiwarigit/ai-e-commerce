import { productsAPI } from './api'

export const productService = {
  async getAll(params = {}) {
    try {
      const response = await productsAPI.getAll(params)
      return response.data
    } catch (error) {
      console.error('Error fetching products:', error)
      throw error
    }
  },

  async getById(id) {
    try {
      const response = await productsAPI.getById(id)
      return response.data
    } catch (error) {
      console.error('Error fetching product:', error)
      throw error
    }
  },

  async search(params) {
    try {
      const response = await productsAPI.search(params)
      return response.data
    } catch (error) {
      console.error('Error searching products:', error)
      throw error
    }
  },

  async getFeatured() {
    try {
      const response = await productsAPI.getFeatured()
      return response.data
    } catch (error) {
      console.error('Error fetching featured products:', error)
      throw error
    }
  }
}

export default productService
