/**
 * @file data/default-user/extensions/personalyze/ui/panel.js
 * @stamp {"utc":"2026-04-06T00:00:00.000Z"}
 * @architectural-role UI Orchestrator (Settings)
 * @description
 * Main orchestrator for the PersonaLyze extensions settings panel.
 * 
 * Responsibilities:
 * - Injects the panel HTML (via templates.js).
 * - Binds profile management (via profiles.js).
 * - Binds ST connections (via connection.js).
 * - Manages global settings toggles and numerical inputs.
 * - Handles the multi-line Prompt Editor modal with unlimited auto-resize.
 * - Delegates engine/key/model configuration to the Engines Modal (enginesModal.js).
 * - Triggers dynamic model discovery for Pollinations (via models.js).
 *
 * @api-declaration
 * injectSettingsPanel() — Builds and appends the panel and binds all sub-systems.
 *
 * @contract
 *   assertions:
 *     purity: Stateful UI Orchestrator
 *     state_ownership: [extension_settings.personalyze.activeState]
 *     external_io: [DOM, callPopup, smartResize, settings.js, enginesModal.js]
 */

import { callPopup } from '../../../../../script.js';
import { getSettings, getMetaSettings, updateSetting, SETTINGS_DEFAULTS } from '../settings.js';
import { setPortraitPosition } from '../portrait.js';
import { setVnPanelEnabled } from './vnPanel.js';
import { handleOpenWorkshop, handleOpenRegister } from '../logic/characterWorkshop.js';
import { log, setVerbose } from '../utils/logger.js';
import { getLogs, getWorkshopLogs } from '../utils/callLog.js';
import { smartResize } from '../utils/dom.js';

// Sub-system imports
import { buildPanelHTML } from './panel/templates.js';
import { bindProfileHandlers, refreshProfileDropdown, updateDirtyIndicator } from './panel/profiles.js';
import { refreshConnectionDropdowns } from './panel/connection.js';
import { openEnginesModal, injectEnginesModal } from './enginesModal.js';
import { refreshModelDropdown } from './panel/models.js';

import {
    DEFAULT_SUBJECT_MATCH_PROMPT,
    DEFAULT_SUBJECT_LIST_PROMPT,
    DEFAULT_CHANGE_CHECK_PROMPT,
    DEFAULT_COMBINED_CLASSIFIER_PROMPT,
    DEFAULT_OUTFIT_DESCRIBER_PROMPT,
    DEFAULT_EXPRESSION_DESCRIBER_PROMPT,
    DEFAULT_VN_STYLE_SUFFIX,
} from '../defaults.js';

const PANEL_ID = 'plz-settings';

const PROMPT_TITLES = {
    subjectMatchPrompt:         'Step 1 — Subject Match (YES/NO)',
    subjectListPrompt:          'Step 2 — Subject From List',
    changeCheckPrompt:          'Step 2.9 — Change Check (YES/NO)',
    combinedClassifierPrompt:   'Step 3 — Combined Classifier',
    outfitDescriberPrompt:      'Describer — New Outfit',
    expressionDescriberPrompt:  'Describer — New Expression',
    vnStyleSuffix:              'Portrait Image Prompt Template',
};

const PROMPT_DEFAULTS = {
    subjectMatchPrompt:         DEFAULT_SUBJECT_MATCH_PROMPT,
    subjectListPrompt:          DEFAULT_SUBJECT_LIST_PROMPT,
    changeCheckPrompt:          DEFAULT_CHANGE_CHECK_PROMPT,
    combinedClassifierPrompt:   DEFAULT_COMBINED_CLASSIFIER_PROMPT,
    outfitDescriberPrompt:      DEFAULT_OUTFIT_DESCRIBER_PROMPT,
    expressionDescriberPrompt:  DEFAULT_EXPRESSION_DESCRIBER_PROMPT,
    vnStyleSuffix:              DEFAULT_VN_STYLE_SUFFIX,
};

// ─── UI Refresh ───────────────────────────────────────────────────────────────

/**
 * Re-populates all inputs in the panel to match the current activeState.
 * Called when switching profiles or on initial load.
 */
