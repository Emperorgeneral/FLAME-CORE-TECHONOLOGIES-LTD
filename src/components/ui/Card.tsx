import { cn } from '@/utils/cn'
import { HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'glass' | 'subtle'
}

export function Card({ className, variant = 'default', children, ...props }: CardProps) {
  const variants = {
    default: 'bg-[#0D0B10] border border-white/[0.08]',
    glass: 'bg-[#0D0B10]/80 backdrop-blur-xl border border-white/[0.08]',
    subtle: 'bg-white/[0.02] border border-white/[0.06]',
  }

  return (
    <div
      className={cn('rounded-2xl', variants[variant], className)}
      {...props}
    >
      {children}
    </div>
  )
}
