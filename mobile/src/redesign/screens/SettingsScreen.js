import React from 'react';
import { View, ScrollView } from 'react-native';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Eyebrow, Row, Press, Glyph, Face } from '../ui';

export default function SettingsScreen() {
  const vm = useVm();
  const t = useT();
  const col = (v) => (v && (v[0] === '#' || v.startsWith('rgb')) ? v : t[v]);

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 22 }} showsVerticalScrollIndicator={false}>
      {/* Profile */}
      <Press
        onPress={vm.goProfile}
        style={{ width: '100%', borderRadius: 24, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, padding: 18, marginBottom: 8 }}
      >
        <Row gap={14}>
          <Face uri="https://randomuser.me/api/portraits/men/32.jpg" size={56} radius={18} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T w={600} s={17} lh={1.2} c={t.fg}>Demo Landlord</T>
            <Eyebrow s={10} ls={0.08} c={t.fg3} style={{ marginTop: 5 }}>DEMO@GMAIL.COM</Eyebrow>
          </View>
          <Glyph name="chevron-forward" size={18} color={t.fg3} />
        </Row>
      </Press>

      {/* Appearance */}
      <View style={{ borderRadius: 22, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, paddingVertical: 16, paddingHorizontal: 18, marginBottom: 8 }}>
        <Eyebrow s={10} ls={0.12} c={t.fg3} style={{ marginBottom: 13 }}>APPEARANCE</Eyebrow>
        <Row gap={7} align="stretch">
          {vm.themeModes.map((tm, i) => {
            const fg = col(tm.fg);
            return (
              <Press
                key={i}
                onPress={tm.go}
                style={{ flex: 1, paddingVertical: 13, paddingHorizontal: 8, borderRadius: 14, alignItems: 'center', rowGap: 9, borderWidth: 1, borderColor: col(tm.bd), backgroundColor: col(tm.bg) }}
              >
                <Glyph name={tm.icon} size={17} color={fg} />
                <T mono w={600} s={9} ls={0.08} c={fg}>{tm.label}</T>
              </Press>
            );
          })}
        </Row>
      </View>

      {/* UPI ID */}
      <View style={{ borderRadius: 20, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, padding: 16, marginBottom: 8 }}>
        <Eyebrow s={10} ls={0.1} c={t.fg3}>UPI ID</Eyebrow>
        <T w={600} s={14} c={t.fg} style={{ marginTop: 10 }}>demo@okhdfcbank</T>
      </View>

      {/* Settings rows */}
      <View style={{ borderRadius: 22, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, overflow: 'hidden', marginBottom: 8 }}>
        {vm.settingsRows.map((s, i) => (
          <Press key={i} onPress={s.go}>
          <Row gap={13} style={{ paddingVertical: 15, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: t.line }}>
            <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: t.vsoft, alignItems: 'center', justifyContent: 'center' }}>
              <Glyph name={s.icon} size={15} color={t.accent} />
            </View>
            <T w={500} s={14} lh={1.2} c={t.fg} style={{ flex: 1 }}>{s.label}</T>
            <T mono w={600} s={9} ls={0.06} c={t.fg3}>{s.meta}</T>
            <Glyph name="chevron-forward" size={15} color={t.fg3} />
          </Row>
          </Press>
        ))}
      </View>

      {/* Sign out */}
      <Press
        onPress={vm.askSignOut}
        style={{ width: '100%', paddingVertical: 15, borderRadius: 18, borderWidth: 1, borderColor: t.line, alignItems: 'center' }}
      >
        <T w={600} s={13} c={t.coral}>Sign out</T>
      </Press>

      <T mono w={600} s={9} lh={1.6} ls={0.08} c={t.fg3} style={{ textAlign: 'center', marginTop: 16 }}>
        TENANTPRO v2.0 · BUILD 240
      </T>
    </ScrollView>
  );
}
