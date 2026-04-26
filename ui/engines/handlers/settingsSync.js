/**
 * @file data/default-user/extensions/personalyze/ui/engines/handlers/settingsSync.js
 * @stamp {"utc":"2026-04-26T00:00:00.000Z"}
 * @architectural-role IO Executor (Engines Settings Sync)
 * @description
 * Binds change/input handlers for all settings controls in the Engines modal.
 * Each handler reads the new value from the DOM and immediately persists it
 * to the settings store via updateSetting().
 *
 * Covers: engine enable toggles, model selectors, background-removal toggles
 * and their model inputs (with mutual exclusion between PiAPI and Runware
 * remove-bg), LayerDiffuse toggle, and the test-prompt textarea.
 *
 * @api-declaration
 * bindSettingsSyncHandlers($modal) → void
 *
 * @contract
 *   assertions:
 *     purity: IO Executor
 *     state_ownership: []
 *     external_io: [DOM, settings.js, smartResize]
 */

import { updateSetting } from '../../../settings.js';
import { smartResize } from '../../../utils/dom.js';
import { DEFAULT_TEST_PROMPT } from '../../../defaults.js';

/**
 * Binds all settings-persistence handlers to the engines modal.
 * @param {jQuery} $modal - The #plz-engines-overlay element.
 */
export function bindSettingsSyncHandlers($modal) {

    // ── Engine Enable Toggles ──────────────────────────────────────────────────
    $modal.on('change', '#plz-eng-pol-enabled',     function () { updateSetting('engineEnablePollinations', $(this).prop('checked')); });
    $modal.on('change', '#plz-eng-fal-enabled',     function () { updateSetting('engineEnableFal',         $(this).prop('checked')); });
    $modal.on('change', '#plz-eng-piapi-enabled',   function () { updateSetting('engineEnablePiAPI',       $(this).prop('checked')); });
    $modal.on('change', '#plz-eng-runware-enabled', function () { updateSetting('engineEnableRunware',     $(this).prop('checked')); });

    // ── Model Selectors ────────────────────────────────────────────────────────
    $modal.on('change', '#plz-eng-pol-model',     function () { updateSetting('imageModel',    $(this).val()); });
    $modal.on('change', '#plz-eng-fal-model',     function () { updateSetting('falModel',      $(this).val()); });
    $modal.on('change', '#plz-eng-piapi-model',   function () { updateSetting('piapiModel',    $(this).val()); });
    $modal.on('change', '#plz-eng-runware-model', function () { updateSetting('runwareModel',  $(this).val()); });

    // ── Remove-Background (mutual exclusion: PiAPI ↔ Runware) ─────────────────
    $modal.on('change', '#plz-eng-piapi-rmbg', function () {
        const enabled = $(this).prop('checked');
        updateSetting('piapiRemoveBackground', enabled);
        $('#plz-eng-piapi-rmbg-model').prop('disabled', !enabled);
        if (enabled) $('#plz-eng-runware-rmbg').prop('checked', false).trigger('change');
    });

    $modal.on('change', '#plz-eng-runware-rmbg', function () {
        const enabled = $(this).prop('checked');
        updateSetting('runwareRemoveBackground', enabled);
        $('#plz-eng-runware-rmbg-model').prop('disabled', !enabled);
        if (enabled) $('#plz-eng-piapi-rmbg').prop('checked', false).trigger('change');
    });

    $modal.on('change', '#plz-eng-piapi-rmbg-model',   function () { updateSetting('piapiRmbgModel',         $(this).val()); });
    $modal.on('change', '#plz-eng-runware-rmbg-model',  function () { updateSetting('runwareRmbgModel',       $(this).val()); });
    $modal.on('change', '#plz-eng-runware-layerdiffuse',function () { updateSetting('runwareUseLayerDiffuse', $(this).prop('checked')); });

    // ── Test Prompt ────────────────────────────────────────────────────────────
    $modal.on('input', '#plz-eng-test-prompt', function () {
        smartResize(this);
        updateSetting('testPrompt', $(this).val());
    });

    $modal.on('click', '#plz-eng-test-prompt-reset', () => {
        const $area = $('#plz-eng-test-prompt').val(DEFAULT_TEST_PROMPT);
        smartResize($area[0]);
        updateSetting('testPrompt', DEFAULT_TEST_PROMPT);
    });
}
