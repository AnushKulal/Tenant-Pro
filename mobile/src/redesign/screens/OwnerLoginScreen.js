import React from 'react';
import { View, ScrollView } from 'react-native';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Eyebrow, Row, Press, Glyph, Monogram, Divider, Field } from '../ui';

export default function OwnerLoginScreen() {
    const vm = useVm();
    const t = useT();
    return (
        <ScrollView
            contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 22, paddingTop: 24, paddingBottom: 28 }}
            showsVerticalScrollIndicator={false}
        >
            <Press
                onPress={vm.goRole}
                style={{ width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}
            >
                <Glyph name="chevron-back" size={19} color={t.fg} />
            </Press>

            <View style={{ flex: 1, justifyContent: 'center' }}>
                <Row style={{ marginBottom: 18 }}>
                    <Monogram size={34} />
                    <Eyebrow s={10} w={600} ls={0.14} c={t.accent} style={{ marginLeft: 10 }}>OWNER SIGN IN</Eyebrow>
                </Row>

                <T w={700} s={36} lh={1.02} style={{ letterSpacing: -1.8, marginBottom: 26 }}>Welcome{'\n'}back.</T>

                <Field
                    label="EMAIL OR PHONE"
                    icon="mail-outline"
                    value={vm.authId}
                    onChangeText={vm.setAuthId}
                    placeholder="demo@gmail.com"
                    keyboardType="email-address"
                    style={{ marginBottom: 10 }}
                />

                <Field
                    label="PASSWORD"
                    icon="lock-closed-outline"
                    value={vm.authPw}
                    onChangeText={vm.setAuthPw}
                    placeholder="Your password"
                    secure
                    onSubmitEditing={vm.submitLogin}
                    returnKeyType="go"
                    style={{ marginBottom: 14 }}
                />

                {vm.hasAuthError ? (
                    <Row gap={8} align="flex-start" style={{ marginBottom: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: t.csoft }}>
                        <Glyph name="alert-circle" size={15} color={t.coral} />
                        <T w={500} s={12} lh={1.4} c={t.coral} style={{ flex: 1 }}>{vm.authError}</T>
                    </Row>
                ) : null}

                <Press
                    onPress={vm.submitLogin}
                    disabled={vm.authBusy}
                    style={{ width: '100%', borderRadius: 999, backgroundColor: t.lime, paddingVertical: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 8, opacity: vm.authBusy ? 0.7 : 1 }}
                >
                    <T w={700} s={15} c={t.on}>{vm.signInLabel}</T>
                    {!vm.authBusy ? <Glyph name="arrow-forward" size={17} color={t.on} /> : null}
                </Press>

                <Row gap={12} style={{ marginVertical: 18 }}>
                    <Divider style={{ flex: 1 }} />
                    <Eyebrow s={9} w={600} ls={0.1} c={t.fg3}>OR CONTINUE WITH</Eyebrow>
                    <Divider style={{ flex: 1 }} />
                </Row>

                <Row gap={8} align="stretch">
                    {vm.socials.map((so, i) => (
                        <Press
                            key={i}
                            onPress={so.go}
                            style={{ flex: 1, paddingVertical: 14, borderRadius: 16, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 7 }}
                        >
                            <Glyph name={so.icon} size={17} color={t.fg} />
                            <T w={600} s={11} c={t.fg}>{so.label}</T>
                        </Press>
                    ))}
                </Row>

                <Row justify="space-between" style={{ marginTop: 18 }}>
                    <Press onPress={vm.goForgot} hitSlop={8}>
                        <T w={500} s={13} c={t.fg2}>Forgot password?</T>
                    </Press>
                    <Press onPress={vm.goSignup}>
                        <T w={600} s={13} c={t.accent}>Create account</T>
                    </Press>
                </Row>
            </View>
        </ScrollView>
    );
}
