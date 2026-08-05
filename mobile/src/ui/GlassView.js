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
import { useTheme } from '../theme';

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

            {children}
        </View>
    );
}
