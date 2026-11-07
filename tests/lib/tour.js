// File: tests/lib/tour.js
//
// Get the guided tour out of the way.
//
// The tour greets anybody signing in for the first time, and "first time" is
// per browser profile — so every suite that opens a fresh context is a new user
// and gets it. It is a modal: it dims the screen and the dim is a PRESS, so a
// click meant for the app lands on the tour and advances it instead.
//
// The suites written before the tour existed did not know to close it, and the
// result was not an error anywhere. They signed in, clicked at the dim for a
// while, ended up on whatever screen the tour's last step had navigated to, and
// then reported that the Find screen does not list places and that the account
// menu does not open. Twelve failures in one suite, all of them this.
//
// So: every suite closes the tour straight after signing in. By the close
// button's accessible name, not by coordinates — the card sits above or below
// the lit band depending on the step, so there is no fixed place to aim at.
// It has to WAIT for the tour, not look once.
//
// The tour does not arrive with the screen. The app resolves the session, asks
// storage whether this portal's tour has been taken, and only then starts it,
// about a second later. A suite that checks for the close button the instant
// sign-in returns finds nothing, carries on, and meets the tour a second later
// with every click it makes from then on.
//
// That is exactly what happened: the dismissal was in place, it reported
// nothing to close, and the run still spent its whole landlord section clicking
// at a dim panel over the dock. The screenshot it took shows "STEP 1 OF 7" over
// the Overview screen while the log says no tab was reachable.
//
// So: poll for up to `appearsWithin`, and return false only after that whole
// window has passed with no tour in sight.
const dismissTour = async (page, { appearsWithin = 7000, wait = 900 } = {}) => {
    const deadline = Date.now() + appearsWithin;
    let closer = page.getByLabel('Close tour').first();
    while (!await closer.count()) {
        if (Date.now() > deadline) return false;
        await page.waitForTimeout(300);
        closer = page.getByLabel('Close tour').first();
    }
    await closer.click({ timeout: 4000 }).catch(async () => {
        await closer.click({ force: true }).catch(() => {});
    });
    await page.waitForTimeout(wait);
    // One more, in case a second portal's tour is queued behind the first.
    const again = page.getByLabel('Close tour').first();
    if (await again.count()) {
        await again.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(400);
    }
    return true;
};

module.exports = { dismissTour };
