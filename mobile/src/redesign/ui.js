// File: mobile/src/redesign/ui.js
// The redesign's shared primitives — the ONLY building blocks screens should use,
// so the whole app stays consistent. Everything reads tokens from useT(), so a
// screen never hard-codes a colour or a font family. This is the RN translation
// of the prototype's repeated inline-style patterns.
//
// Quick map from the prototype's CSS to these:
//   font:600 14px/1.2 'Space Grotesk'   → <T w={600} s={14} lh={1.2}>…</T>
//   font:600 9px 'Martian Mono' + LS    → <T mono w={600} s={9} ls={0.12}>…</T>
//   a card (ink2 + hairline + radius)    → <Card>…</Card>
//   a pressable row (class="rw")         → <Press>…</Press>  (active dims to .6)
//   an ionicon via -webkit-mask          → <Glyph name="search" size={15} color={t.fg}/>
//   an avatar <img> round                 → <Face uri={…} size={34}/>
import React from 'react';
import { View, Text, Pressable, Image, StyleSheet, TextInput, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useT } from './ThemeContext';
import { grotesk, mono as monoFamily } from './theme';
import { qrMatrix } from './qr';

// ── Text ─────────────────────────────────────────────────────────────────────
// w: weight (400/500/600/700). s: size px. lh: line-height MULTIPLIER (like CSS
// 1.2), converted to px. ls: letter-spacing in em (like CSS .12em) → px. c:
// colour (defaults to fg). mono: use Martian Mono. up: uppercase.
export function T({ children, w = 400, s = 14, lh, ls, c, mono = false, up = false, style, numberOfLines, ...rest }) {
    const t = useT();
    const family = mono ? monoFamily(w >= 700 ? 700 : w >= 600 ? 600 : 400) : grotesk(w);
    const st = {
        fontFamily: family,
        fontSize: s,
        color: c || t.fg,
        includeFontPadding: false
    };
    if (lh) st.lineHeight = Math.round(s * lh);
    if (ls != null) st.letterSpacing = ls * s; // em → px
    if (up) st.textTransform = 'uppercase';
    return (
        <Text style={[st, style]} numberOfLines={numberOfLines} allowFontScaling={false} {...rest}>
            {children}
        </Text>
    );
}

// A Martian-Mono eyebrow/label. Defaults to the small, tracked, muted voice used
// all over the prototype (e.g. "COLLECTED — AUGUST").
export function Eyebrow({ children, s = 9, w = 600, c, ls = 0.12, style, ...rest }) {
    const t = useT();
    return (
        <T mono w={w} s={s} ls={ls} c={c || t.fg3} style={style} {...rest}>
            {children}
        </T>
    );
}

// ── Surfaces ──────────────────────────────────────────────────────────────────
// The default card: ink2 fill, hairline border, rounded. `rail` draws the accent
// (or any colour) left-edge bar seen on the money card and ticket rows.
export function Card({ children, radius = 24, pad = 16, rail, style, ...rest }) {
    const t = useT();
    return (
        <View
            style={[
                { backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, borderRadius: radius, padding: pad, overflow: 'hidden' },
                style
            ]}
            {...rest}
        >
            {rail ? <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: rail === true ? 4 : 3, backgroundColor: rail === true ? t.lime : rail }} /> : null}
            {children}
        </View>
    );
}

// NOTE on spacing: only emit columnGap/rowGap when a gap was actually asked for.
// Emitting `columnGap: 0` unconditionally silently defeated the equally valid
// `<Row style={{ gap: N }}>` form — the explicit longhand beat the shorthand, so
// those rows collapsed to zero spacing (avatar touching its label, etc.). Both
// `<Row gap={N}>` and a gap passed through `style` now work.
export function Row({ children, gap = 0, align = 'center', justify, wrap = false, style, ...rest }) {
    return (
        <View
            style={[
                { flexDirection: 'row', alignItems: align, flexWrap: wrap ? 'wrap' : 'nowrap' },
                gap ? { columnGap: gap, rowGap: wrap ? gap : 0 } : null,
                justify ? { justifyContent: justify } : null,
                style
            ]}
            {...rest}
        >
            {children}
        </View>
    );
}

