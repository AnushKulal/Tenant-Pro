// File: mobile/src/redesign/AlertBell.js
//
// The notifications bell, drawn once and used by both sides.
//
// The owner's Header had this inline. Rather than copy it into the tenant screens —
// which is how two bells drift into looking and behaving differently — the drawing
// moved here and both callers pass the same four values. A change to how "unread"
// looks is then one edit, not a hunt.
//
// Props are deliberately plain rather than a vm object: this component is used by the
// owner shell and by two tenant screens whose view-models name these things
// differently (`bellCount` vs `tBellCount`), and passing the vm would mean the
// component knowing about both. It knows about neither.

import React from 'react';
import { View } from 'react-native';
import { useT } from './ThemeContext';
import { T, Press, Glyph } from './ui';

export default function AlertBell({ onPress, has, urgent, count, size = 36 }) {
    const t = useT();

    // What a screen reader says when it lands here. Without this the whole control
    // is "button" — the same announcement as every other icon in the header — and
    // the one thing it exists to communicate, that something is waiting, is the
    // part that never gets said out loud. The count goes in the name rather than
    // only in the badge for exactly that reason.
    //
    // The three states are the sheet's own three states, in the sheet's own
    // words, so what the bell says and what opening it says cannot disagree:
    //
    //   urgent  — something is unread or waiting on a decision   "3 waiting on you"
    //   has     — there are rows, but none of them are news      "nothing new"
    //   neither — the list is empty                              "all clear"
    //
    // The middle one matters. `has` means the LIST IS NOT EMPTY, which is not the
    // same as something having happened: rent falling due on Friday is a row
    // every day of the week. An earlier version of this name called that state
    // "something new" and would have told a screen-reader user there was news
    // every time they passed the header, for a week, about a date that had not
    // moved.
    const name = urgent && count
        ? `Notifications, ${count} waiting on you`
        : has ? 'Notifications, nothing new' : 'Notifications, all clear';

    return (
        <Press
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={name}
            style={{
                flexBasis: size, flexGrow: 0, flexShrink: 0,
                width: size, height: size, borderRadius: 12,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: t.line
            }}
        >
            {/* Filled when there is something, outline when there is not — the shape
                carries the state as well as the badge does, which matters to anybody
                who cannot pick a small red dot out of a dark corner. */}
            <Glyph name={has ? 'notifications' : 'notifications-outline'} size={18} color={has ? t.fg : t.fg2} />

            {/* A COUNT when something is unread — "how many things happened since I
                last looked" is answerable without opening anything — and nothing at
                all when the list is merely non-empty. Rent being due on Friday belongs
                in the sheet; it does not deserve a badge every morning until Friday. */}
            {urgent && count ? (
                <View
                    style={{
                        position: 'absolute', top: 3, right: 2,
                        minWidth: 16, height: 16, paddingHorizontal: 4, borderRadius: 8,
                        backgroundColor: t.lime,
                        // Cut out of the surface behind it so the badge reads as sitting
                        // on top rather than merging with the bell's own border.
                        borderWidth: 1.5, borderColor: t.ink,
                        alignItems: 'center', justifyContent: 'center'
                    }}
                >
                    <T mono w={700} s={8} lh={1} c={t.on}>{count}</T>
                </View>
            ) : has ? (
                <View
                    style={{
                        position: 'absolute', top: 8, right: 9,
                        width: 7, height: 7, borderRadius: 4,
                        backgroundColor: t.coral,
                        borderWidth: 1.5, borderColor: t.ink
                    }}
                />
            ) : null}
        </Press>
    );
}
