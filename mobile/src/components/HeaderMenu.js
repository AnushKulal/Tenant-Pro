// File: mobile/src/components/HeaderMenu.js
// "More options" — an anchored glass menu that drops out of the ⋯ button in the
// header.
//
// Why this exists: the only way into the app's secondary destinations used to be
// the drawer, and the only way into the drawer was tapping the profile photo. A
// portrait signals "my account", not "app menu", so the drawer was effectively
// undiscoverable and the avatar did the wrong thing when found. Now the ⋯ button
// says what it does, and the things people actually reach for live one tap away
// instead of behind a full-screen drawer.
//
// POSITIONING — read before changing:
// This is an in-window overlay, NOT a Modal, and `top` is a LAYOUT value the
// caller reads off the header's own onLayout. That is deliberate. The first
// version measured the button with measureInWindow and positioned inside a
// statusBarTranslucent Modal, which is wrong on Android: measureInWindow is
// visible-window relative (both architectures subtract
// getWindowVisibleDisplayFrame().top), while the Modal's dialog window starts at
// screen y 0. The panel would have opened about a status bar's height too high —
// on top of the button that opened it — and no browser render can show that,
// because the web has neither a status bar nor that subtraction. Compensating
// with StatusBar.currentHeight only trades one guess for another under
// edge-to-edge, so the fix is to stay in ONE coordinate space: the overlay and
// the header are siblings, so the header's onLayout box is already expressed in
// the overlay's own coordinates. No cross-window arithmetic, nothing to get wrong
// per platform.
//
// Motion: ONE Animated.Value drives everything. The panel scales/fades in, and
// each row reads a different slice of the same 0→1 progress, which produces a
// stagger without N animations, N listeners, or a single JS-driver frame.
import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { GlassView } from '../ui';
import { useTheme, withAlpha } from '../theme';

const PANEL_WIDTH = 244;

// Each row starts 6% of the progress after the previous one and takes 45% to
// land, so the last row is still finishing as the animation completes.
const ROW_STEP = 0.06;
const ROW_SPAN = 0.45;

