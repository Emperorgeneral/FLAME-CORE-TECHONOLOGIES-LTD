import { useEffect } from 'react'

interface ToastProps {
  message: string | null
  onClose: () => void
  duration?: number
}

export function Toast({ message, onClose, duration = 2800 }: ToastProps) {
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(onClose, duration)
    return () => clearTimeout(timer)
  }, [message, onClose, duration])

  if (!message) return null

  return (
    <div className="fixed bottom-6 left-1/2 z-[100] -translate-x-1/2">
      <div className="rounded-full border border-white/[0.1] bg-[#0D0B10] px-5 py-2.5 text-[13px] text-[#E8E6E3] shadow-xl">
        {message}
      </div>
    </div>
  )
}
