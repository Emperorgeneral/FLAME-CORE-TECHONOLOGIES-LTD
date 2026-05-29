import { cn } from '@/utils/cn'
import { ReactNode, useEffect } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  className?: string
}

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (open) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={cn(
          'relative z-10 w-full max-w-lg rounded-2xl border border-white/[0.1] bg-[#0D0B10] p-6 shadow-2xl',
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="mb-4 text-lg font-semibold tracking-tight text-[#E8E6E3]">
            {title}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
