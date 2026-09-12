import { useParams } from 'react-router-dom'

const ProductDetail = () => {
  const { id } = useParams()
  
  return (
    <div className="container py-8">
      <h1 className="text-4xl font-bold mb-6">Product Detail</h1>
      <p className="text-gray-600">Product ID: {id}</p>
    </div>
  )
}

export default ProductDetail