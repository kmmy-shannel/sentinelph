/** @type {import('tailwindcss').Config} */
// SentinelPH Citizen App — NativeWind theme
// Colors mirrored 1:1 from the Figma Make web prototype's index.css + App.tsx
// inline styles (Tailwind v4 --theme CSS vars don't carry over to RN, so we
// hardcode the resolved hex/rgba values here instead).
module.exports = {
  content: [
    './App.js',
    './App.tsx',
    './screens/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './navigation/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Base surfaces
        screen: '#0a1120', // main phone/screen background (StatusBar, ReportModal, PhoneFrame)
        background: '#0f172a', // --background token
        card: '#1e293b', // --card token
        cardBorder: 'rgba(148,163,184,0.12)',

        // Brand / primary
        primary: '#4f46e5',
        primaryLight: '#6366f1',
        indigo: '#818cf8',

        // Status / threat colors
        emerald: '#10b981',
        amber: '#f59e0b',
        rose: '#f43f5e',

        // Text scale (slate ramp used throughout App.tsx)
        ink: '#e2e8f0',
        muted: '#94a3b8',
        subtle: '#64748b',
        faint: '#475569',
        ghost: '#334155',
      },
      fontFamily: {
        sans: ['Inter_400Regular', 'System'],
        mono: ['JetBrainsMono_400Regular', 'monospace'],
      },
      borderRadius: {
        xl: 12,
        '2xl': 16,
      },
    },
  },
  plugins: [],
};