function refreshUI() {
    const s = getSettings();

    // 1. Toggles & Selects
    $(`#plz-enabled`).prop('checked', s.enabled);
    $(`#plz-vn-mode`).prop('checked', s.plzVnMode);
    $(`#plz-dev-mode`).prop('checked', s.devMode);
    $(`#plz-verbose-logging`).prop('checked', s.verboseLogging);
    $(`#plz-portrait-position`).val(s.portraitPosition);

    // 2. Numerical Inputs
    $(`.plz-history-input`).each(function () {
        const key = $(this).data('history-key');
        $(this).val(s[key] ?? 0);
    });

    // 3. Sub-modules
    refreshConnectionDropdowns(() => updateDirtyIndicator());
    updateDirtyIndicator();

    // 4. Side Effects
    setPortraitPosition(s.portraitPosition);
    setVerbose(s.verboseLogging);
}

// ─── Event Bindings ───────────────────────────────────────────────────────────

function bindHandlers() {
    const $panel = $(`#${PANEL_ID}`);

    // 1. Profile Bar (CNZ Logic)
    bindProfileHandlers($panel, refreshUI);

    // 2. Global Toggles
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

    // 3. Image & Logging
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

    // 4. Numerical History
    $panel.on('input', '.plz-history-input', function () {
        const key = $(this).data('history-key');
        const val = Math.max(0, parseInt($(this).val()) || 0);
        updateSetting(key, val);
        updateDirtyIndicator();
    });

    // 5. Engines Modal (Refactored logic)
    $panel.on('click', '#plz-open-engines', () => openEnginesModal());

    // 6. Prompt Editor
    $panel.on('click', '.plz-open-prompt', async function () {
        const key          = $(this).data('prompt-key');
        const title        = PROMPT_TITLES[key]   ?? key;
        const defaultValue = PROMPT_DEFAULTS[key] ?? '';
        const current      = getSettings()[key]   ?? defaultValue;

        $('body').addClass('plz-modal-open');
        const popupPromise = callPopup(
            `<h3>${title}</h3>
             <textarea id="plz-prompt-editor" class="text_pole plz-auto-textarea" rows="10"
                       style="width:100%;font-family:monospace;font-size:0.85em;overflow:hidden;"
                       spellcheck="false">${current.replace(/</g, '&lt;')}</textarea>
             <div style="margin-top:8px;display:flex;gap:8px;">
                 <button class="menu_button" id="plz-prompt-reset"
                         style="font-size:0.8em;">Reset to Default</button>
             </div>`,
            'confirm',
        );

        const triggerResize = () => {
            const el = document.getElementById('plz-prompt-editor');
            if (el) smartResize(el);
        };
        requestAnimationFrame(() => {
            triggerResize();
            setTimeout(triggerResize, 50);
        });

        $(document).on('input', '#plz-prompt-editor', function() {
            smartResize(this);
        });

        $(document).on('click', '#plz-prompt-reset', () => {
            const $editor = $('#plz-prompt-editor');
            $editor.val(defaultValue);
            smartResize($editor[0]);
        });

        const result = await popupPromise;

        if (result) {
            const newValue = $('#plz-prompt-editor').val();
            if (Object.prototype.hasOwnProperty.call(SETTINGS_DEFAULTS, key)) {
                updateSetting(key, newValue);
                updateDirtyIndicator();
            }
        }

        $(document).off('input', '#plz-prompt-editor');
        $(document).off('click', '#plz-prompt-reset');
        $('body').removeClass('plz-modal-open');
    });

    // 7. Workshop Links
    $panel.on('click', '#plz-open-workshop', () => handleOpenWorkshop());
    $panel.on('click', '#plz-open-register', () => handleOpenRegister());

    // 8. Call Log Viewer
    $panel.on('click', '#plz-view-logs', async function () {
        $('body').addClass('plz-modal-open');
        const popupPromise = callPopup(buildLogModalHTML(), 'text');

        $(document).on('click.plz-logs', '.plz-log-toggle', function () {
            const $body     = $(this).next('.plz-log-body');
            const expanding = $body.hasClass('plz-hidden');
            $body.toggleClass('plz-hidden');
            $(this).find('.plz-log-arrow').text(expanding ? '▼' : '▶');
            if (expanding) {
                $body.find('textarea').each(function () { smartResize(this); });
            }
        });

        $(document).on('click.plz-logs', '.plz-log-copy', function () {
            const text = $(this).closest('.plz-log-field').find('textarea').val();
            navigator.clipboard.writeText(text).then(() => {
                const $btn = $(this);
                $btn.text('Copied!');
                setTimeout(() => $btn.text('Copy'), 1500);
            }).catch(() => {});
        });

        await popupPromise;
        $(document).off('.plz-logs');
        $('body').removeClass('plz-modal-open');
    });
}

