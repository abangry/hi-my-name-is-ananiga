'use client';

import { cn } from '@/lib/utils';

interface TypingIndicatorProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function TypingIndicator({ className, size = 'sm' }: TypingIndicatorProps) {
  const dotSizes = {
    sm: 'w-1 h-1',
    md: 'w-1.5 h-1.5',
    lg: 'w-2 h-2',
  };

  const dotSize = dotSizes[size];

  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      <div
        className={cn(
          'rounded-full bg-current animate-typing-dot',
          dotSize
        )}
        style={{ animationDelay: '0ms' }}
      />
      <div
        className={cn(
          'rounded-full bg-current animate-typing-dot',
          dotSize
        )}
        style={{ animationDelay: '200ms' }}
      />
      <div
        className={cn(
          'rounded-full bg-current animate-typing-dot',
          dotSize
        )}
        style={{ animationDelay: '400ms' }}
      />
    </div>
  );
}
