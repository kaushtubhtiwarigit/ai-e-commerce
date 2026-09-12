import React, { createContext, useContext, useReducer, useEffect } from 'react'
import { cartAPI } from '../services/api'
import { useAuth } from './AuthContext'
import toast from 'react-hot-toast'

// Initial state
const initialState = {
  items: [],
  subtotal: 0,
  total: 0,
  itemCount: 0,
  isLoading: false,
  error: null,
  appliedCoupons: [],
  estimatedShipping: { cost: 0 },
  estimatedTax: { amount: 0 },
  recommendations: []
}

// Action types
const ActionTypes = {
  SET_LOADING: 'SET_LOADING',
  SET_CART: 'SET_CART',
  ADD_ITEM: 'ADD_ITEM',
  UPDATE_ITEM: 'UPDATE_ITEM',
  REMOVE_ITEM: 'REMOVE_ITEM',
  CLEAR_CART: 'CLEAR_CART',
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR',
  SET_RECOMMENDATIONS: 'SET_RECOMMENDATIONS',
  APPLY_COUPON: 'APPLY_COUPON',
  REMOVE_COUPON: 'REMOVE_COUPON'
}

// Reducer
function cartReducer(state, action) {
  switch (action.type) {
    case ActionTypes.SET_LOADING:
      return {
        ...state,
        isLoading: action.payload
      }

    case ActionTypes.SET_CART:
      return {
        ...state,
        ...action.payload,
        isLoading: false,
        error: null
      }

    case ActionTypes.ADD_ITEM:
      return {
        ...state,
        items: action.payload.items,
        subtotal: action.payload.subtotal,
        total: action.payload.total,
        itemCount: action.payload.itemCount,
        isLoading: false,
        error: null
      }

    case ActionTypes.UPDATE_ITEM:
      return {
        ...state,
        items: action.payload.items,
        subtotal: action.payload.subtotal,
        total: action.payload.total,
        itemCount: action.payload.itemCount,
        isLoading: false,
        error: null
      }

    case ActionTypes.REMOVE_ITEM:
      return {
        ...state,
        items: action.payload.items,
        subtotal: action.payload.subtotal,
        total: action.payload.total,
        itemCount: action.payload.itemCount,
        isLoading: false,
        error: null
      }

    case ActionTypes.CLEAR_CART:
      return {
        ...initialState
      }

    case ActionTypes.SET_ERROR:
      return {
        ...state,
        error: action.payload,
        isLoading: false
      }

    case ActionTypes.CLEAR_ERROR:
      return {
        ...state,
        error: null
      }

    case ActionTypes.SET_RECOMMENDATIONS:
      return {
        ...state,
        recommendations: action.payload
      }

    case ActionTypes.APPLY_COUPON:
      return {
        ...state,
        appliedCoupons: action.payload.coupons,
        total: action.payload.total
      }

    case ActionTypes.REMOVE_COUPON:
      return {
        ...state,
        appliedCoupons: action.payload.coupons,
        total: action.payload.total
      }

    default:
      return state
  }
}

// Context
const CartContext = createContext()

