/**
 * @file data/default-user/extensions/personalyze/ui/workshop/logic/creators.js
 * @stamp {"utc":"2026-05-01T19:20:00.000Z"}
 * @architectural-role Stateful Controller
 * @description
 * Handles the logic for creating and cloning Logic Probes within a Style Workspace.
 * Ensures unique keys and standard object initialization.
 * 
 * @api-declaration
 * handleNewProbe(style, onComplete) -> Promise<void>
 * handleCloneProbe(style, sourceKey, onComplete) -> Promise<void>
 * 
 * @contract
 *   assertions:
 *     purity: Stateful Controller
 *     state_ownership: [setActiveProbeKey, setProbeDirty]
 *     external_io: [saveSettingsDebounced, promptModal, toastr]
 */

import { saveSettingsDebounced } from '../../../../../../script.js';
import { promptModal } from '../../utils/modal.js';
import { setActiveProbeKey, setProbeDirty } from './state.js';

/**
 * Normalizes user input into a technical token key.
 * @param {string} input 
 * @returns {string}
 */
function _slugify(input) {
    return (input || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

/**
 * Triggers the "New Probe" flow.
 * 
 * @param {Object} style - The style workspace object.
 * @param {Function} onComplete - Callback to trigger a UI re-render.
 */
export async function handleNewProbe(style, onComplete) {
    const nameRaw = await promptModal('New Logic Probe Token Name');
    if (!nameRaw) return;

    const key = _slugify(nameRaw);
    if (!key) return;

    if (style.logicProbes[key]) {
        if (window.toastr) window.toastr.warning('Token name already exists.');
        return;
    }

    // Initialize standard schema
    style.logicProbes[key] = {
        prompt: '',
        profileId: null,
        type: 'boolean',
        trueTemplate: '',
        falseTemplate: ''
    };

    setActiveProbeKey(key);
    setProbeDirty(true);
    
    saveSettingsDebounced();
    if (onComplete) onComplete();
}

/**
 * Clones an existing probe into a new key.
 * 
 * @param {Object} style - The style workspace object.
 * @param {string} sourceKey - The key of the probe to duplicate.
 * @param {Function} onComplete - Callback to trigger a UI re-render.
 */
export async function handleCloneProbe(style, sourceKey, onComplete) {
    const source = style.logicProbes[sourceKey];
    if (!source) return;

    const nameRaw = await promptModal(`Clone "${sourceKey}" as...`);
    if (!nameRaw) return;

    const key = _slugify(nameRaw);
    if (!key) return;

    if (style.logicProbes[key]) {
        if (window.toastr) window.toastr.warning('Token name already exists.');
        return;
    }

    style.logicProbes[key] = structuredClone(source);
    
    setActiveProbeKey(key);
    setProbeDirty(true);
    
    saveSettingsDebounced();
    if (onComplete) onComplete();
}