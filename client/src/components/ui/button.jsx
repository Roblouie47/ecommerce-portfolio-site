import React from 'react';
import clsx from 'clsx';

const variantClasses = {
    default: 'bg-primary text-primary-foreground hover:opacity-90',
    secondary: 'bg-secondary text-secondary-foreground hover:opacity-95',
    outline: 'border border-border bg-transparent text-foreground hover:bg-accent',
    ghost: 'bg-transparent text-foreground hover:bg-muted'
};

const sizeClasses = {
    default: 'h-11 px-5',
    sm: 'h-9 px-3 text-sm',
    lg: 'h-12 px-7 text-base',
    icon: 'h-11 w-11 p-0'
};

/**
 * @typedef {React.ButtonHTMLAttributes<HTMLButtonElement> & {
 *  variant?: keyof typeof variantClasses;
 *  size?: keyof typeof sizeClasses;
 *  asChild?: boolean;
 * }} ButtonProps
 */

/** @type {React.ForwardRefExoticComponent<ButtonProps & React.RefAttributes<HTMLButtonElement>>} */
export const Button = React.forwardRef(function Button(
    { className, variant = 'default', size = 'default', asChild = false, children, ...props },
    ref
) {
    const Comp = asChild ? 'span' : 'button';
    return (
        <Comp
            ref={ref}
            className={clsx(
                'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-60',
                variantClasses[variant] || variantClasses.default,
                sizeClasses[size] || sizeClasses.default,
                className
            )}
            {...props}
        >
            {children}
        </Comp>
    );
});
