import { useCart } from '../context/CartContext'

const Cart = () => {
  const { items, getCartTotal } = useCart()
  
  return (
    <div className="container py-8">
      <h1 className="text-4xl font-bold mb-6">Shopping Cart</h1>
      {items.length === 0 ? (
        <p className="text-gray-600">Your cart is empty</p>
      ) : (
        <div>
          <p className="text-gray-600">{items.length} items</p>
          <p className="text-2xl font-bold mt-4">Total: ${getCartTotal().toFixed(2)}</p>
        </div>
      )}
    </div>
  )
}

export default Cart