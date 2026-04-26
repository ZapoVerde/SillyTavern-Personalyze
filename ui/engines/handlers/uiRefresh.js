/**
 * @file data/default-user/extensions/personalyze/ui/engines/handlers/uiRefresh.js
 * @stamp {"utc":"2026-04-26T00:00:00.000Z"}
 * @architectural-role IO Executor (Engines Modal UI Sync)
 * @description
 * Synchronizes all inputs and controls within the Engines configuration modal
 * to the current persisted settings on every open. Populates model dropdowns
 * from the cached model list, restores toggle states, and delegates key status
 * indicator rendering to keyStatus.js.
 *
 * @api-declaration
 * refreshEnginesUI() → Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: IO Executor
 *     state_ownership: []
 *     external_io: [DOM, settings.js, models.js, keyStatus.js, smartResize]
 */

import { getSettings } from '../../../settings.js';
import { getCachedModels } from '../../panel/models.js';
import { smartResize } from '../../../utils/dom.js';
import { DEFAULT_TEST_PROMPT } from '../../../defaults.js';
import { updateEngineKeyStatuses } from './keyStatus.js';

/**
 * Syncs all modal inputs to current settings, then refreshes key status indicators.
 */
export async function refreshEnginesUI() {
    const s = getSettings();

    // 1. Availability toggles
    $('#plz-eng-pol-enabled').prop('checked', s.engineEnablePollinations !== false);
    $('#plz-eng-fal-enabled').prop('checked', !!s.engineEnableFal);
    $('#plz-eng-piapi-enabled').prop('checked', !!s.engineEnablePiAPI);
    $('#plz-eng-runware-enabled').prop('checked', !!s.engineEnableRunware);

    // 2. Pollinations model dropdown
    const $polSelect = $('#plz-eng-pol-model');
    if ($polSelect.length) {
        const dynamicModels = getCachedModels();
        $polSelect.html(
            dynamicModels.map(m => `<option value="${m}"${m === s.imageModel ? ' selected' : ''}>${m}</option>`).join('')
        );
        $polSelect.val(s.imageModel);
    }

    // 3. Per-engine inputs
    $('#plz-eng-fal-model').val(s.falModel);
    $('#plz-eng-piapi-model').val(s.piapiModel);
    $('#plz-eng-piapi-rmbg').prop('checked', !!s.piapiRemoveBackground);
    $('#plz-eng-piapi-rmbg-model').val(s.piapiRmbgModel).prop('disabled', !s.piapiRemoveBackground);

    $('#plz-eng-runware-model').val(s.runwareModel);
    $('#plz-eng-runware-layerdiffuse').prop('checked', !!s.runwareUseLayerDiffuse);
    $('#plz-eng-runware-rmbg').prop('checked', !!s.runwareRemoveBackground);
    $('#plz-eng-runware-rmbg-model').val(s.runwareRmbgModel).prop('disabled', !s.runwareRemoveBackground);

    // 4. Test prompt
    const $testArea = $('#plz-eng-test-prompt');
    $testArea.val(s.testPrompt ?? DEFAULT_TEST_PROMPT);
    smartResize($testArea[0]);

    await updateEngineKeyStatuses();
}
