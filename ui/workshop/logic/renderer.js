/**
 * @file data/default-user/extensions/personalyze/ui/workshop/logic/renderer.js
 * @stamp {"utc":"2026-05-01T19:50:00.000Z"}
 * @architectural-role IO Executor
 * @description
 * Handles the rendering and DOM synchronization of the Logic Probes UI components.
 * Manages SillyTavern connection dropdown binding for probes.
 * 
 * @api-declaration
 * renderLogicDrawer() -> void
 * syncLogicSelector() -> void
 * 
 * @contract
 *   assertions:
 *     purity: IO Executor
 *     state_ownership: []
 *     external_io: [DOM, settings.js, state.js, ConnectionManagerRequestService, styleLogicTemplates.js]
 */

import { ConnectionManagerRequestService } from '../../../../shared.js';
import { getMetaSettings, getSettings } from '../../settings.js';
import { saveSettingsDebounced } from '../../../../../../../script.js';
import { state } from '../../state.js';
import { getLogicDrawerHTML, getProbeSelectorHTML } from '../styleLogicTemplates.js';
import { getActiveProbeKey, isProbeDirty, setProbeDirty } from './state.js';

/**
 * Updates only the selector row in the DOM.
 * Useful for updating "dirty" indicators (asterisks) without a full re-render.
 */
export function syncLogicSelector() {
    const meta = getMetaSettings();
    const style = meta.styleWorkspaces[getSettings().currentStyleName];
    if (!style) return;

    const activeKey = getActiveProbeKey();
    const dirty = isProbeDirty();

    $('#plz-logic-selector-container').html(
        getProbeSelectorHTML(style.logicProbes, activeKey, dirty)
    );
}

/**
 * Renders the entire Logic Probes drawer content.
 * Preserves the 'open' state of the <details> tag and binds the ST connection dropdown.
 */
export function renderLogicDrawer() {
    const meta = getMetaSettings();
    const s = getSettings();
    const style = meta.styleWorkspaces[s.currentStyleName];
    if (!style) return;

    const activeKey = getActiveProbeKey();
    const dirty = isProbeDirty();

    // Preserve UI expansion state
    const wasOpen = $('#plz-logic-details').prop('open');
    
    // Gather character data for the variable legend
    const workshopChar = state.chatCharacters[state._workshopCharacterId];
    const identitySlots = Object.keys(workshopChar?.identity || {});

    // 1. Structural Render
    $('#plz-logic-drawer-mount').html(
        getLogicDrawerHTML(style, activeKey, dirty, identitySlots)
    );
    
    if (wasOpen) $('#plz-logic-details').prop('open', true);
    
    // 2. ST Connection Dropdown Binding
    // Only bind if a probe is currently selected for editing
    if (activeKey && style.logicProbes[activeKey]) {
        const probe = style.logicProbes[activeKey];
        
        ConnectionManagerRequestService.handleDropdown(
            '#plz-logic-profile',
            probe.profileId || '',
            (profile) => {
                const newId = profile?.id ?? null;
                if (probe.profileId !== newId) {
                    probe.profileId = newId;
                    setProbeDirty(true);
                    syncLogicSelector();
                    saveSettingsDebounced();
                }
            }
        );
    }
}