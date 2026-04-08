/**
 * @file data/default-user/extensions/personalyze/ui/settings/panel.js
 * @stamp {"utc":"2026-04-07T15:00:00.000Z"}
 * @architectural-role UI Orchestrator (Settings)
 * @description
 * Main orchestrator for the Personalyze extensions settings panel.
 * 
 * Manages the lifecycle of the settings UI, coordinating profile 
 * management, AI connections, and prompt configuration.
 *
 * @api-declaration
 * injectSettingsPanel() — Main entry point to build and bind the panel.
 *
 * @contract
 *   assertions:
 *     purity: Stateful UI Orchestrator
 *     state_ownership: [extension_settings.personalyze.activeState]
 *     external_io: [DOM, settings.js, enginesModal.js, workshop/core.js]
 */

import { callPopup } from '../../../../../../script.js';
import { getSettings, getMetaSettings, updateSetting } from '../../settings.js';
import { setPortraitPosition } from '../../portrait.js';
import { setVnPanelEnabled } from '../vnPanel.js';
import { openWorkshop } from '../workshop/core.js';
import { log, setVerbose } from '../../utils/logger.js';
import { getLogs, getWorkshopLogs } from '../../utils/callLog.js';

// Sub-system imports
import { buildPanelHTML } from './templates.js';
import { openPromptModal } from './prompts.js';
import { bindProfileHandlers, refreshProfileDropdown, updateDirtyIndicator } from '../panel/profiles.js';
import { refreshConnectionDropdowns } from '../panel/connection.js';
import { refreshModelDropdown } from '../panel/models.js';
import { openEnginesModal, injectEnginesModal } from '../enginesModal.js';

import {
    DEFAULT_SUBJECT_MATCH_PROMPT,
    DEFAULT_SUBJECT_LIST_PROMPT,
    DEFAULT_CHANGE_CHECK_PROMPT,
    DEFAULT_COMBINED_CLASSIFIER_PROMPT,
    DEFAULT_OUTFIT_DESCRIBER_PROMPT,
    DEFAULT_VN_STYLE_SUFFIX,
} from '../../defaults.js';

const PANEL_ID = 'plz-settings';

const PROMPT_TITLES = {
    subjectMatchPrompt:         'Step 1 — Subject Match (YES/NO)',
    subjectListPrompt:          'Step 2 — Subject From List',
    changeCheckPrompt:          'Step 2.9 — Change Check (YES/NO)',
    combinedClassifierPrompt:   'Step 3 — Combined Classifier',
    outfitDescriberPrompt:      'Describer — New Outfit Discovery',
    vnStyleSuffix:              'Portrait Image Prompt Template',
};

const PROMPT_DEFAULTS = {
    subjectMatchPrompt:         DEFAULT_SUBJECT_MATCH_PROMPT,
    subjectListPrompt:          DEFAULT_SUBJECT_LIST_PROMPT,
    changeCheckPrompt:          DEFAULT_CHANGE_CHECK_PROMPT,
    combinedClassifierPrompt:   DEFAULT_COMBINED_CLASSIFIER_PROMPT,
    outfitDescriberPrompt:      DEFAULT_OUTFIT_DESCRIBER_PROMPT,
    vnStyleSuffix:              DEFAULT_VN_STYLE_SUFFIX,
};

// ─── UI Refresh ───────────────────────────────────────────────────────────────

function refreshUI() {
    const s = getSettings();

    $(`#plz-enabled`).prop('checked', s.enabled);
    $(`#plz-vn-mode`).prop('checked', s.plzVnMode);
    $(`#plz-dev-mode`).prop('checked', s.devMode);
    $(`#plz-verbose-logging`).prop('checked', s.verboseLogging);
    $(`#plz-portrait-position`).val(s.portraitPosition);

    $(`.plz-history-input`).each(function () {
        const key = $(this).data('history-key');
        $(this).val(s[key] ?? 0);
    });

    refreshConnectionDropdowns(() => updateDirtyIndicator());
    updateDirtyIndicator();

    setPortraitPosition(s.portraitPosition);
    setVerbose(s.verboseLogging);
}

// ─── Event Bindings ───────────────────────────────────────────────────────────

function bindHandlers() {
    const $panel = $(`#${PANEL_ID}`);

    bindProfileHandlers($panel, refreshUI);

    $panel.on('change', '#plz-enabled', function () {
        updateSetting('enabled', $(this).prop('checked'));
        updateDirtyIndicator();
    });

    $panel.on('change', '#plz-vn-mode', function () {
        const val = $(this).prop('checked');
        updateSetting('plzVnMode', val);
        setVnPanelEnabled(val);
        updateDirtyIndicator();
    });

    $panel.on('change', '#plz-portrait-position', function () {
        const val = $(this).val();
        updateSetting('portraitPosition', val);
        setPortraitPosition(val);
        updateDirtyIndicator();
    });

    $panel.on('change', '#plz-dev-mode', function () {
        updateSetting('devMode', $(this).prop('checked'));
        updateDirtyIndicator();
    });

    $panel.on('change', '#plz-verbose-logging', function () {
        const enabled = $(this).prop('checked');
        updateSetting('verboseLogging', enabled);
        setVerbose(enabled);
        updateDirtyIndicator();
    });

    $panel.on('input', '.plz-history-input', function () {
        const key = $(this).data('history-key');
        const val = Math.max(0, parseInt($(this).val()) || 0);
        updateSetting(key, val);
        updateDirtyIndicator();
    });

    $panel.on('click', '#plz-open-engines', () => openEnginesModal());

    $panel.on('click', '.plz-open-prompt', async function () {
        const key = $(this).data('prompt-key');
        await openPromptModal(key, PROMPT_TITLES[key], PROMPT_DEFAULTS[key]);
        updateDirtyIndicator();
    });

    $panel.on('click', '#plz-open-workshop', () => openWorkshop('dna'));

    $panel.on('click', '#plz-view-logs', async function () {
        const { buildLogModalHTML } = await import('./templates.js'); // Assuming log builder moved here for LOC
        await callPopup(buildLogModalHTML(getLogs(), getWorkshopLogs()), 'text');
    });
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

export function injectSettingsPanel() {
    if ($(`#${PANEL_ID}`).length) return;

    const $parent = $('#extensions_settings');
    if (!$parent.length) return;

    const settings = getSettings();
    const meta     = getMetaSettings();
    const profiles = Object.keys(meta.profiles);

    $parent.append(buildPanelHTML(settings, meta, profiles));
    injectEnginesModal();

    bindHandlers();
    refreshUI();
    refreshProfileDropdown();

    refreshModelDropdown(settings.imageModel);

    log('Panel', 'Settings panel initialized.');
}