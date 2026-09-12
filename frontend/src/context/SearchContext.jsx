import React, { createContext, useContext, useReducer, useCallback } from 'react'
import { searchAPI, aiAPI } from '../services/api'
import { useAuth } from './AuthContext'
import { debounce } from 'lodash'

// Initial state
const initialState = {
  query: '',
  filters: {
    category: null,
    priceRange: { min: null, max: null },
    brand: null,
    inStock: false,
    onSale: false,
    rating: null,
    sortBy: 'relevance',
    sortOrder: 'desc'
  },
  results: [],
  totalResults: 0,
  currentPage: 1,
  totalPages: 0,
  isLoading: false,
  error: null,
  suggestions: [],
  recentSearches: [],
  searchHistory: [],
  aiPowered: false,
  responseTime: 0,
  searchMethod: 'text'
}

// Action types
const ActionTypes = {
  SET_QUERY: 'SET_QUERY',
  SET_FILTERS: 'SET_FILTERS',
  SET_LOADING: 'SET_LOADING',
  SET_RESULTS: 'SET_RESULTS',
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR',
  SET_SUGGESTIONS: 'SET_SUGGESTIONS',
  ADD_TO_HISTORY: 'ADD_TO_HISTORY',
  CLEAR_RESULTS: 'CLEAR_RESULTS',
  SET_PAGE: 'SET_PAGE'
}

// Reducer
function searchReducer(state, action) {
  switch (action.type) {
    case ActionTypes.SET_QUERY:
      return {
        ...state,
        query: action.payload
      }

    case ActionTypes.SET_FILTERS:
      return {
        ...state,
        filters: { ...state.filters, ...action.payload }
      }

    case ActionTypes.SET_LOADING:
      return {
        ...state,
        isLoading: action.payload
      }

    case ActionTypes.SET_RESULTS:
      return {
        ...state,
        results: action.payload.results,
        totalResults: action.payload.total,
        totalPages: action.payload.totalPages,
        currentPage: action.payload.page,
        aiPowered: action.payload.aiPowered || false,
        responseTime: action.payload.responseTime || 0,
        searchMethod: action.payload.searchMethod || 'text',
        isLoading: false,
        error: null
      }

    case ActionTypes.SET_ERROR:
      return {
        ...state,
        error: action.payload,
        isLoading: false,
        results: []
      }

    case ActionTypes.CLEAR_ERROR:
      return {
        ...state,
        error: null
      }

    case ActionTypes.SET_SUGGESTIONS:
      return {
        ...state,
        suggestions: action.payload
      }

    case ActionTypes.ADD_TO_HISTORY:
      return {
        ...state,
        searchHistory: [
          action.payload,
          ...state.searchHistory.filter(item => 
            item.query !== action.payload.query
          ).slice(0, 9) // Keep last 10 searches
        ],
        recentSearches: [
          action.payload.query,
          ...state.recentSearches.filter(q => q !== action.payload.query).slice(0, 4)
        ]
      }

    case ActionTypes.CLEAR_RESULTS:
      return {
        ...state,
        results: [],
        totalResults: 0,
        totalPages: 0,
        currentPage: 1,
        error: null
      }

    case ActionTypes.SET_PAGE:
      return {
        ...state,
        currentPage: action.payload
      }

    default:
      return state
  }
}

// Context
const SearchContext = createContext()

