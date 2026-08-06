import React from 'react';
import { View, ScrollView } from 'react-native';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Press, Glyph } from '../ui';

export default function CreateAccountScreen() {
  const vm = useVm();
  const t = useT();

  const Field = ({ f, iconColor }) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        columnGap: 12,
        paddingVertical: 13,
        paddingHorizontal: 18,
        borderTopWidth: 1,
        borderTopColor: t.line
      }}
    >
      <Glyph name={f.icon} size={16} color={iconColor} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T mono w={600} s={9} ls={0.1} c={t.fg3}>{f.label}</T>
        <T w={500} s={14} lh={1.2} c={t.fg} style={{ marginTop: 6 }}>{f.value}</T>
      </View>
    </View>
  );

  return (
    <ScrollView
      contentContainerStyle={{ paddingTop: 24, paddingHorizontal: 22, paddingBottom: 28 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Back */}
      <Press
        onPress={vm.goRole}
        style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: t.line,
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Glyph name="chevron-back" size={19} color={t.fg} />
      </Press>

      <View style={{ marginTop: 22 }}>
        <T mono w={600} s={10} ls={0.14} c={t.violet2}>CREATE ACCOUNT</T>
        <T w={700} s={32} lh={1.04} c={t.fg} style={{ marginTop: 12, letterSpacing: -1.5 }}>
          A few details{'\n'}to get you in.
        </T>

        {/* Age card */}
        <View
          style={{
            borderRadius: 22,
            backgroundColor: t.ink2,
            borderWidth: 1,
            borderColor: t.line,
            paddingVertical: 16,
            paddingHorizontal: 18,
            marginTop: 22
          }}
        >
          <T mono w={600} s={10} ls={0.12} c={t.fg3} style={{ marginBottom: 12 }}>HOW OLD ARE YOU?</T>
          <View style={{ flexDirection: 'row', columnGap: 7 }}>
            {vm.ageOptions.map((ao, i) => (
              <Press
                key={i}
                onPress={ao.go}
                style={{
                  flex: 1,
                  paddingVertical: 13,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: t[ao.bd],
                  backgroundColor: t[ao.bg],
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <T mono w={600} s={10} ls={0.08} c={t[ao.fg]}>{ao.label}</T>
              </Press>
            ))}
          </View>
          <T w={400} s={12} lh={1.5} c={t.fg2} style={{ marginTop: 12 }}>{vm.signupNote}</T>
        </View>

        {/* Details card */}
        <View
          style={{
            borderRadius: 22,
            backgroundColor: t.ink2,
            borderWidth: 1,
            borderColor: t.line,
            overflow: 'hidden',
            marginTop: 8
          }}
        >
          <T mono w={600} s={10} ls={0.12} c={t.fg3} style={{ paddingTop: 16, paddingHorizontal: 18, paddingBottom: 10 }}>
            YOUR DETAILS
          </T>
          {vm.signupFields.map((sf, i) => (
            <Field key={i} f={sf} iconColor={t.fg3} />
          ))}
        </View>

        {/* Guardian card */}
        {vm.minor && (
          <View
            style={{
              borderRadius: 22,
              backgroundColor: t.asoft,
              borderWidth: 1,
              borderColor: t.line,
              overflow: 'hidden',
              marginTop: 8
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: 9, paddingTop: 16, paddingHorizontal: 18, paddingBottom: 10 }}>
              <Glyph name="shield-checkmark" size={16} color={t.amber} />
              <T mono w={600} s={10} ls={0.12} c={t.amber}>GUARDIAN REQUIRED</T>
            </View>
            {vm.guardianFields.map((gf, i) => (
              <Field key={i} f={gf} iconColor={t.amber} />
            ))}
          </View>
        )}

        {/* Submit */}
        <Press
          onPress={vm.submitSignup}
          style={{
            width: '100%',
            marginTop: 14,
            paddingVertical: 17,
            borderRadius: 999,
            backgroundColor: t.lime,
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <T w={700} s={15} lh={1} c={t.on}>{vm.signupCta}</T>
        </Press>

        <T mono w={600} s={9} lh={1.6} ls={0.06} c={t.fg3} style={{ textAlign: 'center', marginTop: 14 }}>
          BY CONTINUING YOU AGREE TO THE TERMS OF SERVICE
        </T>
      </View>
    </ScrollView>
  );
}
