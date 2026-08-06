// File: mobile/src/redesign/Sheets.js
// The bottom-sheet overlay layer. A single absolutely-positioned scrim + sheet
// that RedesignRoot stacks above every screen. Which sheet body renders is chosen
// by whichever overlay flag on the vm is true. Translated from Sheets.html.
import React from 'react';
import { View, ScrollView, Image, TextInput } from 'react-native';
import { useVm } from './AppContext';
import { useT } from './ThemeContext';
import { grotesk } from './theme';
import { T, Eyebrow, Row, Press, Glyph } from './ui';

export default function Sheets() {
    const vm = useVm();
    const t = useT();

    if (!vm.overlayOpen) return null;

    // Resolve a vm colour value: literal (#/rgb) passthrough, else a token key.
    const col = (v) => (v && (v[0] === '#' || v.startsWith('rgb')) ? v : t[v]);
    const who = vm.who || {};

    // Shared grabber handle at the top of every sheet.
    const Handle = () => (
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: t.line2, alignSelf: 'center', marginBottom: 16 }} />
    );

    return (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end', zIndex: 60 }}>
            <Press
                onPress={vm.closeOverlay}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(4,4,6,0.6)' }}
            />

            <ScrollView
                style={{
                    maxHeight: '85%',
                    backgroundColor: t.ink2,
                    borderTopLeftRadius: 28,
                    borderTopRightRadius: 28,
                    borderTopWidth: 1,
                    borderColor: t.line2
                }}
                contentContainerStyle={{ paddingTop: 10, paddingHorizontal: 18, paddingBottom: 26 }}
                showsVerticalScrollIndicator={false}
            >
                <Handle />

                {/* ── Search ──────────────────────────────────────────── */}
                {vm.isSearch && (
                    <View>
                        <Row
                            style={{
                                gap: 10,
                                paddingVertical: 13,
                                paddingHorizontal: 15,
                                borderRadius: 16,
                                backgroundColor: t.ink3,
                                borderWidth: 1,
                                borderColor: t.accent,
                                marginBottom: 6
                            }}
                        >
                            <Glyph name="search" size={17} color={t.accent} />
                            <TextInput
                                value={vm.q}
                                onChangeText={vm.setQ}
                                placeholder="Property, unit or tenant"
                                placeholderTextColor={t.fg3}
                                autoFocus
                                style={{ flex: 1, minWidth: 0, padding: 0, fontFamily: grotesk(500), fontSize: 14, color: t.fg }}
                            />
                            {vm.hasQ && (
                                <Press onPress={vm.clearQ} hitSlop={8}>
                                    <Glyph name="close-circle" size={18} color={t.fg3} />
                                </Press>
                            )}
                        </Row>

                        {vm.noResults && (
                            <View style={{ paddingVertical: 34, alignItems: 'center' }}>
                                <T w={500} s={14} lh={1.4} c={t.fg2}>{`Nothing matches "${vm.q}"`}</T>
                                <Eyebrow s={10} ls={0.08} style={{ marginTop: 8, textAlign: 'center' }}>TRY A UNIT NUMBER OR A LOCALITY</Eyebrow>
                            </View>
                        )}

                        {(vm.searchGroups || []).map((grp, gi) => (
                            <View key={gi} style={{ marginTop: 14 }}>
                                <Eyebrow s={10} ls={0.12} style={{ marginBottom: 10 }}>{grp.title}</Eyebrow>
                                {(grp.rows || []).map((r, ri) => (
                                    <Press
                                        key={ri}
                                        onPress={r.go}
                                        style={{
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            gap: 12,
                                            width: '100%',
                                            paddingVertical: 11,
                                            paddingHorizontal: 12,
                                            borderRadius: 16,
                                            borderWidth: 1,
                                            borderColor: col(r.border),
                                            backgroundColor: col(r.bg),
                                            marginBottom: 7
                                        }}
                                    >
                                        <View style={{ width: 40, height: 40, borderRadius: 13, overflow: 'hidden', backgroundColor: t.vsoft, alignItems: 'center', justifyContent: 'center' }}>
                                            <Glyph name={r.icon} size={18} color={t.accent} />
                                        </View>
                                        <View style={{ flex: 1, minWidth: 0 }}>
                                            <T w={600} s={14} lh={1.2} c={t.fg}>{r.name}</T>
                                            <Eyebrow s={10} ls={0.08} style={{ marginTop: 4 }}>{r.sub}</Eyebrow>
                                        </View>
                                        <Glyph name={r.check} size={19} color={col(r.checkFg)} />
                                    </Press>
                                ))}
                            </View>
                        ))}
                    </View>
                )}

                {/* ── All tickets ─────────────────────────────────────── */}
                {vm.isTickets && (
                    <View>
                        <T w={700} s={20} lh={1} style={{ letterSpacing: -0.8 }}>All tickets</T>
                        <Eyebrow s={10} ls={0.08} style={{ marginTop: 7, marginBottom: 16 }}>{`SORTED BY PRIORITY · ${vm.ticketTotal || ''}`}</Eyebrow>
                        <View style={{ gap: 8 }}>
                            {(vm.allTickets || []).map((at, i) => (
                                <View key={i} style={{ borderRadius: 20, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, padding: 14, position: 'relative', overflow: 'hidden' }}>
                                    <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: col(at.fg) }} />
                                    <Row align="flex-start" style={{ gap: 11 }}>
                                        <Image source={{ uri: at.img }} style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: t.ink3 }} resizeMode="cover" />
                                        <View style={{ flex: 1, minWidth: 0 }}>
                                            <T w={600} s={14} lh={1.25} c={t.fg}>{at.title}</T>
                                            <Eyebrow s={10} ls={0.06} numberOfLines={1} style={{ marginTop: 5 }}>{at.meta}</Eyebrow>
                                        </View>
                                        <View style={{ paddingVertical: 4, paddingHorizontal: 8, borderRadius: 7, backgroundColor: col(at.bg) }}>
                                            <T mono w={600} s={10} lh={1.3} ls={0.05} c={col(at.fg)}>{at.priority}</T>
                                        </View>
                                    </Row>
                                    <Row style={{ gap: 6, marginTop: 12 }}>
                                        <T mono w={600} s={9} lh={1} ls={0.08} c={col(at.statusFg)} style={{ flex: 1 }}>{at.status}</T>
                                        <Press onPress={at.read} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 11, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }}>
                                            <T w={600} s={11} lh={1} c={t.fg}>Read</T>
                                        </Press>
                                        {at.started && (
                                            <Press onPress={at.resolve} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 11, backgroundColor: t.lime }}>
                                                <T w={600} s={11} lh={1} c={t.on}>Resolve</T>
                                            </Press>
                                        )}
                                        {at.notStarted && (
                                            <Press onPress={at.start} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 11, backgroundColor: t.lime }}>
                                                <T w={600} s={11} lh={1} c={t.on}>Open</T>
                                            </Press>
                                        )}
                                    </Row>
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {/* ── Ticket detail ───────────────────────────────────── */}
                {vm.isTicket && vm.ticket && (
                    <View>
                        <Row align="flex-start" style={{ gap: 10, marginBottom: 14 }}>
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <T w={700} s={20} lh={1.15} style={{ letterSpacing: -0.7 }}>{vm.ticket.title}</T>
                                <Eyebrow s={10} ls={0.06} style={{ marginTop: 8 }}>{vm.ticket.meta}</Eyebrow>
                            </View>
                            <View style={{ paddingVertical: 5, paddingHorizontal: 9, borderRadius: 8, backgroundColor: col(vm.ticket.bg) }}>
                                <T mono w={600} s={10} lh={1.3} ls={0.05} c={col(vm.ticket.fg)}>{vm.ticket.priority}</T>
                            </View>
                        </Row>

                        <Row style={{ gap: 11, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, marginBottom: 10 }}>
                            <Image source={{ uri: vm.ticket.img }} style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: t.ink2 }} resizeMode="cover" />
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <T w={600} s={14} lh={1.2} c={t.fg}>{vm.ticket.who}</T>
                                <T mono w={600} s={9} lh={1.4} ls={0.08} c={col(vm.ticket.statusFg)} style={{ marginTop: 4 }}>{vm.ticket.status}</T>
                            </View>
                            <Press onPress={vm.ticket.call} style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: t.lsoft, alignItems: 'center', justifyContent: 'center' }}>
                                <Glyph name="call" size={16} color={t.pos} />
                            </Press>
                        </Row>

                        <View style={{ borderRadius: 16, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 10 }}>
                            <Eyebrow s={9} ls={0.12} style={{ marginBottom: 10 }}>DESCRIPTION</Eyebrow>
                            <T w={400} s={14} lh={1.55} c={t.fg2}>{vm.ticket.body}</T>
                        </View>

                        {vm.ticket.hasPhotos && (
                            <View style={{ marginBottom: 14 }}>
                                <Eyebrow s={9} ls={0.12} style={{ marginBottom: 10 }}>{vm.ticket.photoCount}</Eyebrow>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 18, paddingBottom: 2 }} style={{ marginHorizontal: -18 }}>
                                    {(vm.ticket.photos || []).map((ph, i) => (
                                        <Image key={i} source={{ uri: ph }} style={{ width: 168, height: 126, borderRadius: 14, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }} resizeMode="cover" />
                                    ))}
                                </ScrollView>
                            </View>
                        )}

                        <Row style={{ gap: 7 }}>
                            {vm.ticket.started && (
                                <Press onPress={vm.ticket.resolve} style={{ flex: 1, paddingVertical: 15, borderRadius: 999, backgroundColor: t.lime, alignItems: 'center' }}>
                                    <T w={700} s={14} lh={1} c={t.on}>Mark resolved</T>
                                </Press>
                            )}
                            {vm.ticket.notStarted && (
                                <>
                                    <Press onPress={vm.ticket.start} style={{ flex: 1, paddingVertical: 15, borderRadius: 999, backgroundColor: t.lime, alignItems: 'center' }}>
                                        <T w={700} s={14} lh={1} c={t.on}>Open ticket</T>
                                    </Press>
                                    <Press onPress={vm.ticket.resolve} style={{ paddingVertical: 15, paddingHorizontal: 18, borderRadius: 999, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }}>
                                        <T w={600} s={13} lh={1} c={t.fg2}>Resolve</T>
                                    </Press>
                                </>
                            )}
                        </Row>
                    </View>
                )}

                {/* ── Edit rent ───────────────────────────────────────── */}
                {vm.isRent && (
                    <View>
                        <T w={700} s={20} lh={1} style={{ letterSpacing: -0.8 }}>Edit rent</T>
                        <Eyebrow s={10} ls={0.08} style={{ marginTop: 7, marginBottom: 16 }}>{`${who.name || ''} · ${who.unitLine || ''}`}</Eyebrow>
                        <Row style={{ gap: 12, borderRadius: 20, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, padding: 16 }}>
                            <Press onPress={vm.rentDown} style={{ width: 44, height: 44, borderRadius: 15, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}>
                                <Glyph name="remove" size={20} color={t.fg} />
                            </Press>
                            <View style={{ flex: 1, alignItems: 'center' }}>
                                <T w={700} s={32} lh={1} c={t.fg} style={{ letterSpacing: -1.4 }}>{vm.rentDraft}</T>
                                <T mono w={600} s={9} lh={1} ls={0.08} c={col(vm.rentDeltaFg)} style={{ marginTop: 8 }}>{vm.rentDelta}</T>
                            </View>
                            <Press onPress={vm.rentUp} style={{ width: 44, height: 44, borderRadius: 15, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}>
                                <Glyph name="add" size={20} color={t.fg} />
                            </Press>
                        </Row>
                        <Row style={{ gap: 7, marginTop: 12, marginBottom: 16 }}>
                            {(vm.rentSteps || []).map((rs, i) => (
                                <Press key={i} onPress={rs.go} style={{ flex: 1, paddingVertical: 11, borderRadius: 13, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, alignItems: 'center' }}>
                                    <T w={600} s={11} lh={1} c={t.fg2}>{rs.label}</T>
                                </Press>
                            ))}
                        </Row>
                        <Press onPress={vm.saveRent} style={{ width: '100%', paddingVertical: 16, borderRadius: 999, backgroundColor: t.lime, alignItems: 'center' }}>
                            <T w={700} s={14} lh={1} c={t.on}>{`Save ${vm.rentDraft || ''}`}</T>
                        </Press>
                        <Eyebrow s={9} ls={0.06} style={{ marginTop: 13, textAlign: 'center' }}>APPLIES FROM THE NEXT BILLING CYCLE</Eyebrow>
                    </View>
                )}

                {/* ── Unit sheet ──────────────────────────────────────── */}
                {vm.isUnit && vm.unitSheet && (
                    <View>
                        <Row align="flex-start" style={{ gap: 13, marginBottom: 16 }}>
                            <View style={{ width: 54, height: 54, borderRadius: 17, backgroundColor: t.ink3, alignItems: 'center', justifyContent: 'center' }}>
                                <T w={700} s={21} lh={1} c={t.fg}>{vm.unitSheet.no}</T>
                            </View>
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <T w={700} s={20} lh={1.1} style={{ letterSpacing: -0.8 }}>{vm.unitSheet.prop}</T>
                                <Eyebrow s={10} ls={0.06} style={{ marginTop: 6 }}>{vm.unitSheet.type}</Eyebrow>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                <T w={700} s={16} lh={1} c={t.fg}>{vm.unitSheet.rent}</T>
                                <Eyebrow s={9} ls={0.06} style={{ marginTop: 5 }}>{vm.unitSheet.share}</Eyebrow>
                            </View>
                        </Row>

                        <Row style={{ gap: 9, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, marginBottom: 14 }}>
                            <Glyph name="bed-outline" size={16} color={t.fg2} />
                            <T w={500} s={13} lh={1.2} c={t.fg2} style={{ flex: 1 }}>{vm.unitSheet.beds}</T>
                            <T mono w={600} s={10} lh={1} ls={0.06} c={col(vm.unitSheet.bedFg)}>{vm.unitSheet.freeLine}</T>
                        </Row>

                        <Eyebrow s={10} ls={0.12} style={{ marginBottom: 10 }}>WHO LIVES HERE</Eyebrow>
                        {(vm.unitSheet.occupants || []).map((oc, i) => (
                            <Press key={i} onPress={oc.open} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%', paddingVertical: 12, paddingHorizontal: 13, borderRadius: 17, borderWidth: 1, borderColor: t.line, backgroundColor: t.ink3, marginBottom: 7 }}>
                                <Image source={{ uri: oc.img }} style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: t.ink2 }} resizeMode="cover" />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <T w={600} s={14} lh={1.2} c={t.fg}>{oc.name}</T>
                                    <T mono w={600} s={10} lh={1.4} ls={0.06} c={col(oc.fg)} style={{ marginTop: 4 }}>{oc.sub}</T>
                                </View>
                                <T w={700} s={14} lh={1} c={t.fg}>{oc.rent}</T>
                            </Press>
                        ))}

                        {vm.unitSheet.hasFree && (
                            <Row style={{ gap: 7, marginTop: 12 }}>
                                <Press onPress={vm.unitSheet.addExisting} style={{ flex: 2, paddingVertical: 15, borderRadius: 999, backgroundColor: t.lime, alignItems: 'center' }}>
                                    <T w={700} s={13} lh={1} c={t.on}>Add a tenant</T>
                                </Press>
                                <Press onPress={vm.unitSheet.addNew} style={{ flex: 1, paddingVertical: 15, borderRadius: 999, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, alignItems: 'center' }}>
                                    <T w={600} s={12} lh={1} c={t.fg2}>Add new</T>
                                </Press>
                            </Row>
                        )}
                    </View>
                )}

                {/* ── Assign sheet ────────────────────────────────────── */}
                {vm.isAssign && (
                    <View>
                        <Row style={{ gap: 11, marginBottom: 6 }}>
                            <Press onPress={vm.assignBack} style={{ width: 34, height: 34, borderRadius: 12, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}>
                                <Glyph name="chevron-back" size={16} color={t.fg} />
                            </Press>
                            <T w={700} s={20} lh={1} style={{ flex: 1, letterSpacing: -0.8 }}>{`Add to Unit ${vm.unitSheet ? vm.unitSheet.no : ''}`}</T>
                        </Row>
                        <Eyebrow s={10} ls={0.08} style={{ marginTop: 7, marginBottom: 16 }}>PICK SOMEONE UNASSIGNED, OR ADD A NEW TENANT</Eyebrow>
                        {vm.assignEmpty && (
                            <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                                <T w={500} s={13} lh={1.5} c={t.fg2}>Nobody is unassigned right now.</T>
                            </View>
                        )}
                        {(vm.assignList || []).map((al, i) => (
                            <Press key={i} onPress={al.go} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%', paddingVertical: 12, paddingHorizontal: 13, borderRadius: 17, borderWidth: 1, borderColor: t.line, backgroundColor: t.ink3, marginBottom: 7 }}>
                                <Image source={{ uri: al.img }} style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: t.ink2 }} resizeMode="cover" />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <T w={600} s={14} lh={1.2} c={t.fg}>{al.name}</T>
                                    <Eyebrow s={10} ls={0.06} style={{ marginTop: 4 }}>{al.sub}</Eyebrow>
                                </View>
                                <Glyph name="add-circle" size={20} color={t.accent} />
                            </Press>
                        ))}
                        {vm.unitSheet && (
                            <Press onPress={vm.unitSheet.addNew} style={{ width: '100%', marginTop: 8, paddingVertical: 15, borderRadius: 999, backgroundColor: t.lime, alignItems: 'center' }}>
                                <T w={700} s={13} lh={1} c={t.on}>Add a new tenant instead</T>
                            </Press>
                        )}
                    </View>
                )}

                {/* ── Sign out ────────────────────────────────────────── */}
                {vm.isSignOut && (
                    <View>
                        <Row align="flex-start" style={{ gap: 12, marginBottom: 18 }}>
                            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: t.csoft, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                                <Glyph name="log-out-outline" size={20} color={t.coral} />
                            </View>
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <T w={700} s={20} lh={1.1} style={{ letterSpacing: -0.7 }}>Sign out?</T>
                                <T w={400} s={13} lh={1.5} c={t.fg2} style={{ marginTop: 7 }}>You will need your email and password to get back in.</T>
                            </View>
                            <Press onPress={vm.closeOverlay} style={{ width: 34, height: 34, borderRadius: 12, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}>
                                <Glyph name="close" size={17} color={t.fg2} />
                            </Press>
                        </Row>
                        <Row style={{ gap: 8 }}>
                            <Press onPress={vm.closeOverlay} style={{ flex: 1, paddingVertical: 15, borderRadius: 999, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, alignItems: 'center' }}>
                                <T w={600} s={14} lh={1} c={t.fg}>No, stay</T>
                            </Press>
                            <Press onPress={vm.confirmSignOut} style={{ flex: 1, paddingVertical: 15, borderRadius: 999, backgroundColor: t.coral, alignItems: 'center' }}>
                                <T w={700} s={14} lh={1} c="#fff">Yes, sign out</T>
                            </Press>
                        </Row>
                    </View>
                )}

                {/* ── Invite ──────────────────────────────────────────── */}
                {vm.isInvite && vm.invite && (
                    <View>
                        <T w={700} s={20} lh={1} style={{ letterSpacing: -0.8 }}>Invite a tenant</T>
                        <Eyebrow s={10} ls={0.08} style={{ marginTop: 7, marginBottom: 14 }}>THEY SCAN, PICK A ROOM, YOU APPROVE</Eyebrow>

                        <Row style={{ gap: 7, marginBottom: 14 }}>
                            {(vm.invite.options || []).map((io, i) => (
                                <Press key={i} onPress={io.go} style={{ flex: 1, paddingVertical: 11, borderRadius: 13, alignItems: 'center', borderWidth: 1, borderColor: col(io.bd), backgroundColor: col(io.bg) }}>
                                    <T w={600} s={12} lh={1.2} c={col(io.fg)}>{io.name}</T>
                                    <T mono w={600} s={9} lh={1} ls={0.06} c={col(io.fg)} style={{ opacity: 0.62, marginTop: 5 }}>{io.code}</T>
                                </Press>
                            ))}
                        </Row>

                        <View style={{ borderRadius: 20, backgroundColor: '#FFFFFF', padding: 18, alignItems: 'center', marginBottom: 10 }}>
                            <Image source={{ uri: vm.invite.qr }} style={{ width: 196, height: 196 }} resizeMode="contain" />
                            <T w={700} s={15} lh={1} c="#0A0A0C" style={{ marginTop: 14 }}>{vm.invite.name}</T>
                            <T mono w={600} s={10} lh={1} ls={0.08} c="rgba(10,10,12,.5)" style={{ marginTop: 7 }}>{vm.invite.policy}</T>
                        </View>

                        <Row style={{ gap: 12, paddingVertical: 13, paddingHorizontal: 15, borderRadius: 16, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, marginBottom: 10 }}>
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <Eyebrow s={9} ls={0.1}>PROPERTY ID</Eyebrow>
                                <T w={700} s={15} lh={1} c={t.fg} style={{ marginTop: 7, letterSpacing: 0.5 }}>{vm.invite.code}</T>
                            </View>
                            <Press onPress={vm.invite.share} style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: t.vsoft, alignItems: 'center', justifyContent: 'center' }}>
                                <Glyph name="copy-outline" size={16} color={t.accent} />
                            </Press>
                        </Row>

                        <Row style={{ gap: 7 }}>
                            <Press onPress={vm.invite.share} style={{ flex: 1, paddingVertical: 15, borderRadius: 999, backgroundColor: t.lime, alignItems: 'center' }}>
                                <T w={700} s={14} lh={1} c={t.on}>Share invite link</T>
                            </Press>
                            <Press onPress={vm.invite.manual} style={{ paddingVertical: 15, paddingHorizontal: 18, borderRadius: 999, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }}>
                                <T w={600} s={13} lh={1} c={t.fg2}>Add manually</T>
                            </Press>
                        </Row>
                    </View>
                )}

                {/* ── Move ────────────────────────────────────────────── */}
                {vm.isMove && (
                    <View>
                        <T w={700} s={20} lh={1} style={{ letterSpacing: -0.8 }}>{`Move ${vm.moveName || ''}`}</T>
                        <Eyebrow s={10} ls={0.08} style={{ marginTop: 7, marginBottom: 16 }}>{`FROM ${vm.moveFrom || ''} · ROOMS WITH A FREE BED`}</Eyebrow>
                        {vm.noMoveTargets && (
                            <View style={{ paddingVertical: 34, alignItems: 'center' }}>
                                <T w={500} s={13} lh={1.5} c={t.fg2} style={{ textAlign: 'center' }}>Every other room is full. Free a bed first, or add a unit.</T>
                            </View>
                        )}
                        {(vm.moveTargets || []).map((mt, i) => (
                            <View key={i} style={{ marginBottom: 14 }}>
                                <Row align="baseline" style={{ gap: 9, marginBottom: 9 }}>
                                    <T w={600} s={13} lh={1} c={t.fg}>{mt.name}</T>
                                    <Eyebrow s={9} ls={0.06}>{mt.policy}</Eyebrow>
                                </Row>
                                {(mt.rooms || []).map((mr, j) => (
                                    <Press key={j} onPress={mr.go} style={{ flexDirection: 'row', alignItems: 'center', gap: 13, width: '100%', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, marginBottom: 7, borderWidth: 1, borderColor: col(mr.bd), backgroundColor: col(mr.bg) }}>
                                        <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: t.ink2, alignItems: 'center', justifyContent: 'center' }}>
                                            <T w={700} s={15} lh={1} c={col(mr.fg)}>{mr.no}</T>
                                        </View>
                                        <View style={{ flex: 1, minWidth: 0 }}>
                                            <T w={600} s={13} lh={1.2} c={col(mr.fg)}>{mr.type}</T>
                                            <T mono w={600} s={10} lh={1.4} ls={0.06} c={col(mr.sub)} style={{ marginTop: 4 }}>{mr.beds}</T>
                                        </View>
                                        <Glyph name="chevron-forward" size={16} color={t.fg3} />
                                    </Press>
                                ))}
                            </View>
                        ))}
                    </View>
                )}

                {/* ── Danger (move out / delete) ──────────────────────── */}
                {vm.isDanger && (
                    <View>
                        <T w={700} s={20} lh={1} style={{ letterSpacing: -0.8, marginBottom: 16 }}>{who.name}</T>
                        {who.assigned && (
                            <Press onPress={vm.moveOut} style={{ flexDirection: 'row', alignItems: 'center', gap: 13, width: '100%', padding: 14, borderRadius: 18, borderWidth: 1, borderColor: t.line, backgroundColor: t.ink3, marginBottom: 8 }}>
                                <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: t.asoft, alignItems: 'center', justifyContent: 'center' }}>
                                    <Glyph name="log-out-outline" size={17} color={t.amber} />
                                </View>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <T w={600} s={14} lh={1.2} c={t.fg}>Move out</T>
                                    <T w={400} s={12} lh={1.4} c={t.fg2} style={{ marginTop: 4 }}>Frees the room. Account stays, marked unassigned.</T>
                                </View>
                            </Press>
                        )}
                        <Press onPress={vm.deleteMember} style={{ flexDirection: 'row', alignItems: 'center', gap: 13, width: '100%', padding: 14, borderRadius: 18, borderWidth: 1, borderColor: t.line, backgroundColor: t.csoft, marginBottom: 8 }}>
                            <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: t.ink2, alignItems: 'center', justifyContent: 'center' }}>
                                <Glyph name="trash-outline" size={17} color={t.coral} />
                            </View>
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <T w={600} s={14} lh={1.2} c={t.coral}>Delete member</T>
                                <T w={400} s={12} lh={1.4} c={t.fg2} style={{ marginTop: 4 }}>Removes the account and its history for good.</T>
                            </View>
                        </Press>
                        <Press onPress={vm.closeOverlay} style={{ width: '100%', padding: 14, borderRadius: 18, borderWidth: 1, borderColor: t.line, alignItems: 'center' }}>
                            <T w={600} s={13} lh={1} c={t.fg2}>Cancel</T>
                        </Press>
                    </View>
                )}

                {/* ── Overdue sheet ───────────────────────────────────── */}
                {vm.isOverdueSheet && (
                    <View>
                        <T w={700} s={20} lh={1} style={{ letterSpacing: -0.8 }}>{vm.overdueTitle}</T>
                        <Eyebrow s={10} ls={0.08} style={{ marginTop: 7, marginBottom: 16 }}>{vm.overdueScopeLine}</Eyebrow>
                        {(vm.overdueRows || []).map((o, i) => (
                            <View key={i} style={{ borderRadius: 18, borderWidth: 1, borderColor: t.line, backgroundColor: t.ink3, paddingVertical: 13, paddingHorizontal: 14, marginBottom: 8 }}>
                                <Row style={{ gap: 11 }}>
                                    <Image source={{ uri: o.img }} style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: t.ink2 }} resizeMode="cover" />
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <T w={600} s={15} lh={1.2} c={t.fg}>{o.name}</T>
                                        <Eyebrow s={10} ls={0.06} style={{ marginTop: 4 }}>{o.sub}</Eyebrow>
                                    </View>
                                    <View style={{ alignItems: 'flex-end' }}>
                                        <T w={700} s={15} lh={1} c={t.fg}>{o.rent}</T>
                                        <T mono w={600} s={9} lh={1} ls={0.06} c={t.coral} style={{ marginTop: 5 }}>{o.late}</T>
                                    </View>
                                </Row>
                                <Row style={{ gap: 7, marginTop: 12 }}>
                                    <Press onPress={o.record} style={{ flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: t.lime, alignItems: 'center' }}>
                                        <T w={600} s={11} lh={1} c={t.on}>Record payment</T>
                                    </Press>
                                    <Press onPress={o.remind} style={{ flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, alignItems: 'center' }}>
                                        <T w={600} s={11} lh={1} c={t.fg}>Remind</T>
                                    </Press>
                                    <Press onPress={o.open} style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line }}>
                                        <T w={600} s={11} lh={1} c={t.fg2}>View</T>
                                    </Press>
                                </Row>
                            </View>
                        ))}
                    </View>
                )}

                {/* ── Vacant sheet ────────────────────────────────────── */}
                {vm.isVacant && (
                    <View>
                        <T w={700} s={20} lh={1} style={{ letterSpacing: -0.8 }}>{vm.vacantTitle}</T>
                        <Eyebrow s={10} ls={0.08} style={{ marginTop: 7, marginBottom: 16 }}>{vm.vacantScopeLine}</Eyebrow>
                        {(vm.vacantRooms || []).map((v, i) => (
                            <Press key={i} onPress={v.go} style={{ flexDirection: 'row', alignItems: 'center', gap: 13, width: '100%', paddingVertical: 13, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: t.line, backgroundColor: t.asoft, marginBottom: 8 }}>
                                <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: t.ink2, alignItems: 'center', justifyContent: 'center' }}>
                                    <T w={700} s={17} lh={1} c={t.fg}>{v.no}</T>
                                </View>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <T w={600} s={14} lh={1.2} c={t.fg}>{v.prop}</T>
                                    <Eyebrow s={10} ls={0.06} style={{ marginTop: 4 }}>{v.type}</Eyebrow>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <T w={700} s={14} lh={1} c={t.amber}>{v.rent}</T>
                                    <Eyebrow s={9} ls={0.06} style={{ marginTop: 5 }}>LOST RENT</Eyebrow>
                                </View>
                            </Press>
                        ))}
                    </View>
                )}

                {/* ── Record a payment ────────────────────────────────── */}
                {vm.isRecord && (
                    <View>
                        <T w={700} s={20} lh={1} style={{ letterSpacing: -0.8 }}>Record a payment</T>
                        <T w={400} s={12} lh={1.4} c={t.fg2} style={{ marginTop: 6, marginBottom: 18 }}>{`${who.name || ''} · ${who.unitLine || ''}`}</T>
                        <View style={{ borderRadius: 20, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, padding: 20, alignItems: 'center', marginBottom: 12 }}>
                            <Eyebrow s={9} ls={0.12}>AMOUNT</Eyebrow>
                            <T w={700} s={40} lh={1} c={t.fg} style={{ marginTop: 12, letterSpacing: -2 }}>{who.rentFull}</T>
                        </View>
                        <Row style={{ gap: 7, marginBottom: 16 }}>
                            {(vm.methods || []).map((m, i) => (
                                <Press key={i} onPress={m.go} style={{ flex: 1, paddingVertical: 12, borderRadius: 13, borderWidth: 1, borderColor: col(m.bd), backgroundColor: col(m.bg), alignItems: 'center' }}>
                                    <T mono w={600} s={9} lh={1} ls={0.08} c={col(m.fg)}>{m.label}</T>
                                </Press>
                            ))}
                        </Row>
                        <Press onPress={vm.confirmRecord} style={{ width: '100%', paddingVertical: 16, borderRadius: 999, backgroundColor: t.lime, alignItems: 'center' }}>
                            <T w={700} s={14} lh={1} c={t.on}>{`Confirm ${who.rentFull || ''}`}</T>
                        </Press>
                    </View>
                )}

                {/* ── Pay (tenant) ────────────────────────────────────── */}
                {vm.isPay && (
                    <View>
                        <T w={700} s={20} lh={1} style={{ letterSpacing: -0.8, marginBottom: 16 }}>{vm.payLabel || 'Pay ₹8,000'}</T>
                        <Row style={{ gap: 13, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: t.line, backgroundColor: t.ink3, marginBottom: 8 }}>
                            <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: t.vsoft, alignItems: 'center', justifyContent: 'center' }}>
                                <Glyph name="at" size={18} color={t.accent} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Eyebrow s={9} ls={0.1}>UPI ID</Eyebrow>
                                <T w={600} s={14} lh={1} style={{ marginTop: 6 }}>demo@okhdfcbank</T>
                            </View>
                            <Glyph name="copy-outline" size={17} color={t.fg3} />
                        </Row>
                        <Row style={{ gap: 13, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: t.line, backgroundColor: t.ink3, marginBottom: 16 }}>
                            <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: t.vsoft, alignItems: 'center', justifyContent: 'center' }}>
                                <Glyph name="call-outline" size={17} color={t.accent} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Eyebrow s={9} ls={0.1}>UPI NUMBER</Eyebrow>
                                <T w={600} s={14} lh={1} style={{ marginTop: 6 }}>9000000000</T>
                            </View>
                            <Glyph name="copy-outline" size={17} color={t.fg3} />
                        </Row>
                        <Press onPress={vm.closeOverlay} style={{ width: '100%', paddingVertical: 16, borderRadius: 999, backgroundColor: t.lime, alignItems: 'center' }}>
                            <T w={700} s={14} lh={1} c={t.on}>Open UPI app</T>
                        </Press>
                        <Eyebrow s={8} ls={0.06} style={{ marginTop: 14, textAlign: 'center' }}>YOUR LANDLORD CONFIRMS IT, THEN IT APPEARS IN YOUR HISTORY</Eyebrow>
                    </View>
                )}

                {/* ── Menu ────────────────────────────────────────────── */}
                {vm.isMenu && (
                    <View>
                        <Row style={{ gap: 13, marginBottom: 18 }}>
                            <Image source={{ uri: 'https://randomuser.me/api/portraits/men/32.jpg' }} style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: t.accent }} resizeMode="cover" />
                            <View style={{ flex: 1 }}>
                                <T w={600} s={16} lh={1.2}>Demo Landlord</T>
                                <Eyebrow s={10} ls={0.08} style={{ marginTop: 4 }}>DEMO@GMAIL.COM</Eyebrow>
                            </View>
                        </Row>
                        {(vm.menuRows || []).map((m, i) => (
                            <Press key={i} onPress={m.go} style={{ flexDirection: 'row', alignItems: 'center', gap: 13, width: '100%', paddingVertical: 13, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: t.line, backgroundColor: t.ink3, marginBottom: 8 }}>
                                <View style={{ width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: col(m.bg) }}>
                                    <Glyph name={m.icon} size={16} color={col(m.ifg)} />
                                </View>
                                <T w={500} s={14} lh={1} c={col(m.fg)} style={{ flex: 1 }}>{m.label}</T>
                                <Glyph name="chevron-forward" size={16} color={t.fg3} />
                            </Press>
                        ))}
                    </View>
                )}
            </ScrollView>
        </View>
    );
}