export function Divider({ vertical = false, color, style }) {
    const t = useT();
    return <View style={[vertical ? { width: 1, alignSelf: 'stretch' } : { height: 1 }, { backgroundColor: color || t.line }, style]} />;
}

// A rounded chip. Pass bg/fg tokens; used for priority counts, tags, filters.
export function Pill({ children, bg, fg, style }) {
    const t = useT();
    return (
        <View style={[{ borderRadius: 999, backgroundColor: bg || t.ink3, paddingVertical: 6, paddingHorizontal: 11, alignSelf: 'flex-start' }, style]}>
            {typeof children === 'string' ? <Eyebrow c={fg || t.fg2}>{children}</Eyebrow> : children}
        </View>
    );
}

// ── Pressable ─────────────────────────────────────────────────────────────────
// Mirrors the prototype's .rw:active{opacity:.6}. Use for every tappable surface.
export function Press({ children, onPress, style, disabled, hitSlop, ...rest }) {
    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            hitSlop={hitSlop}
            style={({ pressed }) => [style, pressed && !disabled ? { opacity: 0.6 } : null]}
            {...rest}
        >
            {children}
        </Pressable>
    );
}

// ── Form field ────────────────────────────────────────────────────────────────
// The auth screens' labelled input: eyebrow label, leading glyph, and an accent
// ring. The ring follows REAL focus — the prototype drew the password field
// permanently lit because that is how the static mock-up was captured, which read
// as "this field is selected" on a screen where nothing was, and left the two
// fields looking inconsistent. One component so every auth screen agrees.
export function Field({
    label,
    icon,
    value,
    onChangeText,
    placeholder,
    secure = false,
    keyboardType,
    autoCapitalize = 'none',
    autoCorrect = false,
    onSubmitEditing,
    returnKeyType,
    editable = true,
    maxLength,
    style,
    inputStyle
}) {
    const t = useT();
    const [focused, setFocused] = React.useState(false);
    const [reveal, setReveal] = React.useState(false);
    const lit = focused && editable;

    return (
        <View
            style={[
                {
                    borderRadius: 18,
                    backgroundColor: t.ink2,
                    borderWidth: 1,
                    borderColor: lit ? t.accent : t.line,
                    paddingVertical: 14,
                    paddingHorizontal: 16
                },
                style
            ]}
        >
            {label ? (
                <Eyebrow s={9} w={600} ls={0.12} c={lit ? t.accent : t.fg3} style={{ marginBottom: 7 }}>
                    {label}
                </Eyebrow>
            ) : null}
            <Row gap={10}>
                {icon ? <Glyph name={icon} size={17} color={lit ? t.accent : t.fg2} /> : null}
                <TextInput
                    value={value}
                    onChangeText={onChangeText}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    placeholder={placeholder}
                    placeholderTextColor={t.fg3}
                    secureTextEntry={secure && !reveal}
                    keyboardType={keyboardType}
                    autoCapitalize={autoCapitalize}
                    autoCorrect={autoCorrect}
                    onSubmitEditing={onSubmitEditing}
                    returnKeyType={returnKeyType}
                    editable={editable}
                    maxLength={maxLength}
                    style={[
                        { flex: 1, padding: 0, fontFamily: grotesk(500), fontSize: 15, color: t.fg },
                        NO_WEB_OUTLINE,
                        inputStyle
                    ]}
                />
                {secure ? (
                    <Press onPress={() => setReveal((v) => !v)} hitSlop={10}>
                        <Glyph name={reveal ? 'eye-off-outline' : 'eye-outline'} size={18} color={t.fg3} />
                    </Press>
                ) : null}
            </Row>
        </View>
    );
}

// On the web preview a focused <input> also gets the browser's own focus ring, drawn
// as a hard rectangle INSIDE our rounded pill. There is no such thing on a phone, so
// this is web-only — and guarded rather than unconditional, because `outlineStyle` is
// not a valid React Native style key.
const NO_WEB_OUTLINE = Platform.OS === 'web' ? { outlineStyle: 'none' } : null;

