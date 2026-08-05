// File: mobile/src/components/CustomAlert.js
// Shared alert/confirm modal, restyled onto the glass design system.
// Props are unchanged (visible/title/message/type/onClose/isDark) so every
// existing call site keeps working; `isDark` is accepted but ignored because
// useTheme() already reflects the system theme plus the user's override.
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassView, GlassButton } from '../ui';
import { useTheme, withAlpha } from '../theme';

export default function CustomAlert({ visible, title, message, type = 'success', onClose, isDark }) {
    const t = useTheme();
    const scaleValue = useRef(new Animated.Value(0.8)).current;
    const opacityValue = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(scaleValue, {
                    toValue: 1,
                    useNativeDriver: true,
                    ...t.motion.spring
                }),
                Animated.timing(opacityValue, {
                    toValue: 1,
                    duration: t.motion.fast,
                    useNativeDriver: true
                })
            ]).start();
        } else {
            // No exit animation: the component unmounts below, so reset the
            // values now to guarantee the next open starts from the entrance.
            scaleValue.setValue(0.8);
            opacityValue.setValue(0);
        }
    }, [visible]);

    if (!visible) return null;

    // Status icon + accent per alert type, all token-driven.
    const config = {
        success: { icon: 'checkmark-circle', color: t.colors.success },
        error: { icon: 'alert-circle', color: t.colors.danger },
        warning: { icon: 'warning', color: t.colors.warning }
    };

    const activeConfig = config[type] || { icon: 'information-circle', color: t.colors.primary };

    return (
        <Modal transparent={true} visible={visible} animationType="none" onRequestClose={onClose}>
            {/* Backdrop fades via opacity only, so it can ride the native driver. */}
            <Animated.View
                style={[styles.overlay, { backgroundColor: t.colors.scrim, opacity: opacityValue }]}
            >
                <Animated.View
                    style={[
                        styles.cardWrap,
                        t.shadows.lg,
                        { transform: [{ scale: scaleValue }], opacity: opacityValue }
                    ]}
                >
                    <GlassView
                        strong
                        radius={t.radii.xxl}
                        style={{ padding: t.spacing.xxl, alignItems: 'center' }}
                        accessibilityViewIsModal={true}
                    >
                        <View
                            style={[
                                styles.iconWrapper,
                                {
                                    // Halo derived from the accent itself — keeps the
                                    // tint correct in both themes with no literals.
                                    backgroundColor: withAlpha(activeConfig.color, t.isDark ? 0.18 : 0.12),
                                    borderColor: withAlpha(activeConfig.color, t.isDark ? 0.34 : 0.22),
                                    marginBottom: t.spacing.xl
                                }
                            ]}
                        >
                            <Ionicons name={activeConfig.icon} size={40} color={activeConfig.color} />
                        </View>

                        <Text
                            style={[
                                t.typography.heading,
                                styles.centered,
                                { color: t.colors.text, marginBottom: t.spacing.sm }
                            ]}
                        >
                            {title}
                        </Text>

                        <Text
                            style={[
                                t.typography.body,
                                styles.centered,
                                { color: t.colors.textMuted, lineHeight: 21, marginBottom: t.spacing.xxl }
                            ]}
                        >
                            {message}
                        </Text>

                        {/* Single-action model preserved, including the label wording. */}
                        <GlassButton
                            label={type === 'error' ? 'Try Again' : 'Awesome'}
                            variant={type === 'error' ? 'danger' : 'primary'}
                            onPress={onClose}
                        />
                    </GlassView>
                </Animated.View>
            </Animated.View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', zIndex: 10000 },
    cardWrap: { width: '84%' },
    iconWrapper: { width: 80, height: 80, borderRadius: 40, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
    centered: { textAlign: 'center' }
});
