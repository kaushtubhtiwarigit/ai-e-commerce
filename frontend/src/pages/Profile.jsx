import { useAuth } from '../context/AuthContext'

const Profile = () => {
  const { user } = useAuth()
  
  return (
    <div className="container py-8">
      <h1 className="text-4xl font-bold mb-6">My Profile</h1>
      {user && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <p className="text-gray-600 mb-2">Name: {user.name}</p>
          <p className="text-gray-600 mb-2">Email: {user.email}</p>
          <p className="text-gray-600">Role: {user.role}</p>
        </div>
      )}
    </div>
  )
}

export default Profile