// File: mobile/src/redesign/screens/GuestSignInScreen.js
// A guest coming back — new phone, reinstalled app, or just signed out.
//
// This screen exists because a guest has no password, so the ordinary sign-in screen
// is not their way back in. Their guest ID and the number they joined with IS the
// credential, and the two together are what the server checks.
//
// It also says out loud that the ID expires with the stay, because "my code stopped
// working" is otherwise indistinguishable from a bug — and the honest answer is that
// their tenancy ended and they should ask to join again.
import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Eyebrow, Row, Press, Glyph, Field, IconChip } from '../ui';
import { KeyboardScroll } from '../keyboard';

export default function GuestSignInScreen() {
    const vm = useVm();
    const t = useT();
    const g = vm.guestSignIn;

    return (
        <KeyboardScroll
            contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 22, paddingTop: 24, paddingBottom: 30 }}
            showsVerticalScrollIndicator={false}
        >
            <Press
                onPress={g.back}
                style={{ width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}
            >
                <Glyph name="chevron-back" size={19} color={t.fg} />
            </Press>

            <View style={{ flex: 1, justifyContent: 'center' }}>
                <IconChip name="ticket-outline" size={24} box={52} radius={17} bg={t.lsoft} color={t.accent} />

                <Eyebrow s={9} ls={0.14} c={t.fg3} style={{ marginTop: 22 }}>GUEST SIGN IN</Eyebrow>
                <T w={700} s={32} lh={1.06} style={{ letterSpacing: -1.4, marginTop: 10 }}>
                    Use your{'\n'}
                    <T w={700} s={32} c={t.accent}>guest ID.</T>
                </T>
                <T w={400} s={13.5} lh={1.55} c={t.fg2} style={{ marginTop: 12, marginBottom: 22 }}>{g.line}</T>

                <Field
                    label="GUEST ID"
                    icon="ticket-outline"
                    value={g.code}
                    onChangeText={g.setCode}
                    placeholder="7K2QFH"
                    autoCapitalize="characters"
                    maxLength={6}
                    style={{ marginBottom: 10 }}
                />

                <Field
                    label="MOBILE NUMBER"
                    icon="call-outline"
                    value={g.phone}
                    onChangeText={g.setPhone}
                    placeholder="98765 43210"
                    keyboardType="phone-pad"
                    onSubmitEditing={g.submit}
                    returnKeyType="go"
                    style={{ marginBottom: 14 }}
                />

                {g.hasError ? (
                    <Row gap={8} align="flex-start" style={{ marginBottom: 12, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 13, backgroundColor: t.csoft }}>
                        <Glyph name="alert-circle" size={15} color={t.coral} />
                        <T w={500} s={12.5} lh={1.45} c={t.coral} style={{ flex: 1 }}>{g.error}</T>
                    </Row>
                ) : null}

                <Press
                    onPress={g.submit}
                    disabled={!g.canSubmit}
                    style={{
                        paddingVertical: 17,
                        borderRadius: 999,
                        backgroundColor: g.canSubmit ? t.lime : t.ink3,
                        borderWidth: 1,
                        borderColor: g.canSubmit ? t.lime : t.line,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        columnGap: 8
                    }}
                >
                    <T w={700} s={15} c={g.canSubmit ? t.on : t.fg3}>{g.submitLabel}</T>
                    {g.busy ? <ActivityIndicator size="small" color={g.canSubmit ? t.on : t.fg3} /> : null}
                </Press>

                <Row justify="center" gap={7} style={{ marginTop: 22 }}>
                    <T w={400} s={13} c={t.fg3}>No guest ID?</T>
                    <Press onPress={vm.goGuest} hitSlop={8}>
                        <T w={600} s={13} c={t.accent}>Join a property</T>
                    </Press>
                </Row>
            </View>
        </KeyboardScroll>
    );
}
