import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Toast } from '@/components/ui/Toast'
import { apiClient } from '@/api/client'

interface VerifyEmailProps {
  onSuccess?: () => void
}

export function VerifyEmail({ onSuccess }: VerifyEmailProps) {
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  // Get token from URL query param (?verify=token)
  const params = new URLSearchParams(window.location.search)
  const token = params.get('verify')

  useEffect(() => {
    const verify = async () => {
      if (!token) {
        setStatus('error')
        setMessage('No verification token provided')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        await apiClient.verifyEmail(token)
        setStatus('success')
        setMessage('Email verified successfully! Redirecting to login...')
        
        // Redirect after 2 seconds
        setTimeout(() => {
          if (onSuccess) {
            onSuccess()
          }
        }, 2000)
      } catch (error: any) {
        setStatus('error')
        setMessage(error.message || 'Verification failed. Token may be expired or invalid.')
        setLoading(false)
      }
    }

    verify()
  }, [token, onSuccess])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <div className="space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold text-white">
              {status === 'loading' && 'Verifying Email...'}
              {status === 'success' && '✅ Email Verified'}
              {status === 'error' && '❌ Verification Failed'}
            </h1>
            <p className="text-slate-400">{message}</p>
          </div>

          {/* Loading spinner */}
          {status === 'loading' && (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-4 border-slate-700 border-t-purple-500 rounded-full animate-spin"></div>
            </div>
          )}

          {/* Actions */}
          {status === 'error' && (
            <div className="space-y-3">
              <Button
                onClick={() => onSuccess?.()}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white"
              >
                Back to Login
              </Button>
              <Button
                onClick={() => window.location.href = '/'}
                variant="outline"
                className="w-full"
              >
                Create New Account
              </Button>
            </div>
          )}

          {status === 'success' && (
            <Button
              onClick={() => onSuccess?.()}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white"
            >
              Go to Login
            </Button>
          )}

          {/* Help text */}
          <div className="border-t border-slate-700 pt-4 text-center text-sm text-slate-400">
            {status === 'error' && (
              <p>
                Token expired? <a href="/" className="text-purple-400 hover:text-purple-300">Sign up again</a>
              </p>
            )}
          </div>
        </div>
      </Card>

      <Toast />
    </div>
  )
}
