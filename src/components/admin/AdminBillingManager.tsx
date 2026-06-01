import { useState, useEffect } from 'react'

interface Plan {
  id: string
  name: string
  priceUSD: number
  cpu: string
  ram: string
  storage: string
  bandwidth: string
  buildsPerMonth: number
  projectsLimit: number
  features: string[]
}

interface BillingData {
  mrr: {
    totalUSD: number
    totalUSDMinor: number
  }
  subscriptions: {
    active: number
    canceled: number
  }
}

export function AdminBillingManager() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [billing, setBilling] = useState<BillingData | null>(null)
  const [loading, setLoading] = useState(false)
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [toast, setToast] = useState<string>('')
  const [formData, setFormData] = useState({
    name: '',
    priceUSD: 0,
    cpu: '',
    ram: '',
    storage: '',
  })

  const loadData = async () => {
    setLoading(true)
    try {
      const [plansRes, billingRes] = await Promise.all([
        fetch(`${import.meta.env.VITE_API_URL}/api/admin/plans`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('flame_token')}`,
          },
        }),
        fetch(`${import.meta.env.VITE_API_URL}/api/admin/billing`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('flame_token')}`,
          },
        }),
      ])

      if (!plansRes.ok || !billingRes.ok) throw new Error('Failed to load data')

      const plansData = await plansRes.json()
      const billingData = await billingRes.json()

      setPlans(plansData.plans)
      setBilling(billingData)
    } catch (error) {
      setToast(`ERROR: ${error instanceof Error ? error.message : 'Failed to load data'}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleEditPlan = (plan: Plan) => {
    setEditingPlan(plan)
    setFormData({
      name: plan.name,
      priceUSD: plan.priceUSD,
      cpu: plan.cpu,
      ram: plan.ram,
      storage: plan.storage,
    })
    setShowEditModal(true)
  }

  const handleUpdatePlan = async () => {
    if (!editingPlan) return

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/admin/plans/${editingPlan.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('flame_token')}`,
          },
          body: JSON.stringify(formData),
        }
      )

      if (!response.ok) throw new Error('Failed to update plan')

      setToast(`✅ Plan "${formData.name}" updated successfully`)
      setShowEditModal(false)
      setEditingPlan(null)
      loadData()
    } catch (error) {
      setToast(`ERROR: ${error instanceof Error ? error.message : 'Update failed'}`)
    }
  }

  return (
    <div className="space-y-6">
      {/* Billing Overview Cards */}
      {billing && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#1A1A1A] border border-[#333] rounded-lg p-4">
            <p className="text-[#A8A29C] text-sm mb-1">Monthly Recurring Revenue</p>
            <p className="text-3xl font-bold text-[#FF4D1F]">
              ${billing.mrr.totalUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </p>
          </div>
          <div className="bg-[#1A1A1A] border border-[#333] rounded-lg p-4">
            <p className="text-[#A8A29C] text-sm mb-1">Active Subscriptions</p>
            <p className="text-3xl font-bold text-green-400">{billing.subscriptions.active}</p>
          </div>
          <div className="bg-[#1A1A1A] border border-[#333] rounded-lg p-4">
            <p className="text-[#A8A29C] text-sm mb-1">Canceled Subscriptions</p>
            <p className="text-3xl font-bold text-red-400">{billing.subscriptions.canceled}</p>
          </div>
        </div>
      )}

      {/* Plans Management */}
      <div>
        <h3 className="text-lg font-bold text-white mb-4">💰 Pricing Plans</h3>

        {loading ? (
          <div className="text-center text-[#A8A29C] py-8">Loading plans...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className="bg-[#1A1A1A] border border-[#333] rounded-lg p-4 hover:border-[#FF4D1F] transition"
              >
                <h4 className="text-white font-bold mb-2">{plan.name}</h4>

                <div className="mb-4">
                  <p className="text-2xl font-bold text-[#FF4D1F]">
                    ${plan.priceUSD}
                    <span className="text-sm text-[#A8A29C] font-normal">/mo</span>
                  </p>
                </div>

                <div className="space-y-2 text-xs text-[#D4D4D4] mb-4">
                  <p>💻 {plan.cpu}</p>
                  <p>🧠 {plan.ram}</p>
                  <p>💾 {plan.storage}</p>
                  <p>🌐 {plan.bandwidth}</p>
                  <p>🔨 {plan.buildsPerMonth} builds/mo</p>
                  <p>📦 {plan.projectsLimit} projects</p>
                </div>

                <button
                  onClick={() => handleEditPlan(plan)}
                  className="w-full bg-[#FF4D1F] text-white py-2 rounded font-bold text-sm hover:bg-[#FF6B3D] transition"
                >
                  Edit Pricing
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {showEditModal && editingPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur">
          <div className="bg-[#0A0A0A] border border-[#333] rounded-lg p-6 w-96">
            <h4 className="text-white font-bold mb-4">Edit Plan: {editingPlan.name}</h4>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-[#A8A29C] text-sm mb-1">Plan Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-[#1A1A1A] border border-[#333] text-white px-3 py-2 rounded text-sm"
                />
              </div>

              <div>
                <label className="block text-[#A8A29C] text-sm mb-1">Price (USD/month)</label>
                <input
                  type="number"
                  value={formData.priceUSD}
                  onChange={(e) => setFormData({ ...formData, priceUSD: parseFloat(e.target.value) })}
                  step="0.01"
                  className="w-full bg-[#1A1A1A] border border-[#333] text-white px-3 py-2 rounded text-sm"
                />
              </div>

              <div>
                <label className="block text-[#A8A29C] text-sm mb-1">CPU</label>
                <input
                  type="text"
                  value={formData.cpu}
                  onChange={(e) => setFormData({ ...formData, cpu: e.target.value })}
                  placeholder="e.g., 2 vCPU"
                  className="w-full bg-[#1A1A1A] border border-[#333] text-white px-3 py-2 rounded text-sm"
                />
              </div>

              <div>
                <label className="block text-[#A8A29C] text-sm mb-1">RAM</label>
                <input
                  type="text"
                  value={formData.ram}
                  onChange={(e) => setFormData({ ...formData, ram: e.target.value })}
                  placeholder="e.g., 4 GB"
                  className="w-full bg-[#1A1A1A] border border-[#333] text-white px-3 py-2 rounded text-sm"
                />
              </div>

              <div>
                <label className="block text-[#A8A29C] text-sm mb-1">Storage</label>
                <input
                  type="text"
                  value={formData.storage}
                  onChange={(e) => setFormData({ ...formData, storage: e.target.value })}
                  placeholder="e.g., 50 GB SSD"
                  className="w-full bg-[#1A1A1A] border border-[#333] text-white px-3 py-2 rounded text-sm"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleUpdatePlan}
                className="flex-1 bg-[#FF4D1F] text-white py-2 rounded font-bold hover:bg-[#FF6B3D]"
              >
                Save Changes
              </button>
              <button
                onClick={() => setShowEditModal(false)}
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
