'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { useCart } from '@/context/CartContext'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { Trash2, Plus, Minus, ShoppingCart, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'

export default function CartPage() {
  const router = useRouter()
  const { items, removeItem, updateItem, subtotal, itemCount } = useCart()

  const getCartTotal = () => {
    return items.reduce((total, item) => {
      const price = item.price || 0
      const quantity = item.quantity || 0
      return total + (price * quantity)
    }, 0)
  }

  const handleCheckout = () => {
    if (items.length === 0) {
      toast.error('Your cart is empty')
      return
    }
    router.push('/checkout')
  }

  const handleUpdateQuantity = (itemId, newQuantity) => {
    if (newQuantity < 1) {
      return
    }
    updateItem(itemId, newQuantity)
  }

  const handleRemoveItem = (itemId) => {
    removeItem(itemId)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold mb-8">Shopping Cart</h1>

        {items.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <ShoppingCart className="w-24 h-24 text-gray-300 mx-auto mb-4" />
            <h2 className="text-2xl font-semibold mb-2">Your cart is empty</h2>
            <p className="text-gray-600 mb-6">
              Looks like you haven't added anything to your cart yet
            </p>
            <Link
              href="/products"
              className="inline-block bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Start Shopping
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Cart Items */}
            <div className="lg:col-span-2 space-y-4">
              {items.map((item) => {
                const itemPrice = item.price || 0
                const itemQuantity = item.quantity || 1
                const itemImage = item.images?.[0] || item.image || '/placeholder-bag.png'
                const itemName = item.name || 'Product'
                const itemCategory = item.category || 'Category'
                const itemId = item._id || item.id

                return (
                  <div
                    key={itemId}
                    className="bg-white rounded-lg shadow-md p-6 flex items-center gap-6"
                  >
                    <div className="relative w-24 h-24 flex-shrink-0">
                      <Image
                        src={itemImage}
                        alt={itemName}
                        fill
                        className="object-cover rounded-lg"
                      />
                    </div>

                    <div className="flex-grow">
                      <Link
                        href={`/products/${itemId}`}
                        className="text-lg font-semibold hover:text-blue-600"
                      >
                        {itemName}
                      </Link>
                      <p className="text-gray-600 text-sm mt-1">{itemCategory}</p>
                      <p className="text-blue-600 font-bold mt-2">
                        ${itemPrice.toFixed(2)}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleUpdateQuantity(itemId, itemQuantity - 1)}
                        className="w-8 h-8 flex items-center justify-center rounded-full border hover:bg-gray-100"
                        disabled={itemQuantity <= 1}
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-12 text-center font-semibold">
                        {itemQuantity}
                      </span>
                      <button
                        onClick={() => handleUpdateQuantity(itemId, itemQuantity + 1)}
                        className="w-8 h-8 flex items-center justify-center rounded-full border hover:bg-gray-100"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="text-right">
                      <p className="text-lg font-bold">
                        ${(itemPrice * itemQuantity).toFixed(2)}
                      </p>
                      <button
                        onClick={() => handleRemoveItem(itemId)}
                        className="text-red-600 hover:text-red-700 mt-2 flex items-center gap-1"
                      >
                        <Trash2 className="w-4 h-4" />
                        Remove
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Order Summary */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow-md p-6 sticky top-4">
                <h2 className="text-2xl font-bold mb-6">Order Summary</h2>

                <div className="space-y-4 mb-6">
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal ({itemCount} items)</span>
                    <span>${getCartTotal().toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Shipping</span>
                    <span>FREE</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Tax</span>
                    <span>${(getCartTotal() * 0.1).toFixed(2)}</span>
                  </div>
                  <div className="border-t pt-4">
                    <div className="flex justify-between text-xl font-bold">
                      <span>Total</span>
                      <span>${(getCartTotal() * 1.1).toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleCheckout}
                  className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                >
                  Proceed to Checkout
                  <ArrowRight className="w-5 h-5" />
                </button>

                <Link
                  href="/products"
                  className="block text-center text-blue-600 hover:text-blue-700 mt-4"
                >
                  Continue Shopping
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      <Footer />
    </div>
  )
}
