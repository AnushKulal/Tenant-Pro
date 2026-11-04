// File: mobile/src/redesign/Header.js
//
// Region 2 of the three a phone screen has: the bar that sits directly below the
// system bars and above all content. See layout.js for the rule it follows and
// the flag that reverts it.
//
// It holds, left to right: a navigation slot (back, or the scope search), the
// screen's title once the body has scrolled past its own, and at most two action
// buttons. Two is the limit from the platform guidance and also the practical one
// — a third does not fit next to a title on a narrow phone without the title
// truncating to nothing.
//
// WHO GETS ONE
//
// Before the alignment rule: the landlord only. A tenant had no header, so the
// back chevron, the title and the bell were each re-drawn inside whichever tenant
// screen wanted them. The tenant side now gets the same region, with the bell it
// was already using moved into it.
//
// Four landlord screens still opt out (ledger, people, support, ticket): each
// draws its own search bar and title in its body, and giving them a second header
// above that would be two headers, not one. They satisfy the rule their own way.
// That is a real exception, not an oversight — it is listed here so the next
// person does not have to work out why those four look different.
import React from 'react';
import { View } from 'react-native';
import { useVm } from './AppContext';
import { useT } from './ThemeContext';
import { T, Row, Press, Glyph } from './ui';
import AlertBell from './AlertBell';
import { StickyTitle } from './layout';
import { isLayoutRule } from '../appConfig';

const BTN = { flexBasis: 36, flexGrow: 0, flexShrink: 0, width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' };

export default function Header() {
    const vm = useVm();
    const t = useT();

    const ownerHeader = !!vm.showHeader;
    // The tenant header only exists with the rule on; with the flag at 'v1' this
    // component behaves exactly as it did, which is to say the tenant has none.
    // Which tenant routes get one — and the three that own their own chrome — is
    // decided next to the landlord's equivalent in deriveVm, so the two cannot
    // drift apart.
    const tenantHeader = isLayoutRule() && !!vm.showTenantHeader && !ownerHeader;

    if (!ownerHeader && !tenantHeader) return null;

    const bar = { backgroundColor: t.ink, paddingTop: 12, paddingHorizontal: 18, paddingBottom: 10 };

    if (tenantHeader) {
        // A dock destination is somewhere you switch TO, not somewhere you came
        // from, so it gets no back chevron — the dock is how you leave it.
        // Anything else on the tenant side is a step inwards, and does.
        // `showTenantDock` is already exactly "this route is a dock destination",
        // so it answers this rather than a second list drifting out of step with
        // the first.
        const inward = !vm.showTenantDock;
        return (
            <Row gap={8} style={bar}>
                {inward && vm.canGoBack ? (
                    <Press
                        onPress={vm.goBack}
                        hitSlop={8}
                        style={{ ...BTN, borderWidth: 1, borderColor: t.line }}
                    >
                        <Glyph name="chevron-back" size={17} color={t.fg} />
                    </Press>
                ) : null}

                <StickyTitle />

                {/* The one action a tenant screen needs in the chrome. It used to
                    live inside the portal home screen's body, which meant it was
                    only reachable from that one screen and scrolled away even
                    there. */}
                <AlertBell
                    onPress={vm.openTAlerts}
                    has={vm.hasTAlerts}
                    urgent={vm.tBellUrgent}
                    count={vm.tBellCount}
                />
            </Row>
        );
    }

    return (
        <Row gap={8} style={bar}>
            {vm.showSearch && (
                <Press
                    onPress={vm.openSearch}
                    style={{
                        flex: 1,
                        minWidth: 0,
                        flexDirection: 'row',
                        alignItems: 'center',
                        columnGap: 9,
                        paddingVertical: 9,
                        paddingHorizontal: 14,
                        borderRadius: 999,
                        backgroundColor: t.ink2,
                        borderWidth: 1,
                        borderColor: t[vm.scopeBorder]
                    }}
                >
                    <Glyph name="search" size={15} color={t[vm.scopeIconFg]} />
                    <T w={500} s={12} lh={1} c={t[vm.scopeFg]} numberOfLines={1} style={{ flex: 1 }}>
                        {vm.scopeHint}
                    </T>
                </Press>
            )}

            {vm.showBack && (
                <>
                    <Press onPress={vm.goBack} style={{ ...BTN, borderWidth: 1, borderColor: t.line }}>
                        <Glyph name="chevron-back" size={17} color={t.fg} />
                    </Press>
                    <T
                        w={600}
                        s={16}
                        lh={1.1}
                        c={t.fg}
                        numberOfLines={1}
                        style={{ flex: 1, letterSpacing: -0.4 }}
                    >
                        {vm.backTitle}
                    </T>
                </>
            )}

            {/* No sticky title on this side, and that is a decision rather than
                an omission. A landlord's dock screen already spends the whole bar
                on the scope search, which is a flexing element: a title beside it
                leaves both too narrow to read. A landlord's inner screen already
                shows where it is, in `backTitle` above — in the same place and at
                the same size the sticky one would use. There is no screen here
                with room for it and a reason to want it. */}

            {vm.scoped && (
                <Press onPress={vm.clearScope} style={{ ...BTN, borderWidth: 1, borderColor: t.line }}>
                    <Glyph name="close" size={17} color={t.fg2} />
                </Press>
            )}

            {/* The bell used to open the account menu, making it a duplicate of
                tapping your own avatar. It now opens the alerts sheet, and its dot
                only appears when there is genuinely something to see.
                Drawing lives in AlertBell, shared with the tenant side. */}
            <AlertBell
                onPress={vm.openAlerts}
                has={vm.hasAlerts}
                urgent={vm.bellUrgent}
                count={vm.bellCount}
            />
        </Row>
    );
}
