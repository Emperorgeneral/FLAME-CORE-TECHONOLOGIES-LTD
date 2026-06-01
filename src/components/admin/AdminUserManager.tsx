import { useState, useEffect } from 'react'
import { apiClient } from '@/api/client'

interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'owner' | 'member' | 'viewer'
  status: 'active' | 'suspended' | 'deleted'
  teamsCount: number
  createdAt: string
  lastLogin?: string
}

interface PaginationInfo {
  page: number
  limit: number
  total: number
  pages: number
}

export function AdminUserManager() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('')
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState<PaginationInfo | null>(null)
  const [toast, setToast] = useState<string>('')
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [showUpdateModal, setShowUpdateModal] = useState(false)
  const [newRole, setNewRole] = useState<string>('')

  const loadUsers = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
      })
      if (search) params.append('search', search)
      if (roleFilter) params.append('role', roleFilter)

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/admin/users?${params}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('flame_token')}`,
          },
        }
      )

      if (!response.ok) throw new Error('Failed to load users')
      const data = await response.json()
      setUsers(data.users)
      setPagination(data.pagination)
    } catch (error) {
      setToast(`ERROR: ${error instanceof Error ? error.message : 'Failed to load users'}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [page, search, roleFilter])

  const handleUpdateRole = async () => {
    if (!selectedUser || !newRole) return

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/admin/users/${selectedUser.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('flame_token')}`,
          },
          body: JSON.stringify({ role: newRole }),
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update user')
      }

      setToast(`✅ User role updated to ${newRole}`)
      setShowUpdateModal(false)
      setSelectedUser(null)
      loadUsers()
    } catch (error) {
      setToast(`ERROR: ${error instanceof Error ? error.message : 'Update failed'}`)
    }
  }

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure? This action cannot be undone.')) return

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/admin/users/${userId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('flame_token')}`,
          },
        }
      )

      if (!response.ok) throw new Error('Failed to delete user')

      setToast('✅ User deleted')
      loadUsers()
    } catch (error) {
      setToast(`ERROR: ${error instanceof Error ? error.message : 'Delete failed'}`)
    }
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-red-900 text-red-100'
      case 'owner':
        return 'bg-blue-900 text-blue-100'
      case 'member':
        return 'bg-green-900 text-green-100'
      default:
        return 'bg-gray-700 text-gray-100'
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-white">👥 User Management</h3>
        <span className="text-[#A8A29C] text-sm">
          {pagination ? `${pagination.total} users total` : 'Loading...'}
        </span>
      </div>

      {/* Search & Filter */}
      <div className="flex gap-2 flex-wrap">
        <input
          type="text"
          placeholder="Search email or name..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          className="flex-1 bg-[#1A1A1A] border border-[#333] text-white px-3 py-2 rounded text-sm"
        />
        <select
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value)
            setPage(1)
          }}
          className="bg-[#1A1A1A] border border-[#333] text-white px-3 py-2 rounded text-sm"
        >
          <option value="">All Roles</option>
          <option value="admin">Admin</option>
          <option value="owner">Owner</option>
          <option value="member">Member</option>
        </select>
      </div>

      {/* Users Table */}
      {loading ? (
        <div className="text-center text-[#A8A29C] py-8">Loading users...</div>
      ) : users.length === 0 ? (
        <div className="text-center text-[#A8A29C] py-8">No users found</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-[#D4D4D4]">
            <thead className="text-xs uppercase bg-[#111] border-b border-[#333]">
              <tr>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Teams</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-[#222] hover:bg-[#0F0F0F] transition"
                >
                  <td className="px-4 py-3 font-mono text-xs">{user.email}</td>
                  <td className="px-4 py-3">{user.name || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${getRoleBadgeColor(user.role)}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={user.status === 'active' ? 'text-green-400' : 'text-red-400'}>
                      {user.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">{user.teamsCount}</td>
                  <td className="px-4 py-3 text-xs text-[#A8A29C]">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => {
                        setSelectedUser(user)
                        setNewRole(user.role)
                        setShowUpdateModal(true)
                      }}
                      className="text-[#FF4D1F] hover:text-[#FF6B3D] text-xs font-bold mr-2"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteUser(user.id)}
                      className="text-red-500 hover:text-red-400 text-xs font-bold"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-3 py-1 bg-[#1A1A1A] border border-[#333] text-white rounded text-sm disabled:opacity-50"
          >
            ← Previous
          </button>
          <span className="px-3 py-1 text-[#A8A29C]">
            Page {page} of {pagination.pages}
          </span>
          <button
            onClick={() => setPage(Math.min(pagination.pages, page + 1))}
            disabled={page === pagination.pages}
            className="px-3 py-1 bg-[#1A1A1A] border border-[#333] text-white rounded text-sm disabled:opacity-50"
          >
            Next →
          </button>
        </div>
      )}

      {/* Update Modal */}
      {showUpdateModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur">
          <div className="bg-[#0A0A0A] border border-[#333] rounded-lg p-6 w-96">
            <h4 className="text-white font-bold mb-4">Update User Role</h4>
            <p className="text-[#A8A29C] text-sm mb-4">
              Changing role for: <strong>{selectedUser.email}</strong>
            </p>

            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="w-full bg-[#1A1A1A] border border-[#333] text-white px-3 py-2 rounded mb-4"
            >
              <option value="admin">Admin</option>
              <option value="owner">Owner</option>
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>

            <div className="flex gap-2">
              <button
                onClick={handleUpdateRole}
                className="flex-1 bg-[#FF4D1F] text-white py-2 rounded font-bold hover:bg-[#FF6B3D]"
              >
                Update
              </button>
              <button
                onClick={() => setShowUpdateModal(false)}
                className="flex-1 bg-[#1A1A1A] text-white py-2 rounded font-bold border border-[#333]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="bg-[#1A1A1A] border border-[#333] text-white px-4 py-3 rounded text-sm">
          {toast}
        </div>
      )}
    </div>
  )
}
