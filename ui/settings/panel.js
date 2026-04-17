/**
 * @file data/default-user/extensions/personalyze/ui/settings/panel.js
 * @stamp {"utc":"2026-04-19T14:30:00.000Z"}
 * @architectural-role UI Orchestrator (Settings)
 * @description
 * Main orchestrator for the Personalyze extension settings panel.
 * Coordinates profile management and forensic observability via the flight recorder.
 * 
 * Updated for Dynamic Blueprint Architecture:
 * 1. Removed monolithic Schema Editor logic (now handled in Model Manager).
 *
 * @api-declaration
 * injectSettingsPanel() — Main entry point to build and bind the panel.
 *
 * @contract
 *   assertions:
 *     purity: Stateful UI Orchestrator
 *     state_ownership: [extension_settings.personalyze.activeState]
 *     external_io: [DOM, settings.js, enginesModal.js, callLog.js, state.js]
 */

import { getSettings, getMetaSettings, updateSetting } from '../../settings.js';
import { state, removeFromFileIndex } from '../../state.js';
import { setVnPanelEnabled, syncVnState } from '../vnPanel.js';
import { openWorkshop } from '../workshop/core.js';
import { log, setVerbose } from '../../utils/logger.js';
import { getLogs, getWorkshopLogs, getSystemLogs } from '../../utils/callLog.js';
import { flushAllImages, flushChatImages } from '../../imageCache.js';
import { smartResize } from '../../utils/dom.js';
import { callPopup } from '../../../../../../script.js';

// Sub-system imports
import { buildPanelHTML, buildLogModalHTML } from './templates.js';
import { openPromptModal } from './prompts.js';
import { bindProfileHandlers, refreshProfileDropdown, updateDirtyIndicator } from '../panel/profiles.js';
import { refreshConnectionDropdowns } from '../panel/connection.js';
import { refreshModelDropdown } from '../panel/models.js';
import { openEnginesModal, injectEnginesModal } from '../enginesModal.js';

const PANEL_ID = 'plz-settings';

// ─── UI Refresh ───────────────────────────────────────────────────────────────

function refreshUI() {
    const s = getSettings();

    $(`#plz-enabled`).prop('checked', s.enabled);
    $(`#plz-vn-mode`).prop('checked', s.plzVnMode);
    $(`#plz-dev-mode`).prop('checked', s.devMode);
    $(`#plz-verbose-logging`).prop('checked', s.verboseLogging);
    $(`#plz-portrait-status`).prop('checked', s.showPortraitStatus);
    
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
        const isEnabled = $(this).prop('checked');
        updateSetting('enabled', isEnabled);

        syncVnState();
        document.dispatchEvent(new CustomEvent('plz:roster-changed'));
    });
    
    $panel.on('change', '#plz-vn-mode', function () {
        const val = $(this).prop('checked');
        updateSetting('plzVnMode', val);
        setVnPanelEnabled(val);
    });

    $panel.on('change', '#plz-portrait-status', () => updateSetting('showPortraitStatus', $('#plz-portrait-status').prop('checked')));
    $panel.on('change', '#plz-max-resolution', () => updateSetting('maxResolution', $('#plz-max-resolution').val()));
    $panel.on('change', '#plz-dynamic-resolution', () => updateSetting('dynamicResolution', $('#plz-dynamic-resolution').prop('checked')));
    $panel.on('change', '#plz-keep-cache', () => updateSetting('keepCache', $('#plz-keep-cache').prop('checked')));

    $panel.on('click', '#plz-purge-chat', async function() {
        const roster = state.activeRoster;
        if (!roster.length) return window.toastr?.info('Roster is empty.');
        if (await callPopup('Delete portraits for characters currently on screen?', 'confirm')) {
            const deleted = await flushChatImages(roster);
            removeFromFileIndex(deleted);
            document.dispatchEvent(new CustomEvent('plz:roster-render-req'));
        }
    });

    $panel.on('click', '#plz-purge-all', async function() {
        if (await callPopup('Delete EVERY generated portrait across all chats?', 'confirm')) {
            const deleted = await flushAllImages();
            removeFromFileIndex(deleted);
            document.dispatchEvent(new CustomEvent('plz:roster-render-req'));
        }
    });

    $panel.on('change', '#plz-dev-mode', () => updateSetting('devMode', $('#plz-dev-mode').prop('checked')));
    $panel.on('change', '#plz-verbose-logging', function () {
        const val = $(this).prop('checked');
        updateSetting('verboseLogging', val);
        setVerbose(val);
    });

    $panel.on('input', '.plz-history-input', function () {
        updateSetting($(this).data('history-key'), Math.max(0, parseInt($(this).val()) || 0));
    });

    $panel.on('click', '#plz-open-engines', () => openEnginesModal());
    $panel.on('click', '#plz-open-workshop', () => openWorkshop('dna'));

    $panel.on('click', '.plz-open-prompt', async function () {
        const key = $(this).data('prompt-key');
        await openPromptModal(key, key, ''); 
        updateDirtyIndicator();
    });

    $panel.on('click', '#plz-view-logs', async function () {
        const html = buildLogModalHTML(getLogs(), getWorkshopLogs(), getSystemLogs());
        await callPopup(html, 'text');
    });
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

export function injectSettingsPanel() {
    if ($(`#${PANEL_ID}`).length) return;
    const $parent = $('#extensions_settings');
    if (!$parent.length) return;

    const settings = getSettings();
    const meta     = getMetaSettings();
    $parent.append(buildPanelHTML(settings, meta, Object.keys(meta.profiles)));
    injectEnginesModal();
    bindHandlers();
    refreshUI();
    refreshProfileDropdown();
    refreshModelDropdown(settings.imageModel);
    log('Panel', 'Settings panel initialized with Forensic wiring.');
}