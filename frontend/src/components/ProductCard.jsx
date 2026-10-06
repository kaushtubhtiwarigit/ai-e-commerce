'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ShoppingCart, Heart, Star } from 'lucide-react'
import { useCart } from '@/context/CartContext'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'

export default function ProductCard({ product }) {
  const { addToCart } = useCart()

  const handleAddToCart = (e) => {
    e.preventDefault()
    addToCart(product)
    toast.success('Added to cart!')
  }

  return (
    <motion.div
      whileHover={{ y: -5 }}
      transition={{ duration: 0.2 }}
      className="bg-white rounded-lg shadow-md overflow-hidden group"
    >
      <Link href={`/products/${product._id}`}>
        <div className="relative h-48 bg-gray-200">
          {product.images && product.images[0] ? (
            <Image
              src={product.images[0]}
              alt={product.name}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              No Image
            </div>
          )}
          {product.discount > 0 && (
            <div className="absolute top-2 right-2 bg-red-500 text-white px-2 py-1 rounded-full text-xs font-semibold">
              -{product.discount}%
            </div>
          )}
          <button
            onClick={(e) => {
              e.preventDefault()
              toast.success('Added to wishlist!')
            }}
            className="absolute top-2 left-2 bg-white p-2 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50"
          >
            <Heart className="w-4 h-4 text-gray-600 hover:text-red-500" />
          </button>
        </div>

        <div className="p-4">
          <div className="flex items-center mb-2">
            {product.rating && (
              <div className="flex items-center">
                <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                <span className="text-sm text-gray-600 ml-1">
                  {product.rating} ({product.reviews || 0})
                </span>
              </div>
            )}
          </div>

          <h3 className="text-lg font-semibold text-gray-900 mb-1 line-clamp-2 group-hover:text-blue-600 transition-colors">
            {product.name}
          </h3>

          <p className="text-sm text-gray-500 mb-2 capitalize">{product.category}</p>

          <div className="flex items-center justify-between">
            <div>
              {product.discount > 0 ? (
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-blue-600">
                    ${(product.price * (1 - product.discount / 100)).toFixed(2)}
                  </span>
                  <span className="text-sm text-gray-400 line-through">
                    ${product.price.toFixed(2)}
                  </span>
                </div>
              ) : (
                <span className="text-lg font-bold text-gray-900">
                  ${product.price.toFixed(2)}
                </span>
              )}
            </div>

            <button
              onClick={handleAddToCart}
              className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <ShoppingCart className="w-5 h-5" />
            </button>
          </div>

          {product.stock < 10 && product.stock > 0 && (
            <p className="text-xs text-orange-600 mt-2">
              Only {product.stock} left in stock!
            </p>
          )}
          {product.stock === 0 && (
            <p className="text-xs text-red-600 mt-2">Out of stock</p>
          )}
        </div>
      </Link>
    </motion.div>
  )
}
