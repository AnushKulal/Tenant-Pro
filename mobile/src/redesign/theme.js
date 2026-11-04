// File: mobile/src/redesign/theme.js
// The redesign's design-token system, ported verbatim from the Claude Design
// handoff (TenantPro App.dc.html). It is intentionally SEPARATE from the v1
// theme (src/theme) so the two never entangle and the revert flag stays clean.
//
// The design is themeable on four axes, exactly as in the prototype:
//   mode    — 'dark' | 'light'        (the two colourways)
//   accent  — 'lime' | 'amber' | 'sky' | 'magenta'
//   surface — 'ink' | 'espresso' | 'slate'
//   edges   — 'hairline' | 'defined' | 'seamless'
// Defaults (lime / ink / hairline) reproduce the primary look. `buildTheme`
// resolves those axes into a single flat token object — the RN equivalent of the
// CSS custom properties the prototype set on its root element.
//
// Naming mirrors the prototype's CSS vars so translating each screen's markup is
// mechanical: --ink → t.ink, --fg2 → t.fg2, --lime → t.lime, and so on. The
// alarm ramp (pos/crit/coral/amber + their soft fills) is fixed per mode; only
// the accent, the ink surfaces, and the hairlines move with the axes above.

// ── Base palettes (the fixed, non-axis colours per mode) ─────────────────────
const BASE = {
    dark: {
        fg: '#F4F3F7', fg2: '#A5A2B2', fg3: '#8A8797',
        pos: '#5CD98A',
        crit: '#FF3B2F', critsoft: 'rgba(255,59,47,.16)',
        coral: '#FF6B5E', csoft: 'rgba(255,107,94,.14)',
        amber: '#FFB020', asoft: 'rgba(255,176,32,.14)',
        sh: '0 10px 30px rgba(0,0,0,.5)'
    },
    light: {
        fg: '#131219', fg2: '#514E5C', fg3: '#6A6775',
        pos: '#1B8A55',
        crit: '#A8130A', critsoft: 'rgba(168,19,10,.12)',
        coral: '#C22A18', csoft: 'rgba(194,42,24,.10)',
        amber: '#8A5600', asoft: 'rgba(138,86,0,.12)',
        sh: '0 10px 30px rgba(20,18,30,.12)'
    }
};

// ── Axis definitions (from the prototype's renderVals) ───────────────────────
const ACCENTS = {
    lime: { fill: '#C8F751', on: '#08080A', deep: '#5A7A00', soft: 'rgba(200,247,81,.14)', softL: 'rgba(160,200,40,.22)' },
    amber: { fill: '#FFC24B', on: '#100A00', deep: '#8A5600', soft: 'rgba(255,194,75,.16)', softL: 'rgba(200,140,0,.18)' },
    sky: { fill: '#6FD3FF', on: '#04121A', deep: '#0B5C7A', soft: 'rgba(111,211,255,.16)', softL: 'rgba(11,92,122,.14)' },
    magenta: { fill: '#FF8ADB', on: '#1A0714', deep: '#9B1C6B', soft: 'rgba(255,138,219,.16)', softL: 'rgba(155,28,107,.13)' }
};

const SURFACES = {
    ink: { d: ['#08080A', '#101015', '#191920'], l: ['#F0EEE9', '#FFFFFF', '#FBFAF7'] },
    espresso: { d: ['#0B0907', '#15110C', '#1F1912'], l: ['#F2EDE3', '#FFFDF8', '#FAF5EB'] },
    slate: { d: ['#06080D', '#0E1219', '#161C26'], l: ['#ECEFF4', '#FFFFFF', '#F6F8FC'] }
};

const EDGES = {
    hairline: { d: ['rgba(255,255,255,.09)', 'rgba(255,255,255,.18)'], l: ['rgba(16,16,22,.10)', 'rgba(16,16,22,.22)'] },
    defined: { d: ['rgba(255,255,255,.20)', 'rgba(255,255,255,.34)'], l: ['rgba(16,16,22,.20)', 'rgba(16,16,22,.36)'] },
    seamless: { d: ['rgba(255,255,255,0)', 'rgba(255,255,255,.12)'], l: ['rgba(16,16,22,0)', 'rgba(16,16,22,.12)'] }
};

// ── Type ─────────────────────────────────────────────────────────────────────
// Font family names as registered by expo-font (see src/redesign/fonts.js).
// Space Grotesk carries the UI; Martian Mono is the mono label/eyebrow face.
export const FONT = {
    grotesk: { 400: 'SpaceGrotesk_400Regular', 500: 'SpaceGrotesk_500Medium', 600: 'SpaceGrotesk_600SemiBold', 700: 'SpaceGrotesk_700Bold' },
    mono: { 400: 'MartianMono_400Regular', 600: 'MartianMono_600SemiBold', 700: 'MartianMono_700Bold' }
};

// Convenience: pick a Space Grotesk / Martian Mono family for a weight, falling
// back to the nearest available cut.
export const grotesk = (w = 400) => FONT.grotesk[w] || FONT.grotesk[400];
export const mono = (w = 400) => FONT.mono[w] || FONT.mono[400];

export const RADII = { sm: 5, md: 11, lg: 16, xl: 18, pill: 22, round: 999 };

export const DEFAULTS = { mode: 'dark', accent: 'lime', surface: 'ink', edges: 'hairline' };

// Resolve the four axes into a flat token object mirroring the prototype's CSS
// custom properties.
export function buildTheme({ mode = 'dark', accent = 'lime', surface = 'ink', edges = 'hairline' } = {}) {
    const dark = mode !== 'light';
    const base = dark ? BASE.dark : BASE.light;

    const acc = ACCENTS[accent] || ACCENTS.lime;
    const surf = (SURFACES[surface] || SURFACES.ink)[dark ? 'd' : 'l'];
    const edge = (EDGES[edges] || EDGES.hairline)[dark ? 'd' : 'l'];

    return {
        mode,
        isDark: dark,

        // Surfaces (axis: surface)
        ink: surf[0],
        ink2: surf[1],
        ink3: surf[2],

        // Hairlines (axis: edges)
        line: edge[0],
        line2: edge[1],

        // Foreground text (fixed per mode)
        fg: base.fg,
        fg2: base.fg2,
        fg3: base.fg3,

        // Accent (axis: accent). `lime` is the fill, `accent` the readable text
        // tone (the prototype's --violet/--violet2 slot), `on` sits on the fill.
        lime: acc.fill,
        on: acc.on,
        lsoft: dark ? acc.soft : acc.softL,
        accent: dark ? acc.fill : acc.deep,
        vsoft: dark ? acc.soft : acc.softL,

        // Alarm ramp (fixed per mode)
        pos: base.pos,
        crit: base.crit,
        critsoft: base.critsoft,
        coral: base.coral,
        csoft: base.csoft,
        amber: base.amber,
        asoft: base.asoft,

        shadow: base.sh,
        radii: RADII,
        font: FONT
    };
}

// The priority ramp used by tickets + credit, expressed against a resolved theme.
export const priorityStyle = (t, priority) => ({
    Critical: { fg: t.crit, bg: t.critsoft, rank: 0 },
    High: { fg: t.coral, bg: t.csoft, rank: 1 },
    Medium: { fg: t.amber, bg: t.asoft, rank: 2 },
    Low: { fg: t.fg2, bg: t.ink3, rank: 3 }
}[priority] || { fg: t.fg2, bg: t.ink3, rank: 3 });
