/**
 * @file data/default-user/extensions/personalyze/ui/panel/connection.js
 * @stamp {"utc":"2026-04-10T17:40:00.000Z"}
 * @architectural-role UI Logic (ST Bridge)
 * @description
 * Manages the integration with SillyTavern's ConnectionManagerRequestService.
 * Maps pipeline stages (Fast Model for gating, Smart Model for extraction) 
 * to specific AI profiles selected by the user in the settings panel.
 *
 * @api-declaration
 * refreshConnectionDropdowns(onUpdate) -> void
 *
 * @contract
 *   assertions:
 *     purity: IO / Side-effect
 *     state_ownership: []
 *     external_io: [ConnectionManagerRequestService, DOM (select inputs)]
 */

import { ConnectionManagerRequestService } from '../../../../shared.js';
import { getSettings, updateSetting } from '../../settings.js';
import { warn } from '../../utils/logger.js';

/**
 * Re-initializes the ST connection dropdowns for the Layered Pipeline.
 * Should be called on panel injection and whenever the settings profile changes.
 * 
 * @param {Function} onUpdate — Callback to trigger a dirty-indicator refresh.
 */
export function refreshConnectionDropdowns(onUpdate) {
    const s = getSettings();
    
    // Updated to match the Dual-Model (Phase 1/2 vs Phase 3) architecture
    const dropdowns = [
        { id: '#plz-profile-fast',  key: 'fastProfileId'  },
        { id: '#plz-profile-smart', key: 'smartProfileId' },
    ];

    for (const { id, key } of dropdowns) {
        if (!document.querySelector(id)) continue;

        try {
            ConnectionManagerRequestService.handleDropdown(
                id,
                s[key] ?? '',
                (profile) => {
                    updateSetting(key, profile?.id ?? null);
                    if (onUpdate) onUpdate();
                },
            );
        } catch (err) {
            warn('Connection', `ST Connection Manager failed for ${id}:`, err);
            // Hide the dropdown row if ST service fails
            $(id).closest('.plz-call-row').hide();
        }
    }
}