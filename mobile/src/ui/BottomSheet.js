// File: mobile/src/ui/BottomSheet.js
// Reusable sheet that slides up from the bottom edge over a dimmed backdrop,
// with a grab handle, an optional close (✕) button and swipe-down-to-dismiss.
// Used by the update prompt and available for any future modal flow.
import React, { useEffect, useRef, useCallback } from 'react';
import {
    Modal, View, Text, StyleSheet, Animated, PanResponder,
    TouchableOpacity, TouchableWithoutFeedback, Dimensions, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import GlassView from './GlassView';
import { useTheme } from '../theme';

const SCREEN_H = Dimensions.get('window').height;

export default function BottomSheet({
    visible,
    onClose,
    title,
    subtitle,
    children,
    showClose = true,
    dismissOnBackdrop = true,
    swipeToDismiss = true
}) {
    const t = useTheme();
    const translateY = useRef(new Animated.Value(SCREEN_H)).current;
    const backdrop = useRef(new Animated.Value(0)).current;

    const animateIn = useCallback(() => {
        Animated.parallel([
            Animated.spring(translateY, { toValue: 0, useNativeDriver: true, ...t.motion.springSoft }),
            Animated.timing(backdrop, { toValue: 1, duration: t.motion.normal, useNativeDriver: true })
        ]).start();
    }, [translateY, backdrop, t.motion.springSoft, t.motion.normal]);

    const animateOut = useCallback(
        (then) => {
            Animated.parallel([
                Animated.timing(translateY, { toValue: SCREEN_H, duration: t.motion.fast + 60, useNativeDriver: true }),
                Animated.timing(backdrop, { toValue: 0, duration: t.motion.fast, useNativeDriver: true })
            ]).start(() => then && then());
        },
        [translateY, backdrop, t.motion.fast]
    );

    useEffect(() => {
        if (visible) {
            translateY.setValue(SCREEN_H);
            animateIn();
        }
    }, [visible, animateIn, translateY]);

    // Animate out first, then tell the parent to unmount.
    const requestClose = useCallback(() => {
        animateOut(() => onClose && onClose());
    }, [animateOut, onClose]);

    const pan = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: (_, g) => swipeToDismiss && g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx),
            onPanResponderMove: (_, g) => {
                if (g.dy > 0) translateY.setValue(g.dy);
            },
            onPanResponderRelease: (_, g) => {
                // Far enough or fast enough → dismiss; otherwise snap back.
                if (g.dy > 110 || g.vy > 0.9) {
                    requestClose();
                } else {
                    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, ...t.motion.spring }).start();
                }
            }
        })
    ).current;

    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={requestClose} statusBarTranslucent>
            <View style={styles.root}>
                <TouchableWithoutFeedback onPress={dismissOnBackdrop ? requestClose : undefined}>
                    <Animated.View
                        style={[StyleSheet.absoluteFill, { backgroundColor: t.colors.scrim, opacity: backdrop }]}
                    />
                </TouchableWithoutFeedback>

                <Animated.View style={[styles.sheetWrap, { transform: [{ translateY }] }]} {...pan.panHandlers}>
                    <GlassView
                        strong
                        radius={t.radii.xxl}
                        style={[styles.sheet, { paddingBottom: Platform.OS === 'ios' ? 34 : t.spacing.xxl }]}
                    >
                        {/* Grab handle */}
                        <View style={styles.handleZone}>
                            <View style={[styles.handle, { backgroundColor: t.colors.textFaint }]} />
                        </View>

                        {(title || showClose) ? (
                            <View style={styles.header}>
                                <View style={styles.headerText}>
                                    {title ? (
                                        <Text style={[t.typography.heading, { color: t.colors.text }]}>{title}</Text>
                                    ) : null}
                                    {subtitle ? (
                                        <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 3 }]}>
                                            {subtitle}
                                        </Text>
                                    ) : null}
                                </View>

                                {showClose ? (
                                    <TouchableOpacity
                                        onPress={requestClose}
                                        hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                                        accessibilityLabel="Close"
                                        style={[styles.closeBtn, { backgroundColor: t.colors.surfaceAlt }]}
                                    >
                                        <Ionicons name="close" size={19} color={t.colors.textMuted} />
                                    </TouchableOpacity>
                                ) : null}
                            </View>
                        ) : null}

                        {children}
                    </GlassView>
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end' },
    sheetWrap: { width: '100%' },
    sheet: {
        width: '100%',
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        paddingHorizontal: 22,
        paddingTop: 6
    },
    handleZone: { alignItems: 'center', paddingVertical: 8 },
    handle: { width: 44, height: 4.5, borderRadius: 3, opacity: 0.5 },
    header: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 6, marginBottom: 14 },
    headerText: { flex: 1, paddingRight: 12 },
    closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }
});
