// File: mobile/src/redesign/ThemeContext.js
// Provides the resolved redesign theme + the four themeable axes to the tree.
// useT() returns the flat token object (see theme.js); useThemeCtl() exposes the
// setters (mode toggle, accent/surface/edges) for Settings.
import React, { createContext, useContext, useMemo, useState, useCallback } from 'react';
import { buildTheme, DEFAULTS } from './theme';

const Ctx = createContext(null);

export function RedesignThemeProvider({ children, initial }) {
    const [mode, setMode] = useState(initial?.mode || DEFAULTS.mode);
    const [accent, setAccent] = useState(initial?.accent || DEFAULTS.accent);
    const [surface, setSurface] = useState(initial?.surface || DEFAULTS.surface);
    const [edges, setEdges] = useState(initial?.edges || DEFAULTS.edges);

    const theme = useMemo(() => buildTheme({ mode, accent, surface, edges }), [mode, accent, surface, edges]);
    const toggleMode = useCallback(() => setMode((m) => (m === 'dark' ? 'light' : 'dark')), []);

    const value = useMemo(
        () => ({ theme, mode, accent, surface, edges, setMode, setAccent, setSurface, setEdges, toggleMode }),
        [theme, mode, accent, surface, edges, toggleMode]
    );
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// Resolved tokens. Falls back to the default theme if used outside a provider so
// a screen can render standalone in a harness.
export function useT() {
    const c = useContext(Ctx);
    return c ? c.theme : buildTheme();
}

export function useThemeCtl() {
    return useContext(Ctx);
}