export default function HeaderMenu({
    visible,
    onClose,
    top,               // layout y of the panel's top edge, in the overlay's space
    right = 16,        // aligns the panel with the header card's right edge
    currentRoute,
    onNavigate,        // (tabName) => void
    onOpenDrawer,      // open the full drawer
    onSignOut
}) {
    const t = useTheme();
    const anim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!visible) return;
        anim.setValue(0);
        Animated.timing(anim, {
            toValue: 1,
            duration: t.motion.normal,
            useNativeDriver: true
        }).start();
    }, [visible, anim, t.motion.normal]);

    const items = useMemo(() => [
        { key: 'Profile', icon: 'person-outline', label: 'My Profile', tab: 'Profile' },
        { key: 'Transactions', icon: 'wallet-outline', label: 'Transactions', tab: 'Transactions' },
        { key: 'PaymentSettings', icon: 'qr-code-outline', label: 'Payment Setup', tab: 'PaymentSettings' },
        { key: 'Settings', icon: 'settings-outline', label: 'Settings', tab: 'Settings' },
        { key: 'HelpSupport', icon: 'help-buoy-outline', label: 'Help & Support', tab: 'HelpSupport' },
        { key: 'divider-1', divider: true },
        {
            key: 'theme',
            icon: t.isDark ? 'sunny-outline' : 'moon-outline',
            label: t.isDark ? 'Light appearance' : 'Dark appearance',
            // Deliberately does NOT close the menu: the whole point of a theme
            // switch is watching the surface you are looking at change.
            action: () => t.toggle(),
            keepOpen: true
        },
        // A hamburger, not albums-outline: at 19px that glyph was near-identical
        // to the wallet two rows up, so two unrelated rows read the same.
        { key: 'drawer', icon: 'menu-outline', label: 'Full menu', action: onOpenDrawer },
        { key: 'divider-2', divider: true },
        { key: 'logout', icon: 'log-out-outline', label: 'Log Out', action: onSignOut, danger: true }
    ], [t, onOpenDrawer, onSignOut]);

    if (!visible) return null;

    const panelStyle = {
        opacity: anim,
        transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) },
            // Subtle: RN has no transform-origin, so a large scale would visibly
            // pull the panel away from its anchor as it grows from the centre.
            { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }
        ]
    };

    let rowIndex = -1;

    return (
        <View style={styles.overlay}>
            {/* Backdrop is only just visible — this is a menu, not a dialog, and
                dimming the whole app for it would feel far heavier than the
                interaction deserves. It still covers the full screen so a tap
                anywhere (including the tab bar) dismisses rather than acting. */}
            <Pressable
                style={styles.fill}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close menu"
            >
                <Animated.View
                    style={[
                        styles.fill,
                        { backgroundColor: t.colors.scrim, opacity: Animated.multiply(anim, 0.55) }
                    ]}
                />
            </Pressable>

            <Animated.View style={[styles.anchored, { top, right }, panelStyle]}>
                <View style={[{ borderRadius: t.radii.lg }, t.shadows.lg]}>
                    <GlassView
                        strong
                        radius={t.radii.lg}
                        edgeLight
                        style={styles.panel}
                    >
                        {items.map((item) => {
                            if (item.divider) {
                                return (
                                    <View
                                        key={item.key}
                                        style={[styles.divider, { backgroundColor: t.colors.border }]}
                                    />
                                );
                            }

                            rowIndex += 1;
                            const start = rowIndex * ROW_STEP;
                            const rowAnim = anim.interpolate({
                                inputRange: [start, Math.min(1, start + ROW_SPAN)],
                                outputRange: [0, 1],
                                extrapolate: 'clamp'
                            });

                            const isActive = !!item.tab && item.tab === currentRoute;
                            const tone = item.danger
                                ? t.colors.danger
                                : isActive ? t.colors.primary : t.colors.text;

                            return (
                                <Animated.View
                                    key={item.key}
                                    style={{
                                        opacity: rowAnim,
                                        transform: [{
                                            translateX: rowAnim.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: [10, 0]
                                            })
                                        }]
                                    }}
                                >
                                    <Pressable
                                        onPress={() => {
                                            if (!item.keepOpen) onClose();
                                            if (item.action) item.action();
                                            else if (item.tab) onNavigate(item.tab);
                                        }}
                                        style={({ pressed }) => [
                                            styles.row,
                                            { borderRadius: t.radii.md },
                                            isActive && {
                                                backgroundColor: withAlpha(t.colors.primary, t.isDark ? 0.18 : 0.1)
                                            },
                                            pressed && {
                                                backgroundColor: withAlpha(
                                                    item.danger ? t.colors.danger : t.colors.primary,
                                                    t.isDark ? 0.26 : 0.14
                                                )
                                            }
                                        ]}
                                        accessibilityRole={item.tab ? 'menuitem' : 'button'}
                                        accessibilityLabel={item.label}
                                        accessibilityState={{ selected: isActive }}
                                    >
                                        <Ionicons
                                            name={isActive ? item.icon.replace('-outline', '') : item.icon}
                                            size={19}
                                            color={item.danger ? t.colors.danger : isActive ? t.colors.primary : t.colors.textMuted}
                                            style={styles.rowIcon}
                                        />
                                        <Text
                                            style={[
                                                t.typography.body,
                                                styles.rowLabel,
                                                { color: tone },
                                                isActive && styles.rowLabelActive
                                            ]}
                                            numberOfLines={1}
                                        >
                                            {item.label}
                                        </Text>
                                        {isActive ? (
                                            <View style={[styles.activeDot, { backgroundColor: t.colors.primary }]} />
                                        ) : null}
                                    </Pressable>
                                </Animated.View>
                            );
                        })}
                    </GlassView>
                </View>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    // zIndex sits above the tab bar (50) and below the drawer (100), so opening
    // the drawer from this menu layers correctly.
    overlay: { ...StyleSheet.absoluteFillObject, zIndex: 90 },
    fill: { ...StyleSheet.absoluteFillObject },
    anchored: { position: 'absolute', width: PANEL_WIDTH },
    panel: { paddingVertical: 8, paddingHorizontal: 8 },

    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 10 },
    rowIcon: { width: 26 },
    rowLabel: { flex: 1, marginLeft: 6 },
    rowLabelActive: { fontWeight: '700' },
    activeDot: { width: 6, height: 6, borderRadius: 3 },

    divider: { height: 1, marginVertical: 6, marginHorizontal: 10, opacity: Platform.OS === 'android' ? 0.9 : 1 }
});
