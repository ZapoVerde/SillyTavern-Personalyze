/**
 * @file data/default-user/extensions/personalyze/ui/engines/listeners.js
 * @stamp {"utc":"2026-04-26T00:00:00.000Z"}
 * @architectural-role Orchestrator (Engines Modal Handlers)
 * @description
 * Thin orchestrator for the Engines configuration modal event system.
 * Delegates all responsibilities to single-purpose handler modules and
 * re-exports the two functions consumed by enginesModal.js.
 *
 * Handler modules:
 *   handlers/keyStatus.js     — API key presence indicators
 *   handlers/uiRefresh.js     — Full modal UI sync on open
 *   handlers/pingTest.js      — Vault save, ping, and test-generation
 *   handlers/settingsSync.js  — Settings persistence on change/input
 *   handlers/runwareUpload.js — Runware model upload overlay lifecycle
 *
 * @api-declaration
 * bindEnginesHandlers($modal) → void
 * refreshEnginesUI()          → Promise<void>    [re-exported]
 * updateEngineKeyStatuses()   → Promise<void>    [re-exported]
 *
 * @contract
 *   assertions:
 *     purity: Orchestrator
 *     state_ownership: []
 *     external_io: [modelManagerModal.js, handler modules]
 */

import { log } from '../../utils/logger.js';
import { openModelManager } from '../models/modelManagerModal.js';
import { bindPingTestHandlers } from './handlers/pingTest.js';
import { bindSettingsSyncHandlers } from './handlers/settingsSync.js';
import { bindRunwareUploadHandler } from './handlers/runwareUpload.js';

export { updateEngineKeyStatuses } from './handlers/keyStatus.js';
export { refreshEnginesUI } from './handlers/uiRefresh.js';

/**
 * Wires all event handlers for the Engines configuration modal.
 * @param {jQuery} $modal - The #plz-engines-overlay element.
 */
export function bindEnginesHandlers($modal) {
    $modal.on('click', '#plz-open-model-manager', async () => { await openModelManager(); });

    bindRunwareUploadHandler($modal);
    bindPingTestHandlers($modal);
    bindSettingsSyncHandlers($modal);

    log('EnginesModal', 'Handlers bound.');
}
