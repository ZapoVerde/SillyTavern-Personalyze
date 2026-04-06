/**
 * @file data/default-user/extensions/personalyze/ui/panel/connection.js
 * @stamp {"utc":"2026-04-05T00:00:00.000Z"}
 * @architectural-role UI Logic (ST Bridge)
 * @description
 * Manages the integration with SillyTavern's ConnectionManagerRequestService.
 * Maps pipeline stages (Boolean, Classifier, Describer) to specific AI profiles
 * selected by the user in the settings panel.
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
 * Re-initializes the three ST connection dropdowns.
 * Should be called on panel injection and whenever the settings profile changes.
 * 
 * @param {Function} onUpdate — Callback to trigger a dirty-indicator refresh.
 */
export function refreshConnectionDropdowns(onUpdate) {
    const s = getSettings();
    
    const dropdowns = [
        { id: '#plz-profile-boolean',    key: 'booleanProfileId'    },
        { id: '#plz-profile-classifier', key: 'classifierProfileId' },
        { id: '#plz-profile-describer',  key: 'describerProfileId'  },
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
            // Hide the dropdown row if ST service fails to prevent confusing the user
            $(id).closest('.plz-call-row').find('select').closest('div').hide();
        }
    }
}