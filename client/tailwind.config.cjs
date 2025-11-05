const defaultTheme = require('tailwindcss/defaultTheme');

const withOpacityValue = (variable) => ({ opacityValue }) => {
    if (opacityValue !== undefined) {
        return `rgb(var(${variable}) / ${opacityValue})`;
    }
    return `rgb(var(${variable}))`;
};

module.exports = {
    darkMode: 'class',
    content: [
        './index.html',
        './src/**/*.{js,jsx,ts,tsx}'
    ],
    theme: {
        container: {
            center: true,
            padding: '1rem',
            screens: {
                sm: '540px',
                md: '720px',
                lg: '960px',
                xl: '1240px',
                '2xl': '1440px'
            }
        },
        extend: {
            colors: {
                bg: withOpacityValue('--color-bg-rgb'),
                surface: withOpacityValue('--color-surface-rgb'),
                'surface-alt': withOpacityValue('--color-surface-alt-rgb'),
                accent: withOpacityValue('--color-accent-rgb'),
                'accent-contrast': withOpacityValue('--color-accent-contrast-rgb'),
                text: withOpacityValue('--color-text-rgb'),
                muted: withOpacityValue('--color-text-muted-rgb'),
                border: withOpacityValue('--color-border-rgb'),
                'border-strong': withOpacityValue('--color-border-strong-rgb'),
                danger: withOpacityValue('--color-danger-rgb'),
                warning: withOpacityValue('--color-warning-rgb'),
                success: withOpacityValue('--color-success-rgb')
            },
            fontFamily: {
                sans: ['Inter', ...defaultTheme.fontFamily.sans]
            },
            boxShadow: {
                focus: '0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-accent)',
                card: '0 1px 2px rgba(0,0,0,0.06), 0 4px 12px -2px rgba(0,0,0,0.08)'
            },
            spacing: {
                '1.5': '0.375rem'
            },
            borderRadius: {
                'xs': '2px',
                'sm': '4px',
                'md': '6px',
                'lg': '10px',
                'pill': '999px'
            }
        }
    }
};