// Provider component
export function CartProvider({ children }) {
  const [state, dispatch] = useReducer(cartReducer, initialState)
  const { isAuthenticated, token } = useAuth()

  // Load cart when user authenticates or on component mount
  useEffect(() => {
    if (isAuthenticated && token) {
      loadCart()
    } else {
      // Load local cart for guests
      loadLocalCart()
    }
  }, [isAuthenticated, token])

  // Helper function to calculate cart totals
  const calculateCartTotals = (items) => {
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0)
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0)
    
    return {
      items,
      subtotal: Math.round(subtotal * 100) / 100,
      itemCount,
      total: Math.round(subtotal * 100) / 100 // Will be updated with shipping/tax
    }
  }

  // Load cart from API (authenticated users)
  const loadCart = async () => {
    try {
      dispatch({ type: ActionTypes.SET_LOADING, payload: true })

      const response = await cartAPI.getCart(token)

      if (response.success) {
        const cartData = response.data.cart
        dispatch({
          type: ActionTypes.SET_CART,
          payload: {
            items: cartData.items || [],
            subtotal: cartData.subtotal || 0,
            total: cartData.estimatedTotal || cartData.subtotal || 0,
            itemCount: cartData.itemCount || 0,
            appliedCoupons: cartData.appliedCoupons || [],
            estimatedShipping: cartData.estimatedShipping || { cost: 0 },
            estimatedTax: cartData.estimatedTax || { amount: 0 }
          }
        })

        // Load recommendations
        if (response.data.recommendations) {
          dispatch({
            type: ActionTypes.SET_RECOMMENDATIONS,
            payload: response.data.recommendations
          })
        }
      }
    } catch (error) {
      console.error('Error loading cart:', error)
      dispatch({
        type: ActionTypes.SET_ERROR,
        payload: 'Failed to load cart'
      })
    }
  }

  // Load cart from localStorage (guest users)
  const loadLocalCart = () => {
    try {
      const localCart = localStorage.getItem('guest-cart')
      if (localCart) {
        const cartData = JSON.parse(localCart)
        const totals = calculateCartTotals(cartData.items || [])
        
        dispatch({
          type: ActionTypes.SET_CART,
          payload: totals
        })
      } else {
        dispatch({ type: ActionTypes.SET_LOADING, payload: false })
      }
    } catch (error) {
      console.error('Error loading local cart:', error)
      dispatch({ type: ActionTypes.SET_LOADING, payload: false })
    }
  }

  // Save cart to localStorage (guest users)
  const saveLocalCart = (cartData) => {
    try {
      localStorage.setItem('guest-cart', JSON.stringify(cartData))
    } catch (error) {
      console.error('Error saving local cart:', error)
    }
  }

  // Add item to cart
  const addItem = async (product, quantity = 1) => {
    try {
      dispatch({ type: ActionTypes.SET_LOADING, payload: true })

      if (isAuthenticated && token) {
        // Add to server cart
        const response = await cartAPI.addToCart(
          { productId: product._id, quantity },
          token
        )

        if (response.success) {
          const cartData = response.data.cart
          dispatch({
            type: ActionTypes.ADD_ITEM,
            payload: {
              items: cartData.items,
              subtotal: cartData.subtotal,
              total: cartData.estimatedTotal,
              itemCount: cartData.itemCount
            }
          })
          toast.success(`Added ${product.name} to cart`)
        } else {
          throw new Error(response.error)
        }
      } else {
        // Add to local cart
        const existingItemIndex = state.items.findIndex(
          item => item.product._id === product._id
        )

        let updatedItems
        if (existingItemIndex >= 0) {
          updatedItems = [...state.items]
          updatedItems[existingItemIndex].quantity += quantity
        } else {
          updatedItems = [
            ...state.items,
            {
              product,
              quantity,
              price: product.price.current,
              addedAt: new Date()
            }
          ]
        }

        const totals = calculateCartTotals(updatedItems)
        dispatch({ type: ActionTypes.ADD_ITEM, payload: totals })
        saveLocalCart(totals)
        toast.success(`Added ${product.name} to cart`)
      }
    } catch (error) {
      console.error('Error adding item to cart:', error)
      const errorMessage = error.message || 'Failed to add item to cart'
      dispatch({ type: ActionTypes.SET_ERROR, payload: errorMessage })
      toast.error(errorMessage)
    }
  }

  // Update item quantity
  const updateItem = async (productId, quantity) => {
    try {
      dispatch({ type: ActionTypes.SET_LOADING, payload: true })

      if (isAuthenticated && token) {
        // Update server cart
        const response = await cartAPI.updateCartItem(productId, { quantity }, token)

        if (response.success) {
          const cartData = response.data.cart
          dispatch({
            type: ActionTypes.UPDATE_ITEM,
            payload: {
              items: cartData.items,
              subtotal: cartData.subtotal,
              total: cartData.estimatedTotal,
              itemCount: cartData.itemCount
            }
          })
        } else {
          throw new Error(response.error)
        }
      } else {
        // Update local cart
        let updatedItems
        if (quantity <= 0) {
          updatedItems = state.items.filter(
            item => item.product._id !== productId
          )
        } else {
          updatedItems = state.items.map(item =>
            item.product._id === productId
              ? { ...item, quantity }
              : item
          )
        }

        const totals = calculateCartTotals(updatedItems)
        dispatch({ type: ActionTypes.UPDATE_ITEM, payload: totals })
        saveLocalCart(totals)
      }
    } catch (error) {
      console.error('Error updating cart item:', error)
      const errorMessage = error.message || 'Failed to update item'
      dispatch({ type: ActionTypes.SET_ERROR, payload: errorMessage })
      toast.error(errorMessage)
    }
  }

  // Remove item from cart
  const removeItem = async (productId) => {
    try {
      dispatch({ type: ActionTypes.SET_LOADING, payload: true })

      if (isAuthenticated && token) {
        // Remove from server cart
        const response = await cartAPI.removeFromCart(productId, token)

        if (response.success) {
          const cartData = response.data.cart
          dispatch({
            type: ActionTypes.REMOVE_ITEM,
            payload: {
              items: cartData.items,
              subtotal: cartData.subtotal,
              total: cartData.estimatedTotal,
              itemCount: cartData.itemCount
            }
          })
          toast.success('Item removed from cart')
        } else {
          throw new Error(response.error)
        }
      } else {
        // Remove from local cart
        const updatedItems = state.items.filter(
          item => item.product._id !== productId
        )

        const totals = calculateCartTotals(updatedItems)
        dispatch({ type: ActionTypes.REMOVE_ITEM, payload: totals })
        saveLocalCart(totals)
        toast.success('Item removed from cart')
      }
    } catch (error) {
      console.error('Error removing cart item:', error)
      const errorMessage = error.message || 'Failed to remove item'
      dispatch({ type: ActionTypes.SET_ERROR, payload: errorMessage })
      toast.error(errorMessage)
    }
  }

  // Clear cart
  const clearCart = async () => {
    try {
      if (isAuthenticated && token) {
        // Clear server cart
        await cartAPI.clearCart(token)
      } else {
        // Clear local cart
        localStorage.removeItem('guest-cart')
      }

      dispatch({ type: ActionTypes.CLEAR_CART })
      toast.success('Cart cleared')
    } catch (error) {
      console.error('Error clearing cart:', error)
      toast.error('Failed to clear cart')
    }
  }

  // Apply coupon
  const applyCoupon = async (couponCode) => {
    try {
      if (!isAuthenticated || !token) {
        toast.error('Please sign in to apply coupons')
        return { success: false }
      }

      dispatch({ type: ActionTypes.SET_LOADING, payload: true })

      const response = await cartAPI.applyCoupon({ couponCode }, token)

      if (response.success) {
        const cartData = response.data.cart
        dispatch({
          type: ActionTypes.APPLY_COUPON,
          payload: {
            coupons: cartData.appliedCoupons,
            total: cartData.estimatedTotal
          }
        })
        toast.success('Coupon applied successfully')
        return { success: true }
      } else {
        dispatch({ type: ActionTypes.SET_LOADING, payload: false })
        toast.error(response.error)
        return { success: false, error: response.error }
      }
    } catch (error) {
      console.error('Error applying coupon:', error)
      const errorMessage = error.response?.data?.error || 'Failed to apply coupon'
      dispatch({ type: ActionTypes.SET_ERROR, payload: errorMessage })
      toast.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  // Get cart recommendations
  const getRecommendations = async () => {
    try {
      if (!isAuthenticated || !token || state.items.length === 0) {
        return
      }

      const response = await cartAPI.getRecommendations(token)

      if (response.success) {
        dispatch({
          type: ActionTypes.SET_RECOMMENDATIONS,
          payload: response.data.recommendations
        })
      }
    } catch (error) {
      console.error('Error getting cart recommendations:', error)
    }
  }

  // Get item in cart
  const getItem = (productId) => {
    return state.items.find(item => item.product._id === productId)
  }

  // Check if item is in cart
  const isInCart = (productId) => {
    return state.items.some(item => item.product._id === productId)
  }

  // Get total quantity of a specific item
  const getItemQuantity = (productId) => {
    const item = getItem(productId)
    return item ? item.quantity : 0
  }

  const clearError = () => {
    dispatch({ type: ActionTypes.CLEAR_ERROR })
  }

  const value = {
    // State
    ...state,
    
    // Actions
    loadCart,
    addItem,
    updateItem,
    removeItem,
    clearCart,
    applyCoupon,
    getRecommendations,
    clearError,
    
    // Utilities
    getItem,
    isInCart,
    getItemQuantity
  }

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  )
}

// Custom hook to use cart context
export function useCart() {
  const context = useContext(CartContext)
  
  if (!context) {
    throw new Error('useCart must be used within a CartProvider')
  }
  
  return context
}

export default CartContext