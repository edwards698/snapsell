import * as React from 'react';
import { cn } from '../lib/utils';
import { inputClass } from './input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, rows = 4, ...props }, ref) => (
  <textarea
    ref={ref}
    rows={rows}
    className={cn(
      inputClass,
      'h-auto min-h-24 resize-y py-2.5 leading-relaxed sm:h-auto',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';
