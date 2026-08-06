import React from 'react';
import { View, ScrollView } from 'react-native';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Eyebrow, Row, Press, Glyph, Monogram, Divider } from '../ui';

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

                <T w={700} s={36} lh={1.02} style={{ letterSpacing: -1.8, marginBottom: 28 }}>Welcome{'\n'}back, Demo.</T>

                <View style={{ borderRadius: 18, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 10 }}>
                    <Eyebrow s={9} w={600} ls={0.12} c={t.fg3} style={{ marginBottom: 7 }}>EMAIL</Eyebrow>
                    <Row gap={10}>
                        <Glyph name="mail-outline" size={17} color={t.fg2} />
                        <T w={500} s={15}>demo@gmail.com</T>
                    </Row>
                </View>

                <View style={{ borderRadius: 18, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.accent, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 18 }}>
                    <Eyebrow s={9} w={600} ls={0.12} c={t.accent} style={{ marginBottom: 7 }}>PASSWORD</Eyebrow>
                    <Row gap={10}>
                        <Glyph name="lock-closed-outline" size={17} color={t.fg2} />
                        <T w={500} s={15} style={{ letterSpacing: 2 }}>••••••••••</T>
                        <View style={{ flex: 1 }} />
                        <Glyph name="eye-outline" size={18} color={t.fg3} />
                    </Row>
                </View>

                <Press
                    onPress={vm.goHome}
                    style={{ width: '100%', borderRadius: 999, backgroundColor: t.lime, paddingVertical: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 8 }}
                >
                    <T w={700} s={15} c={t.on}>Sign in</T>
                    <Glyph name="arrow-forward" size={17} color={t.on} />
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
                    <T w={400} s={13} c={t.fg2}>Forgot password?</T>
                    <Press onPress={vm.goSignup}>
                        <T w={600} s={13} c={t.accent}>Create account</T>
                    </Press>
                </Row>
            </View>
        </ScrollView>
    );
}
