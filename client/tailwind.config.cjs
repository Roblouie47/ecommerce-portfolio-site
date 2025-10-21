const defaultTheme = require('tailwindcss/defaultTheme');

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
                bg: 'var(--color-bg)',
                surface: 'var(--color-surface)',
                accent: 'var(--color-accent)',
                'accent-contrast': 'var(--color-accent-contrast)',
                text: 'var(--color-text)',
                muted: 'var(--color-text-muted)',
                border: 'var(--color-border)',
                danger: 'var(--color-danger)',
                warning: 'var(--color-warning)',
                success: 'var(--color-success)'
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
