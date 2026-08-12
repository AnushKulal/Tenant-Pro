import React from 'react';
import { View, ScrollView } from 'react-native';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Eyebrow, Row, Press, Glyph, Face, Avatar } from '../ui';

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
          <Avatar uri={vm.ownerImg} name={vm.ownerName} size={56} radius={18} />
          <View style={{ flex: 1, minWidth: 0 }}>
            {/* Was hard-coded to the demo landlord, so every real customer saw
                "Demo Landlord" here — and a demo profile edit, which now persists,
                would never show. */}
            <T w={600} s={17} lh={1.2} c={t.fg} numberOfLines={1}>{vm.ownerName || 'Your account'}</T>
            <Eyebrow s={10} ls={0.08} c={t.fg3} style={{ marginTop: 5 }} numberOfLines={1}>
              {(vm.ownerEmail || '').toUpperCase()}
            </Eyebrow>
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
        <T w={600} s={14} c={vm.upiCard.isSet ? t.fg : t.fg3} style={{ marginTop: 10 }}>{vm.upiCard.value}</T>
        <T w={400} s={12} lh={1.45} c={t.fg3} style={{ marginTop: 6 }}>{vm.upiCard.hint}</T>
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

      {/* Demo account — rendered only when the SERVER says this is the demo, so a
          real landlord is never shown a control that deletes their data. */}
      {vm.isDemoAccount && (
        <View style={{ borderRadius: 22, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, padding: 18, marginBottom: 8 }}>
          <Row gap={10} style={{ marginBottom: 12 }}>
            <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: t.asoft, alignItems: 'center', justifyContent: 'center' }}>
              <Glyph name="flask-outline" size={15} color={t.amber} />
            </View>
            <Eyebrow s={10} ls={0.12} c={t.fg3} style={{ flex: 1 }}>DEMO ACCOUNT</Eyebrow>
            <T mono w={600} s={9} ls={0.06} c={vm.demoCard.stale ? t.amber : t.fg3}>
              {vm.demoCard.lastReset.toUpperCase()}
            </T>
          </Row>

          <T w={600} s={14} lh={1.2} c={t.fg} numberOfLines={1}>{vm.demoCard.line}</T>
          <T w={400} s={12} lh={1.5} c={t.fg3} style={{ marginTop: 7 }}>{vm.demoCard.note}</T>

          <Press
            onPress={vm.demoCard.busy ? undefined : vm.demoCard.ask}
            disabled={vm.demoCard.busy}
            style={{ width: '100%', marginTop: 14, paddingVertical: 13, borderRadius: 999, borderWidth: 1, borderColor: vm.demoCard.busy ? t.line : t.amber, backgroundColor: vm.demoCard.busy ? t.ink3 : t.asoft, alignItems: 'center' }}
          >
            <T w={700} s={13} lh={1} c={vm.demoCard.busy ? t.fg3 : t.amber}>{vm.demoCard.label}</T>
          </Press>
        </View>
      )}

      {/* Sign out */}
      <Press
        onPress={vm.askSignOut}
        style={{ width: '100%', paddingVertical: 15, borderRadius: 18, borderWidth: 1, borderColor: t.line, alignItems: 'center' }}
      >
        <T w={600} s={13} c={t.coral}>Sign out</T>
      </Press>

      {/* The real version, not a number typed into the markup.
          This said "TENANTPRO v2.0 · BUILD 240" — invented in the prototype and never
          replaced. It was worse than showing nothing: it looked like a version, so
          nobody thought to doubt it, and an install stuck on runtimeVersion "1.0.0"
          went undiagnosed for days while every update published successfully to
          "1.3.0" and silently reached nobody. The runtime version is the number that
          makes that visible in two seconds. */}
      <View style={{ marginTop: 16, alignItems: 'center', rowGap: 4 }}>
        <T mono w={600} s={9} lh={1.5} ls={0.08} c={t.fg3} style={{ textAlign: 'center' }}>
          TENANTPRO · {vm.build.versionLine.toUpperCase()}
        </T>
        <T mono w={600} s={8.5} lh={1.5} ls={0.06} c={t.fg3} style={{ textAlign: 'center' }}>
          {vm.build.bundleLine.toUpperCase()}{vm.build.hasUpdate ? ` · ${vm.build.updateShort.toUpperCase()}` : ''}
        </T>
      </View>
    </ScrollView>
  );
}
