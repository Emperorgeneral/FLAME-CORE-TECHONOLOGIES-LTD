import { useState, useEffect } from 'react'
import { apiClient } from '@/api/client'

interface Email {
  id: string
  recipient: string
  template: string
  subject: string
  status: 'pending' | 'sent' | 'failed'
  created_at: string
  sent_at?: string
  error?: string
}

interface EmailStats {
  total: number
  sent: number
  pending: number
  failed: number
  delivery_rate: number
}

export function AdminEmailManager() {
  const [emails, setEmails] = useState<Email[]>([])
  const [stats, setStats] = useState<EmailStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterRecipient, setFilterRecipient] = useState<string>('')
  const [showComposer, setShowComposer] = useState(false)

  // Composer state
  const [recipient, setRecipient] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [template, setTemplate] = useState('custom')
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')

  // Fetch emails
  async function fetchEmails() {
    try {
      setLoading(true)
      const response = await apiClient.adminEmails(page, filterStatus, filterRecipient)
      setEmails(response.emails)
    } catch (err) {
      console.error('Failed to fetch emails:', err)
    } finally {
      setLoading(false)
    }
  }

  // Fetch stats
  async function fetchStats() {
    try {
      const stats = await apiClient.adminEmailStats()
      setStats(stats)
    } catch (err) {
      console.error('Failed to fetch stats:', err)
    }
  }

  // Send email
  async function handleSendEmail(e: React.FormEvent) {
    e.preventDefault()
    if (!recipient || !subject || !body) {
      setMessage('❌ Fill all fields')
      return
    }

    try {
      setSending(true)
      await apiClient.adminSendEmail(recipient, subject, body, template)
      setMessage('✅ Email queued for sending')
      setRecipient('')
      setSubject('')
      setBody('')
      setTemplate('custom')
      setTimeout(() => setShowComposer(false), 1500)
      fetchEmails()
      fetchStats()
    } catch (err) {
      setMessage('❌ Failed to send email')
      console.error(err)
    } finally {
      setSending(false)
    }
  }

  // Delete email
  async function handleDeleteEmail(id: string) {
    if (!confirm('Delete this email?')) return
    try {
      await apiClient.adminDeleteEmail(id)
      setMessage('✅ Email deleted')
      fetchEmails()
    } catch (err) {
      setMessage('❌ Failed to delete email')
    }
  }

  useEffect(() => {
    fetchEmails()
    fetchStats()
  }, [page, filterStatus, filterRecipient])

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">📧 Email Management</h2>
          <p className="text-gray-600 mt-1">Send and monitor transactional emails</p>
        </div>
        <button
          onClick={() => setShowComposer(!showComposer)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          ✉️ Compose Email
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-gray-600 text-sm">Total Sent</p>
            <p className="text-2xl font-bold text-gray-900">{stats.sent}</p>
          </div>
          <div className="bg-yellow-50 p-4 rounded-lg">
            <p className="text-gray-600 text-sm">Pending</p>
            <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
          </div>
          <div className="bg-red-50 p-4 rounded-lg">
            <p className="text-gray-600 text-sm">Failed</p>
            <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
          </div>
          <div className="bg-green-50 p-4 rounded-lg">
            <p className="text-gray-600 text-sm">Delivery Rate</p>
            <p className="text-2xl font-bold text-green-600">{stats.delivery_rate}%</p>
          </div>
        </div>
      )}

      {/* Composer */}
      {showComposer && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <form onSubmit={handleSendEmail}>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <input
                type="email"
                placeholder="Recipient email"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg"
              />
              <select
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="custom">Custom Email</option>
                <option value="welcome">Welcome</option>
                <option value="verify_email">Verify Email</option>
                <option value="password_reset">Password Reset</option>
                <option value="deploy_success">Deploy Success</option>
                <option value="deploy_failed">Deploy Failed</option>
                <option value="billing_receipt">Billing Receipt</option>
              </select>
            </div>
            <input
              type="text"
              placeholder="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4"
            />
            <textarea
              placeholder="Email body (HTML or plain text)"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4 font-mono text-sm"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={sending}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {sending ? 'Sending...' : 'Send Email'}
              </button>
              <button
                type="button"
                onClick={() => setShowComposer(false)}
                className="bg-gray-300 text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
            {message && <p className="mt-2 text-sm">{message}</p>}
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <select
          value={filterStatus}
          onChange={(e) => {
            setFilterStatus(e.target.value)
            setPage(1)
          }}
          className="px-3 py-2 border border-gray-300 rounded-lg"
        >
          <option value="">All Statuses</option>
          <option value="sent">Sent</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>
        <input
          type="text"
          placeholder="Filter by recipient..."
          value={filterRecipient}
          onChange={(e) => {
            setFilterRecipient(e.target.value)
            setPage(1)
          }}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
        />
      </div>

      {/* Email List */}
      {loading ? (
        <p className="text-center text-gray-500">Loading...</p>
      ) : emails.length === 0 ? (
        <p className="text-center text-gray-500">No emails found</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">Recipient</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">Subject</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">Template</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">Status</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">Date</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {emails.map((email) => (
                <tr key={email.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">{email.recipient}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{email.subject}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{email.template}</td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        email.status === 'sent'
                          ? 'bg-green-100 text-green-800'
                          : email.status === 'pending'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {email.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {new Date(email.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {email.status === 'pending' && (
                      <button
                        onClick={() => handleDeleteEmail(email.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!loading && emails.length > 0 && (
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-3 py-1">Page {page}</span>
          <button
            onClick={() => setPage(page + 1)}
            className="px-3 py-1 border border-gray-300 rounded"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
