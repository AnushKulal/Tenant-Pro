// File: mobile/src/components/HeaderMenu.js
// "More options" — an anchored glass menu that drops out of the ⋯ button in the
// header. This is the app's ONLY menu: the slide-in drawer it replaced is gone.
//
// Why: the drawer's only entry point was the profile photo. A portrait signals
// "my account", not "app menu", so the drawer was undiscoverable and the avatar
// did the wrong thing when found. Then, once this menu existed, the drawer was
// a second navigation surface listing mostly the same destinations — a full-screen
// panel is a lot of ceremony for six rows, and on a phone it also fights the
// system's own back-edge gesture. So the menu absorbed everything it had,
// including the account block and the version line, and the drawer was deleted.
//
// Nothing became unreachable: Home / Rooms / Properties / Tenants are the bottom
// nav, Terms and Help sit behind Settings, and everything else is a row here.
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
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Pressable, Platform, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { GlassView, Avatar } from '../ui';
import { useTheme, withAlpha } from '../theme';

// Wider than a plain row list needs: the account block at the top carries a name
// and an email, and those should not be truncating on a normal-length address.
const PANEL_WIDTH = 268;

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
    onSignOut,
    // Account block — inherited from the drawer's header.
    fullName,
    email,
    profilePic,
    version = 'TenantPro v1.0'
}) {
    const t = useTheme();
    const anim = useRef(new Animated.Value(0)).current;

    // Stays mounted through the exit so the panel can animate OUT as well as in —
    // unmounting on `visible === false` is what made it vanish instantly before.
    // `mounted` is cleared by the close animation's own completion callback, so we
    // never have to inspect Animated internals to know when it is safe to drop.
    const [mounted, setMounted] = useState(visible);

    useEffect(() => {
        if (visible) {
            setMounted(true);
            Animated.timing(anim, {
                toValue: 1,
                duration: t.motion.normal,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true
            }).start();
            return;
        }

        // Exits run shorter than entrances: an arrival wants to be noticed, a
        // dismissal wants to be out of the way. The row stagger reverses for free
        // here — each row reads the same progress, so the bottom row (whose slice
        // starts latest) is the first to leave.
        Animated.timing(anim, {
            toValue: 0,
            duration: t.motion.fast,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true
        }).start(({ finished }) => {
            if (finished) setMounted(false);
        });
    }, [visible, anim, t.motion.normal, t.motion.fast]);

    const items = useMemo(() => [
        // The account block replaces a separate "My Profile" row: it says whose
        // account this is AND is the way into it, which is what the drawer's
        // header did.
        { key: 'account', account: true, tab: 'Profile' },
        { key: 'divider-0', divider: true },
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
        { key: 'divider-2', divider: true },
        { key: 'logout', icon: 'log-out-outline', label: 'Log Out', action: onSignOut, danger: true },
        { key: 'version', version: true }
    ], [t, onSignOut]);

    if (!mounted) return null;

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
        // Dead to touch while leaving: the panel is still on screen during the
        // exit, and a tap landing on a row that is halfway gone would fire it.
        <View style={styles.overlay} pointerEvents={visible ? 'auto' : 'none'}>
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

                            const rowMotion = {
                                opacity: rowAnim,
                                transform: [{
                                    translateX: rowAnim.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [10, 0]
                                    })
                                }]
                            };

                            // Version line: the drawer's footer, kept so the build
                            // is still visible somewhere after the drawer's removal.
                            if (item.version) {
                                return (
                                    <Animated.View key={item.key} style={rowMotion}>
                                        <Text
                                            style={[
                                                t.typography.micro,
                                                styles.version,
                                                { color: t.colors.textFaint }
                                            ]}
                                        >
                                            {version}
                                        </Text>
                                    </Animated.View>
                                );
                            }

                            if (item.account) {
                                return (
                                    <Animated.View key={item.key} style={rowMotion}>
                                        <Pressable
                                            onPress={() => {
                                                onClose();
                                                onNavigate(item.tab);
                                            }}
                                            style={({ pressed }) => [
                                                styles.account,
                                                { borderRadius: t.radii.md },
                                                isActive && {
                                                    backgroundColor: withAlpha(t.colors.primary, t.isDark ? 0.18 : 0.1)
                                                },
                                                pressed && {
                                                    backgroundColor: withAlpha(t.colors.primary, t.isDark ? 0.26 : 0.14)
                                                }
                                            ]}
                                            accessibilityRole="button"
                                            accessibilityLabel={`Open profile for ${fullName || 'your account'}`}
                                            accessibilityState={{ selected: isActive }}
                                        >
                                            <Avatar name={fullName} uri={profilePic} size={40} radius={20} />
                                            <View style={styles.accountText}>
                                                <Text
                                                    style={[
                                                        t.typography.bodyStrong,
                                                        { color: isActive ? t.colors.primary : t.colors.text }
                                                    ]}
                                                    numberOfLines={1}
                                                >
                                                    {fullName || 'My Profile'}
                                                </Text>
                                                {email ? (
                                                    <Text
                                                        style={[t.typography.caption, { color: t.colors.textMuted }]}
                                                        numberOfLines={1}
                                                    >
                                                        {email}
                                                    </Text>
                                                ) : null}
                                            </View>
                                            <Ionicons
                                                name="chevron-forward"
                                                size={16}
                                                color={t.colors.textFaint}
                                            />
                                        </Pressable>
                                    </Animated.View>
                                );
                            }

                            return (
                                <Animated.View key={item.key} style={rowMotion}>
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
    account: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 10 },
    accountText: { flex: 1, marginLeft: 12, marginRight: 6 },
    version: { textAlign: 'center', paddingTop: 8, paddingBottom: 2 },
    rowIcon: { width: 26 },
    rowLabel: { flex: 1, marginLeft: 6 },
    rowLabelActive: { fontWeight: '700' },
    activeDot: { width: 6, height: 6, borderRadius: 3 },

    divider: { height: 1, marginVertical: 6, marginHorizontal: 10, opacity: Platform.OS === 'android' ? 0.9 : 1 }
});