// ── Search / filter bar ───────────────────────────────────────────────────────
// Every screen with a search box drew its own: same rounded ink2 pill, same
// leading magnifier, same clear button — but each one hand-rolled, and none of
// them lit up when you tapped into it. On a screen where a tap does not visibly
// change anything, a box that looks identical focused and unfocused reads as a
// label rather than a field, which is exactly how the ledger's bar was reported.
// One component, so the ring can never be forgotten at a call site again.
export function SearchBar({
    value,
    onChangeText,
    onClear,
    placeholder,
    icon = 'search',
    keyboardType,
    autoCapitalize = 'none',
    autoCorrect = false,
    autoFocus = false,
    returnKeyType = 'search',
    onSubmitEditing,
    size = 13,
    padV = 12,
    right,
    style
}) {
    const t = useT();
    const [focused, setFocused] = React.useState(false);
    const has = !!String(value || '');

    return (
        <Row
            gap={10}
            style={[
                {
                    paddingVertical: padV,
                    paddingHorizontal: 15,
                    borderRadius: 16,
                    backgroundColor: t.ink2,
                    borderWidth: 1,
                    borderColor: focused ? t.accent : t.line
                },
                style
            ]}
        >
            {icon ? <Glyph name={icon} size={16} color={focused ? t.accent : t.fg3} /> : null}
            <TextInput
                value={value}
                onChangeText={onChangeText}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder={placeholder}
                placeholderTextColor={t.fg3}
                keyboardType={keyboardType}
                autoCapitalize={autoCapitalize}
                autoCorrect={autoCorrect}
                autoFocus={autoFocus}
                returnKeyType={returnKeyType}
                onSubmitEditing={onSubmitEditing}
                style={[{
                    flex: 1,
                    minWidth: 0,
                    padding: 0,
                    fontFamily: grotesk(500),
                    fontSize: size,
                    color: t.fg
                }, NO_WEB_OUTLINE]}
            />
            {right || (has && onClear ? (
                <Press onPress={onClear} hitSlop={8}>
                    <Glyph name="close-circle" size={17} color={t.fg3} />
                </Press>
            ) : null)}
        </Row>
    );
}

// ── Free-text box ─────────────────────────────────────────────────────────────
// The reply composer and the sheets' notes fields. Same reason as SearchBar: the
// border has to answer "am I typing in this one", and every one of these was a
// bare TextInput with a static hairline.
export function Composer({
    value,
    onChangeText,
    placeholder,
    multiline = true,
    editable = true,
    minHeight = 46,
    maxHeight = 110,
    keyboardType,
    autoCapitalize = 'sentences',
    maxLength,
    size = 13.5,
    align = 'left',
    mono = false,
    onSubmitEditing,
    returnKeyType,
    inputRef,
    style
}) {
    const t = useT();
    const [focused, setFocused] = React.useState(false);
    const lit = focused && editable;

    return (
        <TextInput
            ref={inputRef}
            value={value}
            onChangeText={onChangeText}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={placeholder}
            placeholderTextColor={t.fg3}
            multiline={multiline}
            editable={editable}
            keyboardType={keyboardType}
            autoCapitalize={autoCapitalize}
            maxLength={maxLength}
            onSubmitEditing={onSubmitEditing}
            returnKeyType={returnKeyType}
            textAlign={align}
            style={[
                {
                    minHeight,
                    borderRadius: 16,
                    backgroundColor: t.ink3,
                    borderWidth: 1,
                    borderColor: lit ? t.accent : t.line,
                    paddingHorizontal: 14,
                    paddingTop: 13,
                    paddingBottom: 13,
                    color: t.fg,
                    fontFamily: mono ? monoFamily(600) : grotesk(400),
                    fontSize: size
                },
                multiline ? { maxHeight } : null,
                NO_WEB_OUTLINE,
                style
            ]}
        />
    );
}

// ── Icon ──────────────────────────────────────────────────────────────────────
// The prototype paints ionicon SVGs via CSS mask; RN uses the Ionicons font.
// Names match ionicons filenames (e.g. "chevron-back", "notifications-outline").
export function Glyph({ name, size = 18, color, style }) {
    const t = useT();
    return <Ionicons name={name} size={size} color={color || t.fg} style={style} />;
}

