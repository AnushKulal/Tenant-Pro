// File: mobile/src/redesign/keyboard.js
// Keeping the field you are typing in above the keyboard.
//
// v2 routes by state rather than a navigator and lays every screen out as a plain
// ScrollView, which means nothing in the tree knew the keyboard existed. Tap a
// field near the bottom of a screen — the reply box on a ticket, the notes field in
// a sheet — and the keyboard covered it: you were typing into something you could
// not see. React Native does not solve this for you. `KeyboardAvoidingView` only
// pads a container; it never scrolls the focused field into view, and on Android it
// fights the window's own resize.
//
// So this does the two separate things the problem actually needs:
//
//   1. gives the scroll content enough bottom room that the keyboard is not
//      covering content that can never be scrolled to, and
//   2. when the keyboard opens, measures the FOCUSED field against the keyboard's
//      top edge and scrolls by exactly the overlap — and no more, so the view does
//      not jump when the field was already visible.
//
// It also puts the view back where it was on dismiss, which is the half users
// notice by its absence: without it you close the keyboard and the page is left
// scrolled somewhere you did not put it.
import React from 'react';
import { Keyboard, Platform, ScrollView, TextInput, Dimensions } from 'react-native';

// The keyboard's height right now, 0 when it is closed.
//
// iOS reports `keyboardWillShow` before the animation, Android only
// `keyboardDidShow` after it — subscribing to both on both platforms would fire
// twice on iOS, so each platform gets the earliest event it actually has.
export function useKeyboardHeight() {
    const [height, setHeight] = React.useState(0);

    React.useEffect(() => {
        const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
        const onShow = (e) => setHeight((e && e.endCoordinates && e.endCoordinates.height) || 0);
        const onHide = () => setHeight(0);
        const s1 = Keyboard.addListener(showEvt, onShow);
        const s2 = Keyboard.addListener(hideEvt, onHide);
        return () => { s1.remove(); s2.remove(); };
    }, []);

    return height;
}

// A ScrollView that keeps the focused field visible.
//
// `extra` is the breathing room left between the field and the keyboard, so the
// field does not sit flush against it (and, on a multi-line composer, so the next
// line you type is not immediately underneath it).
//
// `mode` says who is making room for the keyboard:
//
//   'pad'    — this scroll view is. It runs to the bottom of the window, so it
//              grows its own bottom padding by the keyboard's height and scrolls
//              the field up out from under it. Use for a full-screen page.
//   'lifted' — the CONTAINER is, by moving up out of the way (the bottom sheet
//              does this). Padding here would then leave a keyboard-sized hole at
//              the end of the content, so it is skipped; the measurement waits a
//              frame for the container to move before deciding whether anything
//              still needs scrolling.
//
// Every prop is forwarded, so this is a drop-in replacement for the ScrollView it
// stands in for; only contentContainerStyle is touched, and only its padding.
export const KeyboardScroll = React.forwardRef(function KeyboardScroll(
    { children, contentContainerStyle, extra = 24, mode = 'pad', keyboardShouldPersistTaps = 'handled', onScroll, scrollEventThrottle = 16, ...rest },
    ref
) {
    const inner = React.useRef(null);
    const offset = React.useRef(0);      // where the list is scrolled to right now
    const restore = React.useRef(null);  // where it was before we moved it
    const kb = useKeyboardHeight();

    // Let a parent still hold the ref while we keep our own.
    const setRef = React.useCallback((node) => {
        inner.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
    }, [ref]);

    const track = React.useCallback((e) => {
        offset.current = (e && e.nativeEvent && e.nativeEvent.contentOffset && e.nativeEvent.contentOffset.y) || 0;
        if (onScroll) onScroll(e);
    }, [onScroll]);

    React.useEffect(() => {
        const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

        const onShow = (e) => {
            const kbHeight = (e && e.endCoordinates && e.endCoordinates.height) || 0;
            if (!kbHeight) return;
            const node = TextInput.State.currentlyFocusedInput
                ? TextInput.State.currentlyFocusedInput()
                : null;
            // Nothing focused means the keyboard belongs to something else (a native
            // picker, an autofill sheet). Moving the list would be wrong.
            if (!node || !node.measureInWindow) return;

            // Remember where we were, so dismissing the keyboard can put it back.
            // Only the FIRST show records it: focus moving between two fields must
            // not overwrite the original position with an already-shifted one.
            if (restore.current == null) restore.current = offset.current;

            const kbTop = Dimensions.get('window').height - kbHeight;
            const decide = () => node.measureInWindow((x, y, w, h) => {
                const fieldBottom = y + h + extra;
                const overlap = fieldBottom - kbTop;
                // Already clear of the keyboard: leave the view exactly where the
                // user put it. Scrolling anyway is the jump other apps get wrong.
                if (overlap <= 0) {
                    restore.current = null;
                    return;
                }
                const target = offset.current + overlap;
                if (inner.current && inner.current.scrollTo) {
                    inner.current.scrollTo({ y: target, animated: true });
                }
            });

            // In 'lifted' mode the container is about to move up by the keyboard's
            // height. Measuring now would read the field's OLD position, decide it is
            // covered, and scroll — on top of the lift, overshooting by a whole
            // keyboard. Two frames is enough for the container's re-render to land.
            if (mode === 'lifted') {
                requestAnimationFrame(() => requestAnimationFrame(decide));
            } else {
                decide();
            }
        };

        const onHide = () => {
            const back = restore.current;
            restore.current = null;
            if (back == null) return;
            if (inner.current && inner.current.scrollTo) {
                inner.current.scrollTo({ y: back, animated: true });
            }
        };

        const s1 = Keyboard.addListener(showEvt, onShow);
        const s2 = Keyboard.addListener(hideEvt, onHide);
        return () => { s1.remove(); s2.remove(); };
    }, [extra, mode]);

    // Flatten so a caller's own paddingBottom is added to rather than replaced —
    // screens set one for the dock, and dropping it would tuck the last row under.
    const flat = Array.isArray(contentContainerStyle)
        ? Object.assign({}, ...contentContainerStyle.filter(Boolean))
        : (contentContainerStyle || {});

    return (
        <ScrollView
            ref={setRef}
            onScroll={track}
            scrollEventThrottle={scrollEventThrottle}
            keyboardShouldPersistTaps={keyboardShouldPersistTaps}
            contentContainerStyle={[flat, kb && mode === 'pad' ? { paddingBottom: (flat.paddingBottom || 0) + kb } : null]}
            {...rest}
        >
            {children}
        </ScrollView>
    );
});

export default KeyboardScroll;
