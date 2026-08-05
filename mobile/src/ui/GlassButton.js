// File: mobile/src/ui/GlassButton.js
// The one button used across the app.
//
// variants:
//   primary  — filled brand gradient (the main action)
//   glass    — frosted pane with a brand rim (secondary action)
//   ghost    — text only
//   danger   — destructive
//
// Every press springs down slightly, so taps always feel acknowledged.
import React, { useRef } from 'react';
import { Animated, Text, Pressable, StyleSheet, ActivityIndicator, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import GlassView from './GlassView';
import { useTheme } from '../theme';

export default function GlassButton({
    label,
    onPress,
    variant = 'primary',
    icon,                   // Ionicons name
    iconRight = false,
    loading = false,
    loadingLabel,
    disabled = false,
    fullWidth = true,
    size = 'md',            // 'sm' | 'md' | 'lg'
    style,
    textStyle
}) {
    const t = useTheme();
    const press = useRef(new Animated.Value(0)).current;
    const isDisabled = disabled || loading;

    const animateTo = (to) =>
        Animated.spring(press, { toValue: to, useNativeDriver: true, ...t.motion.spring }).start();

    const scale = press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.965] });

    const pad = size === 'lg' ? t.spacing.xl : size === 'sm' ? t.spacing.md : 16;
    const fontSize = size === 'lg' ? 17 : size === 'sm' ? 14 : 16;

    const tone = {
        primary: t.colors.onPrimary,
        glass: t.colors.primary,
        ghost: t.colors.primary,
        danger: '#FFFFFF'
    }[variant];

    const content = (
        <View style={styles.row}>
            {loading ? (
                <>
                    <ActivityIndicator size="small" color={tone} />
                    <Text style={[styles.label, { color: tone, fontSize, marginLeft: t.spacing.sm }, textStyle]}>
                        {loadingLabel || 'Please wait…'}
                    </Text>
                </>
            ) : (
                <>
                    {icon && !iconRight ? (
                        <Ionicons name={icon} size={fontSize + 3} color={tone} style={{ marginRight: t.spacing.sm }} />
                    ) : null}
                    <Text style={[styles.label, { color: tone, fontSize }, textStyle]}>{label}</Text>
                    {icon && iconRight ? (
                        <Ionicons name={icon} size={fontSize + 3} color={tone} style={{ marginLeft: t.spacing.sm }} />
                    ) : null}
                </>
            )}
        </View>
    );

    const body = () => {
        if (variant === 'primary' || variant === 'danger') {
            const colors = variant === 'danger'
                ? [t.colors.danger, '#9F1239']
                : t.colors.primaryGradient;
            return (
                <LinearGradient
                    colors={colors}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.solid, { paddingVertical: pad, borderRadius: t.radii.lg }]}
                >
                    {content}
                </LinearGradient>
            );
        }
        if (variant === 'ghost') {
            return <View style={[styles.solid, { paddingVertical: pad }]}>{content}</View>;
        }
        // glass
        return (
            <GlassView
                radius={t.radii.lg}
                style={{ paddingVertical: pad, borderColor: t.colors.borderStrong, borderWidth: 1.5 }}
            >
                {content}
            </GlassView>
        );
    };

    return (
        <Animated.View
            style={[
                fullWidth && styles.fullWidth,
                { transform: [{ scale }], opacity: isDisabled ? 0.55 : 1 },
                variant === 'primary' && !isDisabled ? t.shadows.glow : null,
                style
            ]}
        >
            <Pressable
                onPress={onPress}
                onPressIn={() => animateTo(1)}
                onPressOut={() => animateTo(0)}
                disabled={isDisabled}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ disabled: isDisabled, busy: loading }}
                style={styles.pressable}
            >
                {body()}
            </Pressable>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    fullWidth: { width: '100%' },
    pressable: { width: '100%' },
    solid: { alignItems: 'center', justifyContent: 'center', width: '100%' },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    label: { fontWeight: '800', letterSpacing: 0.3 }
});
