/**
 * @file data/default-user/extensions/personalyze/ui/settings/panel.js
 * @stamp {"utc":"2026-04-16T23:50:00.000Z"}
 * @architectural-role UI Orchestrator (Settings)
 * @description
 * Main orchestrator for the Personalyze extensions settings panel.
 * Coordinates profile management, Dual-Model routing, and the 3-Phase prompt editor.
 *
 * Updated for Style-Specific Render Pipeline:
 * 1. Removed Global Style management listeners (relocated to Workshop).
 * 2. Removed style-related UI refresh logic.
 *
 * @api-declaration
 * injectSettingsPanel() — Main entry point to build and bind the panel.
 *
 * @contract
 *   assertions:
 *     purity: Stateful UI Orchestrator
 *     state_ownership: [extension_settings.personalyze.activeState]
 *     external_io: [DOM, settings.js, enginesModal.js, imageCache.js, state.js]
 */

import { getSettings, getMetaSettings, updateSetting } from '../../settings.js';
import { state, removeFromFileIndex } from '../../state.js';
import { setVnPanelEnabled } from '../vnPanel.js';
import { openWorkshop } from '../workshop/core.js';
import { log, setVerbose } from '../../utils/logger.js';
import { getLogs, getWorkshopLogs } from '../../utils/callLog.js';
import { flushAllImages, flushChatImages } from '../../imageCache.js';

// Sub-system imports
import { buildPanelHTML, buildLogModalHTML } from './templates.js';
import { openPromptModal } from './prompts.js';
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
import { callPopup } from '../../../../../../script.js';

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
    $(`#plz-portrait-status`).prop('checked', s.showPortraitStatus);
    
    // Generation Economy
    $(`#plz-max-resolution`).val(s.maxResolution);
    $(`#plz-dynamic-resolution`).prop('checked', s.dynamicResolution);
    $(`#plz-keep-cache`).prop('checked', s.keepCache);

    $(`.plz-history-input`).each(function () {
        const key = $(this).data('history-key');
        $(this).val(s[key] ?? 0);
    });

    refreshConnectionDropdowns(() => updateDirtyIndicator());
    updateDirtyIndicator();

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

    $panel.on('change', '#plz-portrait-status', function () {
        updateSetting('showPortraitStatus', $(this).prop('checked'));
        updateDirtyIndicator();
    });

    // ─── Generation Economy Handlers ───
    $panel.on('change', '#plz-max-resolution', function() {
        updateSetting('maxResolution', $(this).val());
        updateDirtyIndicator();
    });

    $panel.on('change', '#plz-dynamic-resolution', function() {
        updateSetting('dynamicResolution', $(this).prop('checked'));
        updateDirtyIndicator();
    });

    $panel.on('change', '#plz-keep-cache', function() {
        updateSetting('keepCache', $(this).prop('checked'));
        updateDirtyIndicator();
    });

    $panel.on('click', '#plz-purge-chat', async function() {
        const roster = state.activeRoster;
        if (!roster.length) {
            if (window.toastr) window.toastr.info('Roster is empty.', 'PersonaLyze');
            return;
        }

        const confirmed = await callPopup(
            `<h3>Purge Chat Assets</h3>` +
            `Delete all portraits generated for the <b>${roster.length}</b> character(s) currently on screen?<br><br>` +
            `<small>DNA history is preserved, but images will be removed from disk.</small>`,
            'confirm'
        );
        if (!confirmed) return;

        const deleted = await flushChatImages(roster);
        removeFromFileIndex(deleted);
        document.dispatchEvent(new CustomEvent('plz:roster-render-req'));
        if (window.toastr) window.toastr.success(`Purged ${deleted.length} images for this chat.`, 'PersonaLyze');
    });

    $panel.on('click', '#plz-purge-all', async function() {
        const confirmed = await callPopup(
            `<h3 style="color:var(--SmartThemeErrorColor);">Nuclear Purge</h3>` +
            `Delete <b>EVERY</b> portrait generated by PersonaLyze across all chats?<br><br>` +
            `This action is permanent and frees up maximum disk space.`,
            'confirm'
        );
        if (!confirmed) return;

        const deleted = await flushAllImages();
        removeFromFileIndex(deleted);
        document.dispatchEvent(new CustomEvent('plz:roster-render-req'));
        if (window.toastr) window.toastr.success(`Successfully deleted ${deleted.length} assets.`, 'PersonaLyze');
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

    refreshModelDropdown(settings.imageModel);

    log('Panel', 'Settings panel initialized.');
}