// ─── Log Modal Builder ────────────────────────────────────────────────────────

function buildLogModalHTML() {
    const pipelineTurns = getLogs();
    const workshopTurns = getWorkshopLogs();

    function esc(str) {
        return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function relTime(ts) {
        const s = Math.floor((Date.now() - ts) / 1000);
        if (s < 5)    return 'just now';
        if (s < 60)   return `${s}s ago`;
        if (s < 3600) return `${Math.floor(s / 60)}m ago`;
        return `${Math.floor(s / 3600)}h ago`;
    }

    function fieldBox(label, content) {
        if (content === null) return '';
        return `
        <div class="plz-log-field" style="margin-bottom:8px;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:3px;">
                <span style="font-size:0.76em; opacity:0.55; text-transform:uppercase; letter-spacing:0.05em;">${label}</span>
                <button class="menu_button plz-log-copy" style="font-size:0.73em; padding:1px 6px;">Copy</button>
            </div>
            <textarea class="text_pole" readonly rows="3"
                      style="width:100%; font-family:monospace; font-size:0.78em; overflow:hidden; resize:none;"
                      >${esc(content)}</textarea>
        </div>`;
    }

    function buildTurnHTML(turn) {
        const callsHTML = turn.calls.map(call => `
        <div style="border-top:1px solid var(--SmartThemeBorderColor,#444);">
            <button class="plz-log-toggle"
                    style="width:100%; text-align:left; padding:7px 12px; background:none; border:none; cursor:pointer; font-size:0.86em; color:inherit; display:flex; align-items:center; gap:6px;">
                <span class="plz-log-arrow" style="font-size:0.8em; opacity:0.7;">▶</span>
                <span>${esc(call.label)}</span>
                <span style="opacity:0.45; font-size:0.8em; margin-left:auto;">${relTime(call.timestamp)}</span>
                ${call.error ? '<span style="color:#e05555; font-size:0.78em; margin-left:6px;">error</span>' : ''}
            </button>
            <div class="plz-log-body plz-hidden" style="padding:0 12px 10px;">
                ${fieldBox('Prompt', call.prompt)}
                ${call.response !== null ? fieldBox('Response', call.response) : ''}
                ${call.error    !== null ? fieldBox('Error',    call.error)    : ''}
            </div>
        </div>`).join('');

        return `
        <div style="border:1px solid var(--SmartThemeBorderColor,#555); border-radius:6px; overflow:hidden; margin-bottom:10px;">
            <div style="background:rgba(255,255,255,0.04); padding:7px 12px; font-size:0.82em; display:flex; align-items:center; gap:8px;">
                <strong>${esc(turn.label)}</strong>
                <span style="opacity:0.5;">·</span>
                <span style="opacity:0.6;">${turn.calls.length} call${turn.calls.length !== 1 ? 's' : ''}</span>
                <span style="opacity:0.5; margin-left:auto;">${relTime(turn.timestamp)}</span>
            </div>
            ${callsHTML}
        </div>`;
    }

    function buildSection(title, subtitle, turns) {
        const body = turns.length
            ? [...turns].reverse().map(buildTurnHTML).join('')
            : `<p style="opacity:0.5; font-size:0.85em; margin:8px 0;">No calls logged yet.</p>`;
        return `
        <div style="margin-bottom:20px;">
            <div style="display:flex; align-items:baseline; gap:8px; margin-bottom:8px; padding-bottom:6px; border-bottom:1px solid var(--SmartThemeBorderColor,#444);">
                <strong style="font-size:0.95em;">${title}</strong>
                <span style="font-size:0.78em; opacity:0.5;">${subtitle}</span>
            </div>
            ${body}
        </div>`;
    }

    return `<h3 style="margin:0 0 14px;">AI Call Log</h3>
    <div style="max-height:65vh; overflow-y:auto;">
        ${buildSection('Pipeline', 'last 2 turn pairs', pipelineTurns)}
        ${buildSection('Workshop', 'last 3 queries', workshopTurns)}
    </div>`;
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

    // Fetch dynamic models in the background
    refreshModelDropdown(settings.imageModel);

    log('Panel', 'Settings panel refactored and injected.');
}