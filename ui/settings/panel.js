/**
 * @file data/default-user/extensions/personalyze/ui/settings/panel.js
 * @stamp {"utc":"2026-04-11T11:10:00.000Z"}
 * @architectural-role UI Orchestrator (Settings)
 * @description
 * Main orchestrator for the Personalyze extensions settings panel.
 * Coordinates profile management, Dual-Model routing, and the 3-Phase prompt editor.
 *
 * Updated to persist the current style selection across refreshes.
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

import { getSettings, getMetaSettings, updateSetting } from '../../settings.js';
import { setPortraitPosition } from '../../portrait.js';
import { setVnPanelEnabled } from '../vnPanel.js';
import { openWorkshop } from '../workshop/core.js';
import { log, setVerbose } from '../../utils/logger.js';
import { getLogs, getWorkshopLogs } from '../../utils/callLog.js';

// Sub-system imports
import { buildPanelHTML, buildLogModalHTML } from './templates.js';
import { openPromptModal, openStyleModal } from './prompts.js';
import { bindProfileHandlers, refreshProfileDropdown, updateDirtyIndicator } from '../panel/profiles.js';
import { refreshConnectionDropdowns } from '../panel/connection.js';
import { refreshModelDropdown } from '../panel/models.js';
import { openEnginesModal, injectEnginesModal } from '../enginesModal.js';

import {
    PHASE_1_SUBJECT_PROMPT,
    PHASE_2_CHANGE_PROMPT,
    PHASE_3_LAYERED_PROMPT,
    ANCHOR_SCAN_PROMPT,
    SCENE_CHANGE_PROMPT,
    WARDROBE_VALIDITY_PROMPT,
    REDRESS_PROMPT,
    FORCE_COSTUME_PROMPT,
} from '../../logic/prompts.js';
import { DEFAULT_VN_STYLE_SUFFIX } from '../../defaults.js';
import { callPopup, saveSettingsDebounced } from '../../../../../../script.js';

const PANEL_ID = 'plz-settings';

const PROMPT_TITLES = {
    phase1SubjectPrompt:        'Phase 1 — Subject Identification',
    phase2ChangePrompt:         'Phase 2 — Visual Change Gate',
    phase3LayeredPrompt:        'Phase 3 — Layered State Extraction',
    anchorScanPrompt:           'Character Identity Anchor Scan',
    sceneChangePrompt:          'Scene — Location Change Detection',
    wardrobeValidityPrompt:     'Scene — Wardrobe Validity Gate',
    redressPrompt:              'Scene — Character Redress',
    forceCostumePrompt:         'Workshop — Force Costume Extraction',
    forceCostumeHintTemplate:   'Workshop — Force Costume Hint Template',
    vnStyleSuffix:              'Portrait Style Template'
};

const PROMPT_DEFAULTS = {
    phase1SubjectPrompt:        PHASE_1_SUBJECT_PROMPT,
    phase2ChangePrompt:         PHASE_2_CHANGE_PROMPT,
    phase3LayeredPrompt:        PHASE_3_LAYERED_PROMPT,
    anchorScanPrompt:           ANCHOR_SCAN_PROMPT,
    sceneChangePrompt:          SCENE_CHANGE_PROMPT,
    wardrobeValidityPrompt:     WARDROBE_VALIDITY_PROMPT,
    redressPrompt:              REDRESS_PROMPT,
    forceCostumePrompt:         FORCE_COSTUME_PROMPT,
    forceCostumeHintTemplate:   'KEYWORD GUIDANCE: {{hint}}\nFocus specifically on elements matching this hint.',
    vnStyleSuffix:              DEFAULT_VN_STYLE_SUFFIX
};

// ─── UI Refresh ───────────────────────────────────────────────────────────────

function refreshUI() {
    const s = getSettings();

    $(`#plz-enabled`).prop('checked', s.enabled);
    $(`#plz-vn-mode`).prop('checked', s.plzVnMode);
    $(`#plz-dev-mode`).prop('checked', s.devMode);
    $(`#plz-verbose-logging`).prop('checked', s.verboseLogging);
    $(`#plz-portrait-position`).val(s.portraitPosition);
    $(`#plz-portrait-status`).prop('checked', s.showPortraitStatus);

    $(`.plz-history-input`).each(function () {
        const key = $(this).data('history-key');
        $(this).val(s[key] ?? 0);
    });

    refreshConnectionDropdowns(() => updateDirtyIndicator());
    refreshStyleDropdown();
    updateDirtyIndicator();

    setPortraitPosition(s.portraitPosition);
    setVerbose(s.verboseLogging);
}

// ─── Style Library Helpers ────────────────────────────────────────────────────

function refreshStyleDropdown() {
    const meta = getMetaSettings();
    const s = getSettings();
    const lib = meta.styleLibrary ?? {};
    const defaultName = meta.defaultStyleName ?? '';
    
    // Fallback: if remembered style no longer exists, use the default.
    const activeName = (s.currentStyleName && lib[s.currentStyleName]) 
        ? s.currentStyleName 
        : defaultName;

    const $sel = $('#plz-style-select');
    if (!$sel.length) return;

    $sel.empty();
    for (const name of Object.keys(lib)) {
        const text = name + (name === defaultName ? ' ⭐' : '');
        $sel.append($('<option>').val(name).text(text));
    }
    
    $sel.val(activeName);
    $('#plz-style-edit').text(`✏️ Edit "${activeName}"`);
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

    $panel.on('change', '#plz-portrait-status', function () {
        updateSetting('showPortraitStatus', $(this).prop('checked'));
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

    // ─── Style Library ───────────────────────────────────────────────────────
    $panel.on('change', '#plz-style-select', function () {
        const val = $(this).val();
        updateSetting('currentStyleName', val);
        $('#plz-style-edit').text(`✏️ Edit "${val}"`);
        updateDirtyIndicator();
    });

    $panel.on('click', '#plz-style-edit', async function () {
        const name = $('#plz-style-select').val();
        if (!name) return;
        await openStyleModal(name);
    });

    $panel.on('click', '#plz-style-star', function () {
        const meta = getMetaSettings();
        const name = $('#plz-style-select').val();
        if (!name) return;
        meta.defaultStyleName = name;
        saveSettingsDebounced();
        refreshStyleDropdown();
        if (window.toastr) window.toastr.success(`"${name}" set as global default style.`, 'PersonaLyze');
    });

    $panel.on('click', '#plz-style-add', async function () {
        const meta = getMetaSettings();
        const rawName = await callPopup('<h3>New style name</h3>', 'input', '');
        const name = (rawName ?? '').trim();
        if (!name) return;
        if (meta.styleLibrary[name]) {
            if (window.toastr) window.toastr.warning(`Style "${name}" already exists.`);
            return;
        }
        const sourceName = $('#plz-style-select').val();
        meta.styleLibrary[name] = meta.styleLibrary[sourceName] ?? '';
        saveSettingsDebounced();
        refreshStyleDropdown();
        $('#plz-style-select').val(name).trigger('change');
    });

    $panel.on('click', '#plz-style-delete', async function () {
        const meta = getMetaSettings();
        const name = $('#plz-style-select').val();
        if (!name) return;
        if (Object.keys(meta.styleLibrary).length <= 1) {
            if (window.toastr) window.toastr.warning('Cannot delete the only style.');
            return;
        }
        const confirmed = await callPopup(`<h3>Delete style "${name}"?</h3>Characters pinned to it will fall back to the default.`, 'confirm');
        if (!confirmed) return;
        delete meta.styleLibrary[name];
        if (meta.defaultStyleName === name) {
            meta.defaultStyleName = Object.keys(meta.styleLibrary)[0] ?? '';
        }
        // If we deleted the style we were currently using, revert setting to default.
        const s = getSettings();
        if (s.currentStyleName === name) {
            updateSetting('currentStyleName', meta.defaultStyleName);
        }
        saveSettingsDebounced();
        refreshStyleDropdown();
    });

    $panel.on('click', '.plz-open-prompt', async function () {
        const key = $(this).data('prompt-key');
        const title = PROMPT_TITLES[key];
        const def = PROMPT_DEFAULTS[key];
        await openPromptModal(key, title, def);
        updateDirtyIndicator();
    });

    $panel.on('click', '#plz-open-workshop', () => openWorkshop('dna'));

    $panel.on('click', '#plz-view-logs', async function () {
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
    refreshStyleDropdown();

    refreshModelDropdown(settings.imageModel);

    log('Panel', 'Settings panel initialized.');
}