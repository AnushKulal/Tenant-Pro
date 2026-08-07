import React from 'react';
import { View, ScrollView } from 'react-native';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Eyebrow, Press, Glyph, Wordmark } from '../ui';

export default function RoleScreen() {
    const vm = useVm();
    const t = useT();
    return (
        <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingVertical: 32, paddingHorizontal: 22 }}
            showsVerticalScrollIndicator={false}
        >
            <Wordmark mono={38} s={20} style={{ marginBottom: 6 }} />

            <T w={700} s={40} lh={1.02} style={{ letterSpacing: -2, marginTop: 26, marginBottom: 8 }}>Two doors.{'\n'}One building.</T>
            <T w={400} s={14} lh={1.5} c={t.fg2} style={{ marginBottom: 30 }}>Pick the side you're on.</T>

            <Press
                onPress={vm.goLogin}
                style={{ width: '100%', borderRadius: 22, backgroundColor: t.lime, padding: 20, marginBottom: 12, overflow: 'hidden' }}
            >
                <T mono w={600} s={9} ls={0.14} c={t.on} style={{ opacity: 0.6 }}>01 — OWNER</T>
                <T w={700} s={26} lh={1.05} c={t.on} style={{ letterSpacing: -1, marginTop: 14 }}>I'm a Landlord</T>
                <T w={400} s={13} lh={1.45} c={t.on} style={{ opacity: 0.72, marginTop: 6, maxWidth: 240 }}>Properties, rooms, tenants and rent — all in one ledger.</T>
                <View style={{ position: 'absolute', right: 18, bottom: 18, width: 38, height: 38, borderRadius: 19, backgroundColor: t.on, alignItems: 'center', justifyContent: 'center' }}>
                    <Glyph name="arrow-forward" size={19} color={t.lime} />
                </View>
            </Press>

            <Press
                onPress={vm.goTenantLogin}
                style={{ width: '100%', borderRadius: 22, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, padding: 20, overflow: 'hidden' }}
            >
                <T mono w={600} s={9} ls={0.14} c={t.accent}>02 — TENANT</T>
                <T w={700} s={26} lh={1.05} c={t.fg} style={{ letterSpacing: -1, marginTop: 14 }}>I'm a Tenant</T>
                <T w={400} s={13} lh={1.45} c={t.fg2} style={{ marginTop: 6, maxWidth: 240 }}>See your dues, pay rent, raise a request.</T>
                <View style={{ position: 'absolute', right: 18, bottom: 18, width: 38, height: 38, borderRadius: 19, backgroundColor: t.vsoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Glyph name="arrow-forward" size={19} color={t.accent} />
                </View>
            </Press>

            <Eyebrow s={9} ls={0.1} c={t.fg3} style={{ lineHeight: 14, textAlign: 'center', marginTop: 26 }}>SWITCH ANY TIME BY SIGNING OUT</Eyebrow>
        </ScrollView>
    );
}
