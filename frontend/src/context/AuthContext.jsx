import React, { createContext, useContext, useReducer, useEffect } from 'react'
import Cookies from 'js-cookie'
import { authAPI } from '../services/api'
import toast from 'react-hot-toast'

// Initial state
const initialState = {
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
  error: null
}

// Action types
const ActionTypes = {
  AUTH_START: 'AUTH_START',
  AUTH_SUCCESS: 'AUTH_SUCCESS',
  AUTH_FAILURE: 'AUTH_FAILURE',
  LOGOUT: 'LOGOUT',
  UPDATE_USER: 'UPDATE_USER',
  CLEAR_ERROR: 'CLEAR_ERROR'
}

// Reducer
function authReducer(state, action) {
  switch (action.type) {
    case ActionTypes.AUTH_START:
      return {
        ...state,
        isLoading: true,
        error: null
      }

    case ActionTypes.AUTH_SUCCESS:
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        isAuthenticated: true,
        isLoading: false,
        error: null
      }

    case ActionTypes.AUTH_FAILURE:
      return {
        ...state,
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        error: action.payload
      }

    case ActionTypes.LOGOUT:
      return {
        ...initialState,
        isLoading: false
      }

    case ActionTypes.UPDATE_USER:
      return {
        ...state,
        user: action.payload
      }

    case ActionTypes.CLEAR_ERROR:
      return {
        ...state,
        error: null
      }

    default:
      return state
  }
}

// Context
const AuthContext = createContext()

// Provider component
export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState)

  // Initialize auth state from stored token
  useEffect(() => {
    initializeAuth()
  }, [])

  const initializeAuth = async () => {
    try {
      const token = Cookies.get('auth-token')
      
      if (!token) {
        dispatch({ type: ActionTypes.AUTH_FAILURE, payload: null })
        return
      }

      // Store token in localStorage for axios interceptor
      localStorage.setItem('token', token)

      // Validate token and get user data
      const response = await authAPI.getProfile()
      
      dispatch({
        type: ActionTypes.AUTH_SUCCESS,
        payload: {
          user: response.data,
          token
        }
      })
    } catch (error) {
      console.error('Auth initialization error:', error)
      Cookies.remove('auth-token')
      localStorage.removeItem('token')
      dispatch({ type: ActionTypes.AUTH_FAILURE, payload: null })
    }
  }

  const login = async (email, password) => {
    try {
      dispatch({ type: ActionTypes.AUTH_START })

      const response = await authAPI.login({ email, password })
      const { user, token } = response.data

      // Store token in cookie and localStorage
      Cookies.set('auth-token', token, { 
        expires: 7, // 7 days
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
      })
      localStorage.setItem('token', token)

      dispatch({
        type: ActionTypes.AUTH_SUCCESS,
        payload: { user, token }
      })

      toast.success(`Welcome back, ${user.name}!`)
      return { success: true }
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Login failed'
      dispatch({ type: ActionTypes.AUTH_FAILURE, payload: errorMessage })
      toast.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  const register = async (userData) => {
    try {
      dispatch({ type: ActionTypes.AUTH_START })

      const response = await authAPI.register(userData)
      const { user, token } = response.data

      // Store token in cookie and localStorage
      Cookies.set('auth-token', token, { 
        expires: 7,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
      })
      localStorage.setItem('token', token)

      dispatch({
        type: ActionTypes.AUTH_SUCCESS,
        payload: { user, token }
      })

      toast.success(`Welcome to AI Bag Store, ${user.name}!`)
      return { success: true }
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Registration failed'
      dispatch({ type: ActionTypes.AUTH_FAILURE, payload: errorMessage })
      toast.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  const logout = async () => {
    try {
      // Call logout API if authenticated
      if (state.token) {
        await authAPI.logout()
      }
    } catch (error) {
      console.error('Logout API error:', error)
    } finally {
      // Always clear local state and cookies
      Cookies.remove('auth-token')
      localStorage.removeItem('token')
      dispatch({ type: ActionTypes.LOGOUT })
      toast.success('Logged out successfully')
    }
  }

  const updateProfile = async (updateData) => {
    try {
      if (!state.token) {
        throw new Error('Not authenticated')
      }

      const response = await authAPI.updateProfile(updateData, state.token)

      if (response.success) {
        dispatch({
          type: ActionTypes.UPDATE_USER,
          payload: response.data.user
        })
        toast.success('Profile updated successfully')
        return { success: true }
      } else {
        const errorMessage = response.error || 'Update failed'
        toast.error(errorMessage)
        return { success: false, error: errorMessage }
      }
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Update failed'
      toast.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  const changePassword = async (currentPassword, newPassword) => {
    try {
      if (!state.token) {
        throw new Error('Not authenticated')
      }

      const response = await authAPI.changePassword(
        { currentPassword, newPassword },
        state.token
      )

      if (response.success) {
        toast.success('Password changed successfully')
        return { success: true }
      } else {
        const errorMessage = response.error || 'Password change failed'
        toast.error(errorMessage)
        return { success: false, error: errorMessage }
      }
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Password change failed'
      toast.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  const refreshToken = async () => {
    try {
      if (!state.token) {
        return false
      }

      const response = await authAPI.refreshToken(state.token)

      if (response.success) {
        const newToken = response.data.token
        
        Cookies.set('auth-token', newToken, { 
          expires: 7,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict'
        })

        dispatch({
          type: ActionTypes.AUTH_SUCCESS,
          payload: {
            user: state.user,
            token: newToken
          }
        })

        return true
      } else {
        // Token refresh failed, logout user
        logout()
        return false
      }
    } catch (error) {
      console.error('Token refresh error:', error)
      logout()
      return false
    }
  }

  const clearError = () => {
    dispatch({ type: ActionTypes.CLEAR_ERROR })
  }

  // Check if user has specific role
  const hasRole = (role) => {
    return state.user?.role === role
  }

  // Check if user is admin
  const isAdmin = () => {
    return hasRole('admin')
  }

  const value = {
    // State
    ...state,
    
    // Actions
    login,
    register,
    logout,
    updateProfile,
    changePassword,
    refreshToken,
    clearError,
    
    // Utilities
    hasRole,
    isAdmin
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

// Custom hook to use auth context
export function useAuth() {
  const context = useContext(AuthContext)
  
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  
  return context
}

export default AuthContext