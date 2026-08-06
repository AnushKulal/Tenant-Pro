// File: mobile/src/ui/GlassInput.js
// Frosted text field with a leading icon, animated focus rim, password reveal
// and inline error text.
//
// The text colour is ALWAYS set explicitly from the theme. That's deliberate:
// the old login screen forced a white background on focus while the text was
// also white, so typing became invisible on Android. Driving both the fill and
// the text from the same token pair makes that class of bug impossible.
import React, { useRef, useState, useEffect } from 'react';
import { View, TextInput, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import GlassView from './GlassView';
import { useTheme, withAlpha } from '../theme';

export default function GlassInput({
    value,
    onChangeText,
    placeholder,
    icon,                       // Ionicons name
    secure = false,
    error,
    editable = true,
    autoCapitalize = 'sentences',
    keyboardType = 'default',
    returnKeyType,
    onSubmitEditing,
    maxLength,
    multiline = false,
    style,
    testID
}) {
    const t = useTheme();
    const [focused, setFocused] = useState(false);
    const [reveal, setReveal] = useState(false);
    const glow = useRef(new Animated.Value(0)).current;
    const shake = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(glow, {
            toValue: focused ? 1 : 0,
            duration: t.motion.fast,
            useNativeDriver: false // animating borderColor
        }).start();
    }, [focused, glow, t.motion.fast]);

    // Nudge the field when an error appears — cheap, obvious feedback.
    useEffect(() => {
        if (!error) return;
        Animated.sequence([
            Animated.timing(shake, { toValue: 1, duration: 60, useNativeDriver: true }),
            Animated.timing(shake, { toValue: -1, duration: 60, useNativeDriver: true }),
            Animated.timing(shake, { toValue: 0, duration: 60, useNativeDriver: true })
        ]).start();
    }, [error, shake]);

    const borderColor = error
        ? t.colors.danger
        : glow.interpolate({
            inputRange: [0, 1],
            outputRange: [t.colors.glassBorder, t.colors.primary]
        });

    const translateX = shake.interpolate({ inputRange: [-1, 1], outputRange: [-6, 6] });

    return (
        <Animated.View style={[{ transform: [{ translateX }] }, style]}>
            <Animated.View
                style={[
                    styles.wrap,
                    {
                        borderRadius: t.radii.lg,
                        borderColor,
                        borderWidth: 1.5,
                        shadowColor: t.colors.primary,
                        shadowOpacity: focused ? 0.28 : 0,
                        shadowRadius: 12,
                        shadowOffset: { width: 0, height: 0 }
                    }
                ]}
            >
                {/* blur={false}: inputs live inside an already-blurred GlassCard, so a
                    second blur pass would cost GPU for no visible difference. */}
                <GlassView radius={t.radii.lg - 1} bordered={false} blur={false} style={styles.glass}>
                    <View style={[styles.row, multiline && styles.rowMultiline]}>
                        {icon ? (
                            <Ionicons
                                name={icon}
                                size={19}
                                color={focused ? t.colors.primary : t.colors.textFaint}
                                style={{ marginRight: t.spacing.md }}
                            />
                        ) : null}

                        <TextInput
                            testID={testID}
                            style={[
                                styles.input,
                                {
                                    color: t.colors.text,          // explicit — never inherits
                                    fontSize: 16,
                                    minHeight: multiline ? 88 : undefined,
                                    textAlignVertical: multiline ? 'top' : 'center'
                                }
                            ]}
                            value={value}
                            onChangeText={onChangeText}
                            placeholder={placeholder}
                            placeholderTextColor={t.colors.textFaint}
                            secureTextEntry={secure && !reveal}
                            editable={editable}
                            autoCapitalize={autoCapitalize}
                            autoCorrect={false}
                            keyboardType={keyboardType}
                            returnKeyType={returnKeyType}
                            onSubmitEditing={onSubmitEditing}
                            maxLength={maxLength}
                            multiline={multiline}
                            onFocus={() => setFocused(true)}
                            onBlur={() => setFocused(false)}
                            // Keep the Android cursor/selection on-brand.
                            selectionColor={t.colors.primary}
                            cursorColor={t.colors.primary}
                            underlineColorAndroid="transparent"
                        />

                        {secure ? (
                            <TouchableOpacity
                                onPress={() => setReveal((r) => !r)}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                // A guaranteed gap before the icon so the flexing
                                // TextInput can never butt right up against it.
                                style={styles.trailingBtn}
                                accessibilityLabel={reveal ? 'Hide password' : 'Show password'}
                            >
                                <Ionicons
                                    name={reveal ? 'eye-outline' : 'eye-off-outline'}
                                    size={20}
                                    color={t.colors.textMuted}
                                />
                            </TouchableOpacity>
                        ) : null}
                    </View>
                </GlassView>
            </Animated.View>

            {error ? (
                <View style={styles.errorRow}>
                    <Ionicons name="alert-circle" size={13} color={t.colors.danger} />
                    <Text style={[styles.errorText, { color: t.colors.danger }]}>{error}</Text>
                </View>
            ) : null}
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    wrap: { overflow: 'hidden' },
    glass: { width: '100%' },
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15 },
    rowMultiline: { alignItems: 'flex-start', paddingVertical: 12 },
    // minWidth:0 is the fix for the clipped trailing icon. Without it, on Android a
    // flex:1 TextInput will not shrink below its placeholder's intrinsic width, so a
    // long placeholder ("Confirm password") pushes the eye toggle past the field's
    // right edge, where overflow:hidden crops it. Web/Yoga shrinks it anyway, which
    // is why this only ever showed on device. minWidth:0 forces the shrink on both.
    input: { flex: 1, minWidth: 0, paddingVertical: 15, fontWeight: '500' },
    trailingBtn: { marginLeft: 8 },
    errorRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, marginLeft: 6 },
    errorText: { fontSize: 12.5, fontWeight: '600', marginLeft: 4 }
});
