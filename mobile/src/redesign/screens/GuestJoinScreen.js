// File: mobile/src/redesign/screens/GuestJoinScreen.js
// "Join as a guest" — the way in for someone who has a property code but no
// TenantPro account yet.
//
// Why it replaced "Join with an invite QR" on the sign-in screen: that button was a
// dead end for exactly the people it was aimed at. Scanning needs no account, but
// ASKING to join does — so a new arrival scanned a code, was told to sign in, and
// the code was thrown away. Here the code is held through registration and the
// request is sent for them once the account exists.
//
// Scanning and typing are presented as equal choices, not a primary and a fallback.
// That is deliberate: on a build without expo-camera the scanner cannot open at all,
// and on any build a code read aloud over the phone is just as valid as a QR.
import React from 'react';
import { View, ScrollView } from 'react-native';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Eyebrow, Row, Press, Glyph, Field, IconChip } from '../ui';

export default function GuestJoinScreen() {
    const vm = useVm();
    const t = useT();
    const g = vm.guest;

    return (
        <ScrollView
            contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 22, paddingTop: 24, paddingBottom: 30 }}
            showsVerticalScrollIndicator={false}
        >
            <Press
                onPress={vm.goTenantLogin}
                style={{ width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}
            >
                <Glyph name="chevron-back" size={19} color={t.fg} />
            </Press>

            <View style={{ flex: 1, justifyContent: 'center' }}>
                <IconChip name="enter-outline" size={24} box={52} radius={17} bg={t.lsoft} color={t.accent} />

                <Eyebrow s={9} ls={0.14} c={t.fg3} style={{ marginTop: 22 }}>JOIN A PROPERTY</Eyebrow>
                <T w={700} s={32} lh={1.06} style={{ letterSpacing: -1.4, marginTop: 10 }}>
                    Have a{'\n'}
                    <T w={700} s={32} c={t.accent}>property code?</T>
                </T>
                <T w={400} s={13.5} lh={1.55} c={t.fg2} style={{ marginTop: 12 }}>{g.line}</T>

                {/* Scan — first, because it is the one action most people have in front
                    of them, but not the only one. */}
                <Press
                    onPress={g.scan}
                    style={{ marginTop: 26, paddingVertical: 17, borderRadius: 20, backgroundColor: t.lime, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 10 }}
                >
                    <Glyph name="qr-code" size={19} color={t.on} />
                    <T w={700} s={15} c={t.on}>Scan the QR</T>
                </Press>

                <Row gap={12} style={{ marginVertical: 18 }}>
                    <View style={{ flex: 1, height: 1, backgroundColor: t.line }} />
                    <Eyebrow s={9} ls={0.12} c={t.fg3}>OR TYPE IT</Eyebrow>
                    <View style={{ flex: 1, height: 1, backgroundColor: t.line }} />
                </Row>

                <Field
                    label="PROPERTY CODE"
                    icon="key-outline"
                    value={g.code}
                    onChangeText={g.setCode}
                    placeholder="TP-SUN-8412"
                    autoCapitalize="characters"
                    onSubmitEditing={g.submitCode}
                    returnKeyType="go"
                    style={{ marginBottom: 12 }}
                />

                <Press
                    onPress={g.submitCode}
                    disabled={!g.canSubmit}
                    style={{
                        paddingVertical: 16,
                        borderRadius: 999,
                        backgroundColor: g.canSubmit ? t.fg : t.ink3,
                        borderWidth: 1,
                        borderColor: g.canSubmit ? t.fg : t.line,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        columnGap: 8
                    }}
                >
                    <T w={700} s={14.5} c={g.canSubmit ? t.ink : t.fg3}>Continue</T>
                    <Glyph name="arrow-forward" size={16} color={g.canSubmit ? t.ink : t.fg3} />
                </Press>

                {/* For anyone who already has an account and landed here by mistake. */}
                <Row justify="center" gap={7} style={{ marginTop: 22 }}>
                    <T w={400} s={13} c={t.fg3}>Already have an account?</T>
                    <Press onPress={vm.goTenantLogin} hitSlop={8}>
                        <T w={600} s={13} c={t.accent}>Sign in</T>
                    </Press>
                </Row>
            </View>
        </ScrollView>
    );
}
