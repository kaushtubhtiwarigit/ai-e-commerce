import React, { createContext, useContext, useReducer, useEffect } from 'react'
import { aiAPI } from '../services/api'
import { useAuth } from './AuthContext'
import { v4 as uuidv4 } from 'uuid'

// Initial state
const initialState = {
  isOpen: false,
  isMinimized: false,
  messages: [],
  isLoading: false,
  isTyping: false,
  error: null,
  sessionId: null,
  context: {},
  suggestions: [],
  connectionStatus: 'disconnected' // 'connected', 'connecting', 'disconnected', 'error'
}

// Action types
const ActionTypes = {
  TOGGLE_CHAT: 'TOGGLE_CHAT',
  MINIMIZE_CHAT: 'MINIMIZE_CHAT',
  MAXIMIZE_CHAT: 'MAXIMIZE_CHAT',
  SET_LOADING: 'SET_LOADING',
  SET_TYPING: 'SET_TYPING',
  ADD_MESSAGE: 'ADD_MESSAGE',
  SET_MESSAGES: 'SET_MESSAGES',
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR',
  SET_SESSION: 'SET_SESSION',
  SET_CONTEXT: 'SET_CONTEXT',
  SET_SUGGESTIONS: 'SET_SUGGESTIONS',
  SET_CONNECTION_STATUS: 'SET_CONNECTION_STATUS',
  CLEAR_CHAT: 'CLEAR_CHAT'
}

// Message types
export const MessageTypes = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
  PRODUCT_RECOMMENDATION: 'product_recommendation',
  QUICK_REPLY: 'quick_reply'
}

// Reducer
function chatReducer(state, action) {
  switch (action.type) {
    case ActionTypes.TOGGLE_CHAT:
      return {
        ...state,
        isOpen: !state.isOpen,
        isMinimized: false
      }

    case ActionTypes.MINIMIZE_CHAT:
      return {
        ...state,
        isMinimized: true
      }

    case ActionTypes.MAXIMIZE_CHAT:
      return {
        ...state,
        isMinimized: false
      }

    case ActionTypes.SET_LOADING:
      return {
        ...state,
        isLoading: action.payload
      }

    case ActionTypes.SET_TYPING:
      return {
        ...state,
        isTyping: action.payload
      }

    case ActionTypes.ADD_MESSAGE:
      return {
        ...state,
        messages: [...state.messages, action.payload],
        isLoading: false,
        isTyping: false,
        error: null
      }

    case ActionTypes.SET_MESSAGES:
      return {
        ...state,
        messages: action.payload
      }

    case ActionTypes.SET_ERROR:
      return {
        ...state,
        error: action.payload,
        isLoading: false,
        isTyping: false
      }

    case ActionTypes.CLEAR_ERROR:
      return {
        ...state,
        error: null
      }

    case ActionTypes.SET_SESSION:
      return {
        ...state,
        sessionId: action.payload
      }

    case ActionTypes.SET_CONTEXT:
      return {
        ...state,
        context: { ...state.context, ...action.payload }
      }

    case ActionTypes.SET_SUGGESTIONS:
      return {
        ...state,
        suggestions: action.payload
      }

    case ActionTypes.SET_CONNECTION_STATUS:
      return {
        ...state,
        connectionStatus: action.payload
      }

    case ActionTypes.CLEAR_CHAT:
      return {
        ...initialState,
        sessionId: null,
        isOpen: state.isOpen
      }

    default:
      return state
  }
}

// Context
const ChatContext = createContext()

