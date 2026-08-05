// File: mobile/src/ui/GlassView.js
// The core "frosted pane" primitive. Everything card-like in the app is built
// on this so glass looks identical everywhere.
//
// Composition (bottom → top):
//   1. BlurView          — real backdrop blur
//   2. tint fill         — themed translucent colour so text stays readable
//   3. top sheen         — subtle light gradient, sells the "glass" edge
//   4. hairline border    — 1px rim
//   5. children
//
// Android note: expo-blur needs experimentalBlurMethod to blur on Android.
// If blur is unavailable the tint fill alone still reads as frosted glass, so
// this degrades gracefully instead of turning into a flat rectangle.
import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, withAlpha } from '../theme';

export default function GlassView({
    children,
    style,
    radius,                 // defaults to radii.xl
    intensity,              // blur strength; defaults per-theme
    strong = false,         // more opaque — use for sheets/modals over content
    sheen = true,           // top highlight gradient
    bordered = true,
    tintColor,              // override the fill colour
    // Skip the BlurView layer. Set this when the pane sits INSIDE another glass
    // surface: blurring an already-blurred backdrop costs real GPU time on
    // Android and adds nothing visually. The tint + sheen still read as glass.
    blur = true,
    // Physical-glass treatment: a crisp specular hairline along the top edge plus
    // a vertical frost→clear falloff. Real glass is not uniformly milky — it
    // catches light on its lit edge and turns almost transparent away from it,
    // and that gradient is what separates "frosted glass" from "translucent
    // rectangle". Pair it with a LOW-alpha tintColor so the backdrop shows
    // through; a high-alpha tint hides the effect entirely.
    edgeLight = false,
    ...rest
}) {
    const t = useTheme();
    const r = radius ?? t.radii.xl;
    const fill = tintColor ?? (strong ? t.colors.glassBgStrong : t.colors.glassBg);
    return (
        <View
            style={[
                { borderRadius: r, overflow: 'hidden' },
                bordered && { borderWidth: 1, borderColor: t.colors.glassBorder },
                style
            ]}
            {...rest}
        >
            {blur ? (
                <BlurView
                    intensity={intensity ?? (strong ? t.blurIntensity + 22 : t.blurIntensity)}
                    tint={t.blurTint}
                    // Required for the blur to actually render on Android.
                    experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
                    style={StyleSheet.absoluteFill}
                />
            ) : null}

            {/* Themed tint keeps contrast predictable regardless of what's behind. */}
            <View style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} pointerEvents="none" />

            {sheen ? (
                <LinearGradient
                    colors={t.colors.sheenGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0.6, y: 1 }}
                    style={[StyleSheet.absoluteFill, { opacity: t.isDark ? 0.5 : 0.75 }]}
                    pointerEvents="none"
                />
            ) : null}

            {edgeLight ? (
                <>
                    {/* Frost → clear falloff: milky along the lit top edge, fading
                        to nothing by mid-height so the backdrop reads through the
                        lower half. This is the "frost and clear" mix. */}
                    <LinearGradient
                        colors={[
                            withAlpha(t.colors.onPrimary, t.isDark ? 0.16 : 0.55),
                            withAlpha(t.colors.onPrimary, t.isDark ? 0.05 : 0.18),
                            'rgba(255,255,255,0)'
                        ]}
                        locations={[0, 0.42, 1]}
                        start={{ x: 0.5, y: 0 }}
                        end={{ x: 0.5, y: 1 }}
                        style={StyleSheet.absoluteFill}
                        pointerEvents="none"
                    />
                    {/* Specular hairline, as a horizontal gradient rather than a
                        solid bar: a solid one has hard ends that read as a stray
                        line across the pane (observed in a render). Fading both
                        ends to zero makes it look like light catching the edge. */}
                    <LinearGradient
                        colors={[
                            'rgba(255,255,255,0)',
                            withAlpha(t.colors.onPrimary, t.isDark ? 0.38 : 0.85),
                            'rgba(255,255,255,0)'
                        ]}
                        locations={[0, 0.5, 1]}
                        start={{ x: 0, y: 0.5 }}
                        end={{ x: 1, y: 0.5 }}
                        style={styles.edgeHairline}
                        pointerEvents="none"
                    />
                </>
            ) : null}

            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    // 1px is a hairline on any density because RN sizes in dp.
    edgeHairline: { position: 'absolute', top: 0, left: '4%', right: '4%', height: 1 }
});
