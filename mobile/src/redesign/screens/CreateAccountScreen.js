import React, { useState } from 'react';
import { View, TextInput } from 'react-native';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Press, Glyph } from '../ui';
import { KeyboardScroll } from '../keyboard';
import { grotesk } from '../theme';

// One row of the details card. These are hairline-separated rows inside a single
// bordered card, so a ring around each field would fight the card's own border —
// instead the row itself answers "am I typing in this one": a left accent rail, a
// tinted fill, and the label and glyph in the accent colour. Focus has to be
// visible SOMEHOW: with nothing changing on tap, the row reads as a printed label
// rather than something you can type into.
//
// The state lives here rather than in the screen because a `focused` field in the
// screen's own state would remount every row on each keystroke.
function FieldRow({ t, icon, label, children, tint, trailing }) {
  const [focused, setFocused] = React.useState(false);
  const lit = tint || t.accent;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        columnGap: 12,
        paddingVertical: 13,
        paddingHorizontal: 18,
        borderTopWidth: 1,
        borderTopColor: t.line,
        backgroundColor: focused ? t.ink3 : 'transparent'
      }}
    >
      {focused ? (
        <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: lit }} />
      ) : null}
      <Glyph name={icon} size={16} color={focused ? lit : t.fg3} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T mono w={600} s={9} ls={0.1} c={focused ? lit : t.fg3}>{label}</T>
        {/* Children are TextInputs; the focus handlers are injected so no call
            site has to remember to wire them. */}
        {React.Children.map(children, (child) => (
          React.isValidElement(child)
            ? React.cloneElement(child, {
              onFocus: () => setFocused(true),
              onBlur: () => setFocused(false)
            })
            : child
        ))}
      </View>
      {trailing || null}
    </View>
  );
}

export default function CreateAccountScreen() {
  const vm = useVm();
  const t = useT();
  const [show, setShow] = useState(false);

  const inputStyle = { padding: 0, marginTop: 6, fontFamily: grotesk(500), fontSize: 14, color: t.fg };

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
    <KeyboardScroll
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

          <FieldRow t={t} icon="person-outline" label="FULL NAME">
            <TextInput
              value={vm.authName}
              onChangeText={vm.setAuthName}
              placeholder="Your full name"
              placeholderTextColor={t.fg3}
              autoCapitalize="words"
              autoCorrect={false}
              style={inputStyle}
            />
          </FieldRow>

          <FieldRow t={t} icon="mail-outline" label="EMAIL">
            <TextInput
              value={vm.authId}
              onChangeText={vm.setAuthId}
              placeholder="you@gmail.com"
              placeholderTextColor={t.fg3}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={inputStyle}
            />
          </FieldRow>

          <FieldRow t={t} icon="call-outline" label="MOBILE">
            <TextInput
              value={vm.authPhone}
              onChangeText={vm.setAuthPhone}
              placeholder="+91 00000 00000"
              placeholderTextColor={t.fg3}
              keyboardType="phone-pad"
              autoCorrect={false}
              style={inputStyle}
            />
          </FieldRow>

          <FieldRow
            t={t}
            icon="lock-closed-outline"
            label="PASSWORD"
            trailing={(
              <Press onPress={() => setShow((v) => !v)} hitSlop={10}>
                <Glyph name={show ? 'eye-off-outline' : 'eye-outline'} size={18} color={t.fg3} />
              </Press>
            )}
          >
            <TextInput
              value={vm.authPw}
              onChangeText={vm.setAuthPw}
              placeholder="Create a password"
              placeholderTextColor={t.fg3}
              secureTextEntry={!show}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={vm.submitSignup}
              returnKeyType="go"
              style={inputStyle}
            />
          </FieldRow>
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

        {/* Error */}
        {vm.hasAuthError ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              columnGap: 8,
              marginTop: 12,
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 12,
              backgroundColor: t.csoft
            }}
          >
            <Glyph name="alert-circle" size={15} color={t.coral} />
            <T w={500} s={12} lh={1.4} c={t.coral} style={{ flex: 1 }}>{vm.authError}</T>
          </View>
        ) : null}

        {/* Submit */}
        <Press
          onPress={vm.submitSignup}
          disabled={vm.authBusy}
          style={{
            width: '100%',
            marginTop: 14,
            paddingVertical: 17,
            borderRadius: 999,
            backgroundColor: t.lime,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: vm.authBusy ? 0.7 : 1
          }}
        >
          <T w={700} s={15} lh={1} c={t.on}>{vm.authBusy ? 'Creating account…' : vm.signupCta}</T>
        </Press>

        <T mono w={600} s={9} lh={1.6} ls={0.06} c={t.fg3} style={{ textAlign: 'center', marginTop: 14 }}>
          BY CONTINUING YOU AGREE TO THE TERMS OF SERVICE
        </T>
      </View>
    </KeyboardScroll>
  );
}
