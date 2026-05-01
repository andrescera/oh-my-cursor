/**
 * Cross-tab `r` hotkey channel.
 *
 * `ShellHotkeys.ts` dispatches this on `window` when the user presses `r`;
 * each tab's mount-time fetcher subscribes to it and re-runs its loader.
 * Radix Tabs unmounts inactive panels so only the active tab's listener
 * is wired at any time — there is no cross-tab fan-out to worry about.
 *
 * Keep both sides in sync via this single constant; the previous string
 * literal (`tab-refresh`) was orphaned because Shell dispatched but no
 * tab listened (F2 P1-2 / F4 carryover).
 */

export const TAB_REFRESH_EVENT = 'omc-tab-refresh'
