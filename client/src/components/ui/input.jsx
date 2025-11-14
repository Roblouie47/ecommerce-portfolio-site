import React from 'react';
import clsx from 'clsx';

export const Input = React.forwardRef(function Input({ className, type = 'text', ...props }, ref) {
    return (
        <input
            ref={ref}
            type={type}
            className={clsx(
                'flex h-11 w-full rounded-xl border bg-[var(--color-input-background)] px-4 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60',
                className
            )}
            {...props}
        />
    );
});