// Provider component
export function ChatProvider({ children }) {
  const [state, dispatch] = useReducer(chatReducer, initialState)
  const { isAuthenticated, token, user } = useAuth()

  // Initialize chat session
  useEffect(() => {
    initializeSession()
  }, [isAuthenticated])

  // Initialize chat session
  const initializeSession = () => {
    const sessionId = `chat_${Date.now()}_${uuidv4().slice(0, 8)}`
    dispatch({ type: ActionTypes.SET_SESSION, payload: sessionId })
    dispatch({ type: ActionTypes.SET_CONNECTION_STATUS, payload: 'connected' })

    // Set initial context
    dispatch({
      type: ActionTypes.SET_CONTEXT,
      payload: {
        userId: user?._id,
        userPreferences: user?.preferences,
        timestamp: new Date().toISOString()
      }
    })

    // Add welcome message
    const welcomeMessage = {
      id: uuidv4(),
      type: MessageTypes.ASSISTANT,
      content: isAuthenticated 
        ? `Hi ${user?.name}! I'm your AI shopping assistant. How can I help you find the perfect bag today?`
        : "Hi there! I'm your AI shopping assistant. I can help you find the perfect bags, answer questions about our products, and provide personalized recommendations. How can I assist you today?",
      timestamp: new Date().toISOString(),
      suggestions: [
        "Show me trending bags",
        "I need a work bag",
        "What's new in handbags?",
        "Help me find a travel bag"
      ]
    }

    dispatch({ type: ActionTypes.ADD_MESSAGE, payload: welcomeMessage })
  }

  // Send message
  const sendMessage = async (content, messageType = MessageTypes.USER) => {
    if (!content.trim() || state.isLoading) return

    // Add user message
    const userMessage = {
      id: uuidv4(),
      type: messageType,
      content: content.trim(),
      timestamp: new Date().toISOString()
    }

    dispatch({ type: ActionTypes.ADD_MESSAGE, payload: userMessage })
    dispatch({ type: ActionTypes.SET_TYPING, payload: true })

    try {
      // Send to AI API
      const response = await aiAPI.chat({
        message: content,
        sessionId: state.sessionId
      }, token)

      if (response.success) {
        const { response: aiResponse, products, intent, sessionId: updatedSessionId } = response.data

        // Update session ID if changed
        if (updatedSessionId && updatedSessionId !== state.sessionId) {
          dispatch({ type: ActionTypes.SET_SESSION, payload: updatedSessionId })
        }

        // Add assistant message
        const assistantMessage = {
          id: uuidv4(),
          type: MessageTypes.ASSISTANT,
          content: aiResponse,
          timestamp: new Date().toISOString(),
          intent,
          products: products || [],
          metadata: {
            responseTime: response.data.responseTime
          }
        }

        dispatch({ type: ActionTypes.ADD_MESSAGE, payload: assistantMessage })

        // Update suggestions based on context
        updateSuggestions(intent, products)

        // Update context
        dispatch({
          type: ActionTypes.SET_CONTEXT,
          payload: {
            lastIntent: intent,
            lastQuery: content,
            timestamp: new Date().toISOString()
          }
        })

      } else {
        throw new Error(response.error || 'Failed to get response')
      }
    } catch (error) {
      console.error('Chat error:', error)
      
      const errorMessage = {
        id: uuidv4(),
        type: MessageTypes.SYSTEM,
        content: "I'm sorry, I'm having trouble processing your request right now. Please try again or contact our customer service for assistance.",
        timestamp: new Date().toISOString(),
        isError: true
      }

      dispatch({ type: ActionTypes.ADD_MESSAGE, payload: errorMessage })
      dispatch({
        type: ActionTypes.SET_ERROR,
        payload: error.response?.data?.error || 'Chat service temporarily unavailable'
      })
    } finally {
      dispatch({ type: ActionTypes.SET_TYPING, payload: false })
    }
  }

  // Update suggestions based on context
  const updateSuggestions = (intent, products) => {
    let newSuggestions = []

    switch (intent) {
      case 'product-search':
        newSuggestions = [
          "Tell me more about this bag",
          "Show similar products",
          "What are the dimensions?",
          "Is this available in other colors?"
        ]
        break

      case 'comparison':
        newSuggestions = [
          "Which one is better for work?",
          "Compare the materials",
          "Show price differences",
          "What about durability?"
        ]
        break

      case 'styling-advice':
        newSuggestions = [
          "What occasions is this suitable for?",
          "How should I care for this bag?",
          "What outfits go well with this?",
          "Any matching accessories?"
        ]
        break

      default:
        newSuggestions = [
          "Show me trending bags",
          "I need help choosing a bag",
          "What's your return policy?",
          "Tell me about shipping options"
        ]
    }

    dispatch({ type: ActionTypes.SET_SUGGESTIONS, payload: newSuggestions })
  }

  // Send quick reply
  const sendQuickReply = (suggestion) => {
    sendMessage(suggestion, MessageTypes.USER)
  }

  // Toggle chat window
  const toggleChat = () => {
    dispatch({ type: ActionTypes.TOGGLE_CHAT })
    
    if (!state.isOpen && state.messages.length === 0) {
      initializeSession()
    }
  }

  // Minimize chat
  const minimizeChat = () => {
    dispatch({ type: ActionTypes.MINIMIZE_CHAT })
  }

  // Maximize chat
  const maximizeChat = () => {
    dispatch({ type: ActionTypes.MAXIMIZE_CHAT })
  }

  // Clear chat
  const clearChat = () => {
    dispatch({ type: ActionTypes.CLEAR_CHAT })
    initializeSession()
  }

  // End chat session
  const endSession = async () => {
    try {
      if (state.sessionId) {
        await aiAPI.endChatSession(state.sessionId)
      }
    } catch (error) {
      console.error('Error ending chat session:', error)
    } finally {
      dispatch({ type: ActionTypes.CLEAR_CHAT })
    }
  }

  // Submit feedback
  const submitFeedback = async (rating, comment = '', categories = []) => {
    try {
      if (!state.sessionId) return

      await aiAPI.submitChatFeedback(state.sessionId, {
        rating,
        comment,
        categories
      })

      const feedbackMessage = {
        id: uuidv4(),
        type: MessageTypes.SYSTEM,
        content: "Thank you for your feedback! It helps us improve our service.",
        timestamp: new Date().toISOString()
      }

      dispatch({ type: ActionTypes.ADD_MESSAGE, payload: feedbackMessage })
    } catch (error) {
      console.error('Error submitting feedback:', error)
    }
  }

  // Add product to context (when viewing products)
  const addProductContext = (product) => {
    dispatch({
      type: ActionTypes.SET_CONTEXT,
      payload: {
        currentProduct: {
          id: product._id,
          name: product.name,
          category: product.category,
          price: product.price?.current
        },
        timestamp: new Date().toISOString()
      }
    })
  }

  // Add cart context
  const addCartContext = (cartItems) => {
    dispatch({
      type: ActionTypes.SET_CONTEXT,
      payload: {
        cartItems: cartItems.map(item => ({
          id: item.product._id,
          name: item.product.name,
          quantity: item.quantity,
          price: item.price
        })),
        cartValue: cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0),
        timestamp: new Date().toISOString()
      }
    })
  }

  const clearError = () => {
    dispatch({ type: ActionTypes.CLEAR_ERROR })
  }

  const value = {
    // State
    ...state,
    
    // Actions
    sendMessage,
    sendQuickReply,
    toggleChat,
    minimizeChat,
    maximizeChat,
    clearChat,
    endSession,
    submitFeedback,
    addProductContext,
    addCartContext,
    clearError
  }

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  )
}

// Custom hook to use chat context
export function useChat() {
  const context = useContext(ChatContext)
  
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider')
  }
  
  return context
}

export default ChatContext