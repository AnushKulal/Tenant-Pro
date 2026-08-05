// File: mobile/src/theme/index.js
// -----------------------------------------------------------------------------
// TENANTPRO DESIGN SYSTEM — single source of truth for the whole app.
//
// Two themes, per the product direction:
//   • dark  → black + purple
//   • light → white + blue
//
// Everything visual (colour, spacing, radius, type, glass, motion) comes from
// here so screens never hard-code hex values. Adding a screen means consuming
// tokens, not inventing them — that's what keeps the UI universal.
//
// Usage:
//   const t = useTheme();
//   <View style={{ backgroundColor: t.colors.bg, padding: t.spacing.lg }} />
//
// Legacy screens still call useColorScheme() directly; that keeps working.
// ThemeProvider is additive, not a breaking migration.
// -----------------------------------------------------------------------------
import React, { createContext, useContext, useMemo, useState, useEffect, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// --- Helper: apply alpha to a #RRGGBB hex ------------------------------------
export const withAlpha = (hex, alpha) => {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// --- Shared scales (theme-independent) ---------------------------------------
export const spacing = {
    xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 44
};

export const radii = {
    sm: 8, md: 12, lg: 16, xl: 20, xxl: 26, pill: 999
};

export const typography = {
    display: { fontSize: 34, fontWeight: '900', letterSpacing: -0.8 },
    title: { fontSize: 27, fontWeight: '800', letterSpacing: -0.4 },
    heading: { fontSize: 21, fontWeight: '800', letterSpacing: -0.2 },
    subheading: { fontSize: 17, fontWeight: '700' },
    body: { fontSize: 15, fontWeight: '500' },
    bodyStrong: { fontSize: 15, fontWeight: '700' },
    caption: { fontSize: 13, fontWeight: '500' },
    micro: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6 }
};

// Motion constants — consistent feel across every animated surface.
export const motion = {
    fast: 180,
    normal: 300,
    slow: 520,
    entrance: 620,
    // Spring config used for anything that "arrives" (sheets, cards, buttons).
    spring: { friction: 9, tension: 62 },
    springSoft: { friction: 12, tension: 45 }
};

// --- DARK: black + purple ----------------------------------------------------
const darkColors = {
    // Surfaces
    bg: '#07070B',
    bgAlt: '#0B0B12',
    surface: '#12121C',
    surfaceAlt: '#181826',
    surfaceHigh: '#1F1F30',

    // Text
    text: '#F6F5FF',
    textMuted: '#A5A0C0',
    textFaint: '#6E6890',

    // Brand — purple
    primary: '#8B5CF6',
    primaryAlt: '#A78BFA',
    primaryDeep: '#6D28D9',
    onPrimary: '#FFFFFF',
    accent: '#C084FC',

    // Lines
    border: 'rgba(255,255,255,0.08)',
    borderStrong: 'rgba(168,139,250,0.34)',

    // Status
    success: '#34D399',
    warning: '#FBBF24',
    danger: '#FB7185',
    info: '#818CF8',

    // Glass
    glassBg: 'rgba(24, 22, 40, 0.55)',
    glassBgStrong: 'rgba(28, 25, 48, 0.78)',
    glassBorder: 'rgba(255,255,255,0.12)',
    glassHighlight: 'rgba(196,132,252,0.20)',
    scrim: 'rgba(0,0,0,0.66)',

    // Gradients
    bgGradient: ['#07070B', '#0E0A1C', '#120C24'],
    primaryGradient: ['#A78BFA', '#8B5CF6', '#6D28D9'],
    blobA: ['#7C3AED', '#4C1D95'],
    blobB: ['#C026D3', '#6D28D9'],
    sheenGradient: ['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.02)', 'rgba(255,255,255,0)']
};

// --- LIGHT: white + blue -----------------------------------------------------
const lightColors = {
    bg: '#F4F8FF',
    bgAlt: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceAlt: '#EEF4FF',
    surfaceHigh: '#E4EDFF',

    text: '#0B1224',
    textMuted: '#5A6785',
    textFaint: '#8B97B0',

    primary: '#2563EB',
    primaryAlt: '#3B82F6',
    primaryDeep: '#1D4ED8',
    onPrimary: '#FFFFFF',
    accent: '#0EA5E9',

    border: 'rgba(11,18,36,0.08)',
    borderStrong: 'rgba(37,99,235,0.30)',

    success: '#059669',
    warning: '#D97706',
    danger: '#E11D48',
    info: '#2563EB',

    glassBg: 'rgba(255,255,255,0.62)',
    glassBgStrong: 'rgba(255,255,255,0.86)',
    glassBorder: 'rgba(255,255,255,0.85)',
    glassHighlight: 'rgba(37,99,235,0.12)',
    scrim: 'rgba(11,18,36,0.42)',

    bgGradient: ['#F7FAFF', '#EAF2FF', '#DDEAFF'],
    primaryGradient: ['#3B82F6', '#2563EB', '#1D4ED8'],
    blobA: ['#60A5FA', '#2563EB'],
    blobB: ['#38BDF8', '#3B82F6'],
    sheenGradient: ['rgba(255,255,255,0.9)', 'rgba(255,255,255,0.35)', 'rgba(255,255,255,0)']
};

// Elevation presets (shadow on iOS, elevation on Android).
const makeShadows = (isDark) => ({
    none: {},
    sm: {
        shadowColor: isDark ? '#000000' : '#1E3A8A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: isDark ? 0.4 : 0.08,
        shadowRadius: 6,
        elevation: 2
    },
    md: {
        shadowColor: isDark ? '#000000' : '#1E3A8A',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: isDark ? 0.5 : 0.12,
        shadowRadius: 18,
        elevation: 6
    },
    lg: {
        shadowColor: isDark ? '#000000' : '#1E3A8A',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: isDark ? 0.6 : 0.16,
        shadowRadius: 30,
        elevation: 12
    },
    glow: {
        shadowColor: isDark ? '#8B5CF6' : '#2563EB',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.45,
        shadowRadius: 16,
        elevation: 8
    }
});

const THEME_KEY = 'themePreference'; // 'system' | 'dark' | 'light'

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
    const systemScheme = useColorScheme();
    const [preference, setPreference] = useState('system');

    // Restore the saved preference (falls back to following the OS).
    useEffect(() => {
        (async () => {
            try {
                const saved = await AsyncStorage.getItem(THEME_KEY);
                if (saved === 'dark' || saved === 'light' || saved === 'system') setPreference(saved);
            } catch (e) {
                // Non-fatal: keep following the system theme.
            }
        })();
    }, []);

    const setMode = useCallback(async (mode) => {
        setPreference(mode);
        try {
            await AsyncStorage.setItem(THEME_KEY, mode);
        } catch (e) {
            // Preference is cosmetic — ignore write failures.
        }
    }, []);

    const isDark = preference === 'system' ? systemScheme === 'dark' : preference === 'dark';

    const value = useMemo(() => {
        const colors = isDark ? darkColors : lightColors;
        return {
            isDark,
            mode: isDark ? 'dark' : 'light',
            preference,
            setMode,
            toggle: () => setMode(isDark ? 'light' : 'dark'),
            colors,
            spacing,
            radii,
            typography,
            motion,
            shadows: makeShadows(isDark),
            // Blur tint that matches the active theme (for expo-blur).
            blurTint: isDark ? 'dark' : 'light',
            blurIntensity: isDark ? 42 : 55
        };
    }, [isDark, preference, setMode]);

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// Safe to call outside a provider: falls back to the system scheme so a screen
// rendered in isolation (or a legacy tree) never crashes.
export function useTheme() {
    const ctx = useContext(ThemeContext);
    const systemScheme = useColorScheme();
    if (ctx) return ctx;
    const isDark = systemScheme === 'dark';
    const colors = isDark ? darkColors : lightColors;
    return {
        isDark,
        mode: isDark ? 'dark' : 'light',
        preference: 'system',
        setMode: () => {},
        toggle: () => {},
        colors,
        spacing,
        radii,
        typography,
        motion,
        shadows: makeShadows(isDark),
        blurTint: isDark ? 'dark' : 'light',
        blurIntensity: isDark ? 42 : 55
    };
}

export const palettes = { dark: darkColors, light: lightColors };