// A square "chip" holding a glyph, as in the bento cards / header buttons.
export function IconChip({ name, size = 17, color, bg, box = 30, radius = 10, iconStyle, style }) {
    const t = useT();
    return (
        <View style={[{ width: box, height: box, borderRadius: radius, alignItems: 'center', justifyContent: 'center', backgroundColor: bg || t.ink3 }, style]}>
            <Glyph name={name} size={size} color={color || t.fg} style={iconStyle} />
        </View>
    );
}

// ── Media ─────────────────────────────────────────────────────────────────────
export function Face({ uri, size = 34, radius, style }) {
    const t = useT();
    return (
        <Image
            source={uri ? { uri } : undefined}
            style={[{ width: size, height: size, borderRadius: radius != null ? radius : Math.round(size * 0.32), backgroundColor: t.ink3 }, style]}
        />
    );
}

// "Anush Kulal" → AK, "Nihar Kulal" → NK, "Anush" → A. Derived HERE as well as in
// the view-model, because <Initials> accepts a name and a caller that passes one
// must not end up rendering the whole name inside a 40px circle.
export function initialsFrom(v) {
    const raw = String(v || '').trim();
    if (!raw) return '';
    // Already initials (1-2 letters, no spaces) — leave them alone.
    if (/^[A-Za-z]{1,2}$/.test(raw)) return raw.toUpperCase();
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// A stand-in for a missing photo: one or two letters from the person's name. Same
// footprint as <Face>, so a card laid out for an avatar does not reflow when there
// isn't one — which is the usual case, since the API carries a name and a number
// but often no picture.
export function Initials({ text, size = 40, radius, style }) {
    const t = useT();
    return (
        <View
            style={[
                {
                    width: size,
                    height: size,
                    borderRadius: radius != null ? radius : Math.round(size * 0.32),
                    backgroundColor: t.lsoft,
                    alignItems: 'center',
                    justifyContent: 'center'
                },
                style
            ]}
        >
            <T w={700} s={Math.round(size * 0.38)} c={t.accent} style={{ letterSpacing: 0.2 }}>
                {initialsFrom(text) || '?'}
            </T>
        </View>
    );
}

// <Face> when there is a photo, <Initials> when there isn't. Use this anywhere a
// person is shown, so the fallback is never forgotten at one of the call sites.
export function Avatar({ uri, name, initials, size = 40, radius, style }) {
    if (uri) return <Face uri={uri} size={size} radius={radius} style={style} />;
    return <Initials text={initials || name} size={size} radius={radius} style={style} />;
}

// The TP monogram lockup used in the auth screens.
export function Monogram({ size = 38 }) {
    const t = useT();
    return (
        <View style={{ width: size, height: size, borderRadius: size * 0.32, backgroundColor: t.lime, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <View style={{ position: 'absolute', right: -size * 0.18, bottom: -size * 0.18, width: size * 0.55, height: size * 0.55, borderRadius: size * 0.3, backgroundColor: 'rgba(10,10,12,0.10)' }} />
            <T w={700} s={size * 0.42} c={t.on} ls={-0.06} style={{ letterSpacing: -1 }}>TP</T>
        </View>
    );
}

// The TenantPro lockup: the TP monogram + the wordmark, with "Pro" in the
// readable accent tone (lime in dark, deep-lime in light) so it stays legible in
// both themes. Used on the auth/role screens; keep it the one source of the mark.
export function Wordmark({ mono = 38, s = 20, gap = 10, showMonogram = true, style }) {
    const t = useT();
    return (
        <View style={[{ flexDirection: 'row', alignItems: 'center', columnGap: gap }, style]}>
            {showMonogram ? <Monogram size={mono} /> : null}
            <T w={700} s={s} lh={1} style={{ letterSpacing: -0.6 }}>
                Tenant<T w={700} s={s} c={t.accent}>Pro</T>
            </T>
        </View>
    );
}

// The EMAIL / MOBILE segmented switch on the sign-in screens. Both sides of the
// app accept either identifier, so both sides get the same control — it was only
// ever on the tenant screen because that is where the prototype drew it.
//
// `thumbX` is a CSS calc string carried by the view-model ("calc(50% + 0px)"),
// which React Native cannot use as a length. Read the percentage out of it and
// place the thumb from that, so the vm stays the single source of which side is
// selected.
export function IdToggle({ thumbX, emailFg, mobileFg, onEmail, onMobile, style }) {
    const t = useT();
    const col = (v) => (v && (v[0] === '#' || v.startsWith('rgb')) ? v : t[v]);
    const pct = String(thumbX || '').match(/(\d+)%/);
    const left = pct && Number(pct[1]) >= 50 ? '50%' : 4;

    return (
        <View
            style={[
                { position: 'relative', flexDirection: 'row', padding: 4, borderRadius: 15, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, overflow: 'hidden' },
                style
            ]}
        >
            <View style={{ position: 'absolute', top: 4, bottom: 4, left, width: '48%', borderRadius: 11, backgroundColor: t.fg }} />
            <Press onPress={onEmail} style={{ flex: 1, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' }}>
                <T mono w={600} s={10} lh={1} ls={0.08} c={col(emailFg)}>EMAIL</T>
            </Press>
            <Press onPress={onMobile} style={{ flex: 1, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' }}>
                <T mono w={600} s={10} lh={1} ls={0.08} c={col(mobileFg)}>MOBILE</T>
            </Press>
        </View>
    );
}

export const S = StyleSheet.create({ flex1: { flex: 1 }, center: { alignItems: 'center', justifyContent: 'center' } });

// ── QR code ───────────────────────────────────────────────────────────────────
// The matrix comes from qr.js, which is pure arithmetic and lives apart from React
// so it can be tested against a real decoder without stubbing a renderer.
//
// Drawn as one absolutely-positioned View per horizontal RUN of dark modules rather
// than one per module. A 41x41 code is 1,681 modules; run-length encoding it turns
// that into roughly 300 views, and light modules cost nothing because they are just
// the light background showing through. One View per module was visibly slow to
// mount on a mid-range Android.
//
// `value` is the only input that matters: change the amount and the URI changes, so
// the matrix is recomputed and the code on screen is for the new amount. The useMemo
// keys on the string, so nothing recomputes while a sheet re-renders for other
// reasons.
export function QrCode({ value, size = 232, quiet = 2, ec }) {
    const t = useT();
    const built = React.useMemo(() => {
        try {
            return { m: qrMatrix(value, ec ? { ec } : undefined), error: '' };
        } catch (e) {
            // Too long for version 10. Better to say so than to draw something that
            // looks like a QR and scans as nothing.
            return { m: null, error: 'This payment is too long to fit in a QR code.' };
        }
    }, [value, ec]);

    if (!built.m) {
        return (
            <View style={{ width: size, height: size, borderRadius: 14, backgroundColor: t.ink3, alignItems: 'center', justifyContent: 'center', padding: 18 }}>
                <T w={500} s={12} lh={1.45} c={t.fg2} style={{ textAlign: 'center' }}>{built.error}</T>
            </View>
        );
    }

    const { size: n, modules } = built.m;
    // The quiet zone is part of the specification, not padding for looks: a scanner
    // needs light margin to find the edges. Four modules is the spec's minimum but
    // two plus a white card around it reads reliably and wastes less screen.
    const span = n + quiet * 2;
    const cell = size / span;
    const rows = [];
    for (let r = 0; r < n; r += 1) {
        let c = 0;
        while (c < n) {
            if (!modules[r][c]) { c += 1; continue; }
            let end = c;
            while (end < n && modules[r][end]) end += 1;
            rows.push({ key: `${r}-${c}`, x: (c + quiet) * cell, y: (r + quiet) * cell, w: (end - c) * cell });
            c = end;
        }
    }

    return (
        <View
            style={{ width: size, height: size, backgroundColor: '#FFFFFF', borderRadius: 14, overflow: 'hidden' }}
            accessible
            accessibilityRole="image"
            accessibilityLabel="Payment QR code"
        >
            {rows.map((run) => (
                <View
                    key={run.key}
                    style={{ position: 'absolute', left: run.x, top: run.y, width: run.w, height: cell, backgroundColor: '#000000' }}
                />
            ))}
        </View>
    );
}
