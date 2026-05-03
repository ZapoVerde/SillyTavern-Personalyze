/**
 * @file data/default-user/extensions/personalyze/ui/workshop/logic/state.js
 * @stamp {"utc":"2026-05-01T19:00:00.000Z"}
 * @architectural-role Stateful Owner (Logic UI State)
 * @description
 * Manages ephemeral session state for the Logic Probes UI.
 * 
 * @api-declaration
 * getActiveProbeKey() -> string
 * setActiveProbeKey(val) -> void
 * isProbeDirty() -> boolean
 * setProbeDirty(val) -> void
 * getLastFocusedInput() -> string
 * setLastFocusedInput(val) -> void
 * resetLogicState() -> void
 * 
 * @contract
 *   assertions:
 *     purity: Stateful Owner
 *     state_ownership: [_activeProbeKey, _isProbeDirty, _lastFocusedInput]
 *     external_io: []
 */

let _activeProbeKey = '';
let _isProbeDirty   = false;
let _lastFocusedInput = '#plz-logic-prompt-preview';

/** Returns the key of the probe currently open in the editor. */
export function getActiveProbeKey() {
    return _activeProbeKey;
}

/** Sets the active probe key. */
export function setActiveProbeKey(val) {
    _activeProbeKey = val || '';
}

/** Returns true if the active probe has unsaved changes in the workspace. */
export function isProbeDirty() {
    return _isProbeDirty;
}

/** Sets the dirty flag for the active probe. */
export function setProbeDirty(val) {
    _isProbeDirty = !!val;
}

/** Returns the selector of the last textarea focused in the logic editor. */
export function getLastFocusedInput() {
    return _lastFocusedInput;
}

/** Sets the tracker for cursor-based token injection. */
export function setLastFocusedInput(val) {
    _lastFocusedInput = val || '#plz-logic-prompt-preview';
}

/** Restores state to defaults (e.g. on style switch). */
export function resetLogicState() {
    _activeProbeKey = '';
    _isProbeDirty = false;
    _lastFocusedInput = '#plz-logic-prompt-preview';
}