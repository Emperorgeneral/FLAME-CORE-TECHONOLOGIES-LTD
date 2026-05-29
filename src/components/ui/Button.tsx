import { cn } from '@/utils/cn'
import { ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', children, ...props }, ref) => {
    const base = 'inline-flex items-center justify-center font-[550] tracking-tight transition-all active:scale-[0.985] disabled:opacity-60 disabled:pointer-events-none rounded-lg'

    const variants = {
      primary: 'bg-[#8B7FFF] hover:bg-[#7A6EE6] text-[#050407] shadow-sm',
      secondary: 'bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1] text-[#E8E6E3]',
      ghost: 'hover:bg-white/[0.06] text-[#A8A29C] hover:text-[#E8E6E3]',
      danger: 'bg-red-600/90 hover:bg-red-600 text-white',
    }

    const sizes = {
      sm: 'h-8 px-3 text-[12px]',
      md: 'h-9 px-4 text-[13px]',
      lg: 'h-11 px-6 text-[14px]',
    }

    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      >
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