// Provider component
export function SearchProvider({ children }) {
  const [state, dispatch] = useReducer(searchReducer, initialState)
  const { token } = useAuth()

  // Debounced search function
  const debouncedSearch = useCallback(
    debounce(async (query, filters, page = 1) => {
      if (!query.trim()) {
        dispatch({ type: ActionTypes.CLEAR_RESULTS })
        return
      }

      try {
        dispatch({ type: ActionTypes.SET_LOADING, payload: true })

        // Use AI-powered search
        const response = await aiAPI.searchProducts({
          q: query,
          page,
          limit: 20,
          ...filters
        }, token)

        if (response.success) {
          dispatch({
            type: ActionTypes.SET_RESULTS,
            payload: {
              results: response.data.products,
              total: response.data.total,
              totalPages: response.data.totalPages,
              page: response.data.page,
              aiPowered: response.data.aiPowered,
              responseTime: response.data.responseTime,
              searchMethod: response.data.searchMethod
            }
          })

          // Add to search history
          dispatch({
            type: ActionTypes.ADD_TO_HISTORY,
            payload: {
              query,
              timestamp: new Date(),
              resultsCount: response.data.total,
              filters: { ...filters }
            }
          })

          // Track search analytics
          if (response.data.searchAnalyticsId) {
            // Could track additional events here
          }
        } else {
          dispatch({
            type: ActionTypes.SET_ERROR,
            payload: response.error || 'Search failed'
          })
        }
      } catch (error) {
        console.error('Search error:', error)
        dispatch({
          type: ActionTypes.SET_ERROR,
          payload: error.response?.data?.error || 'Search failed'
        })
      }
    }, 300),
    [token]
  )

  // Debounced suggestions function
  const debouncedGetSuggestions = useCallback(
    debounce(async (query) => {
      if (!query.trim() || query.length < 2) {
        dispatch({ type: ActionTypes.SET_SUGGESTIONS, payload: [] })
        return
      }

      try {
        // Get search suggestions (this could be enhanced with AI)
        const suggestions = await generateSuggestions(query)
        dispatch({ type: ActionTypes.SET_SUGGESTIONS, payload: suggestions })
      } catch (error) {
        console.error('Suggestions error:', error)
        dispatch({ type: ActionTypes.SET_SUGGESTIONS, payload: [] })
      }
    }, 200),
    []
  )

  // Generate search suggestions
  const generateSuggestions = async (query) => {
    // This could be enhanced with AI-powered suggestions
    const commonSuggestions = [
      'leather handbags',
      'designer backpacks',
      'tote bags for work',
      'crossbody bags',
      'evening clutches',
      'travel bags',
      'laptop bags',
      'canvas bags',
      'vintage bags',
      'luxury bags'
    ]

    return commonSuggestions
      .filter(suggestion => 
        suggestion.toLowerCase().includes(query.toLowerCase())
      )
      .slice(0, 5)
  }

  // Set search query
  const setQuery = (query) => {
    dispatch({ type: ActionTypes.SET_QUERY, payload: query })
    debouncedGetSuggestions(query)
  }

  // Set filters
  const setFilters = (filters) => {
    dispatch({ type: ActionTypes.SET_FILTERS, payload: filters })
  }

  // Perform search
  const search = async (query = state.query, filters = state.filters, page = 1) => {
    dispatch({ type: ActionTypes.SET_QUERY, payload: query })
    dispatch({ type: ActionTypes.SET_PAGE, payload: page })
    await debouncedSearch(query, filters, page)
  }

  // Load more results (pagination)
  const loadMore = async () => {
    const nextPage = state.currentPage + 1
    if (nextPage <= state.totalPages && !state.isLoading) {
      await search(state.query, state.filters, nextPage)
    }
  }

  // Clear search
  const clearSearch = () => {
    dispatch({ type: ActionTypes.SET_QUERY, payload: '' })
    dispatch({ type: ActionTypes.CLEAR_RESULTS })
    dispatch({ type: ActionTypes.SET_SUGGESTIONS, payload: [] })
  }

  // Clear filters
  const clearFilters = () => {
    dispatch({
      type: ActionTypes.SET_FILTERS,
      payload: {
        category: null,
        priceRange: { min: null, max: null },
        brand: null,
        inStock: false,
        onSale: false,
        rating: null,
        sortBy: 'relevance',
        sortOrder: 'desc'
      }
    })
  }

  // Get trending searches
  const getTrendingSearches = async () => {
    try {
      // This could be implemented with backend analytics
      return [
        'leather handbags',
        'designer backpacks',
        'tote bags',
        'crossbody bags',
        'laptop bags'
      ]
    } catch (error) {
      console.error('Error getting trending searches:', error)
      return []
    }
  }

  // Track search interaction
  const trackInteraction = async (productId, action, position = null) => {
    try {
      if (!state.searchAnalyticsId) return

      await aiAPI.trackSearchEvent(state.searchAnalyticsId, {
        type: action, // 'click', 'cart_add', 'conversion'
        productId,
        position,
        data: {}
      })
    } catch (error) {
      console.error('Error tracking search interaction:', error)
    }
  }

  const clearError = () => {
    dispatch({ type: ActionTypes.CLEAR_ERROR })
  }

  const value = {
    // State
    ...state,
    
    // Actions
    setQuery,
    setFilters,
    search,
    loadMore,
    clearSearch,
    clearFilters,
    getTrendingSearches,
    trackInteraction,
    clearError
  }

  return (
    <SearchContext.Provider value={value}>
      {children}
    </SearchContext.Provider>
  )
}

// Custom hook to use search context
export function useSearch() {
  const context = useContext(SearchContext)
  
  if (!context) {
    throw new Error('useSearch must be used within a SearchProvider')
  }
  
  return context
}

export default SearchContext