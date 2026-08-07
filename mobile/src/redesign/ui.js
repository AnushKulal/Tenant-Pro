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
import { View, Text, Pressable, Image, StyleSheet, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useT } from './ThemeContext';
import { grotesk, mono as monoFamily } from './theme';

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

// A two-letter stand-in for a missing photo. Same footprint as <Face>, so a card
// laid out for an avatar does not reflow when there isn't one — which is the usual
// case for a landlord, since the API carries their name and number but no picture.
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
                {text || '?'}
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

export const S = StyleSheet.create({ flex1: { flex: 1 }, center: { alignItems: 'center', justifyContent: 'center' } });
