import React from 'react';
import clsx from 'clsx';
import { ChevronDown } from 'lucide-react';

const SelectContext = React.createContext(null);

function useSelectContext(component) {
    const ctx = React.useContext(SelectContext);
    if (!ctx) {
        throw new Error(`${component} must be used within <Select />`);
    }
    return ctx;
}

export function Select({ value, onValueChange, children }) {
    const [options, setOptions] = React.useState([]);
    const [placeholder, setPlaceholder] = React.useState('');

    const ctxValue = React.useMemo(
        () => ({ value, onValueChange, options, setOptions, placeholder, setPlaceholder }),
        [value, onValueChange, options, placeholder]
    );

    return <SelectContext.Provider value={ctxValue}>{children}</SelectContext.Provider>;
}

/**
 * @typedef {React.SelectHTMLAttributes<HTMLSelectElement>} SelectTriggerProps
 */

/** @type {React.ForwardRefExoticComponent<SelectTriggerProps & React.RefAttributes<HTMLSelectElement>>} */
export const SelectTrigger = React.forwardRef(function SelectTrigger({ className, disabled, ...rest }, ref) {
    const ctx = useSelectContext('SelectTrigger');
    const showPlaceholder = !ctx.value && ctx.placeholder;

    return (
        <div className={clsx('relative', className)}>
            <select
                ref={ref}
                disabled={disabled}
                value={ctx.value}
                onChange={(event) => ctx.onValueChange?.(event.target.value)}
                className={clsx(
                    'flex h-11 w-full appearance-none rounded-xl border bg-[var(--color-input-background)] px-4 pr-10 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60'
                )}
                {...rest}
            >
                {showPlaceholder ? (
                    <option value="" disabled>
                        {ctx.placeholder}
                    </option>
                ) : null}
                {ctx.options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>
    );
});

export function SelectValue({ placeholder }) {
    const ctx = useSelectContext('SelectValue');
    React.useEffect(() => {
        if (placeholder) {
            ctx.setPlaceholder(placeholder);
        }
    }, [placeholder, ctx]);
    return null;
}

export function SelectContent({ children }) {
    const ctx = useSelectContext('SelectContent');
    const serialized = React.useMemo(() => {
        const list = [];
        React.Children.forEach(children, (child) => {
            if (React.isValidElement(child) && child.type === SelectItem) {
                list.push({ value: child.props.value, label: child.props.children });
            }
        });
        return list;
    }, [children]);

    React.useEffect(() => {
        ctx.setOptions(serialized);
    }, [ctx, serialized]);

    return null;
}

export function SelectItem() {
    return null;
}
