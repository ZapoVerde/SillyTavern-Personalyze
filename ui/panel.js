/**
 * @file data/default-user/extensions/personalyze/ui/panel.js
 * @stamp {"utc":"2026-04-04T00:00:00.000Z"}
 * @architectural-role UI (Settings Panel)
 * @description
 * Injects and manages the PersonaLyze settings panel in the SillyTavern
 * Extensions sidebar.
 *
 * The panel exposes:
 *   - Global enable/disable toggle
 *   - Portrait position selector (bottom-right / center-left)
 *   - Image model selector
 *   - Pollinations API key vault management
 *   - LLM connection profile overrides per pipeline step
 *   - History window size controls
 *   - Prompt override editors (via ST callPopup)
 *   - Link to the Portfolio Manager
 *
 * All inputs write through updateSetting() so settings.js remains the sole
 * owner of settings state.
 *
 * @api-declaration
 * injectSettingsPanel() — Builds and appends the panel HTML (idempotent).
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: []
 *     external_io: [#extensions_settings DOM, settings.js, vault helpers, portfolio.js]
 */

import { callPopup } from '../../../../../script.js';
import { writeSecret, secret_state } from '../../../../secrets.js';
import { ConnectionManagerRequestService } from '../../../shared.js';
import { getSettings, updateSetting, SETTINGS_DEFAULTS } from '../settings.js';
import { fetchPreviewBlob } from '../imageCache.js';
import { setPortraitPosition } from '../portrait.js';
import { handleOpenWorkshop, handleOpenRegister } from '../logic/characterWorkshop.js';
import { warn, error, log, setVerbose } from '../utils/logger.js';
import {
    DEFAULT_SUBJECT_MATCH_PROMPT,
    DEFAULT_SUBJECT_LIST_PROMPT,
    DEFAULT_CHANGE_CHECK_PROMPT,
    DEFAULT_COMBINED_CLASSIFIER_PROMPT,
    DEFAULT_OUTFIT_DESCRIBER_PROMPT,
    DEFAULT_EXPRESSION_DESCRIBER_PROMPT,
    DEFAULT_VN_STYLE_SUFFIX,
    DEFAULT_EXPRESSION_LABELS,
    POLLINATIONS_MODELS,
} from '../defaults.js';

const PANEL_ID        = 'plz-settings';
const SECRET_KEY_NAME = 'api_key_pollinations';

// ─── HTML Builders ────────────────────────────────────────────────────────────

function buildCallRow(id, label, promptKey, profileKey, historyKey, extraButtons = '') {
    const historyRow = historyKey ? `
        <div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
            <label style="font-size:0.85em;opacity:0.75;white-space:nowrap;">History:</label>
            <input id="plz-history-${id}" type="number" min="0" step="1"
                   class="text_pole plz-history-input" data-history-key="${historyKey}"
                   style="width:60px;" />
            <span style="font-size:0.83em;opacity:0.6;">pairs (0 = off)</span>
        </div>` : '';

    const editBtn = promptKey
        ? `<button class="menu_button plz-open-prompt" data-prompt-key="${promptKey}"
                   style="font-size:0.8em;padding:2px 8px;">Edit Prompt</button>`
        : '';

    return `
    <div class="plz-call-row" style="margin-bottom:14px;padding:12px;border:1px solid var(--SmartThemeBorderColor,#555);border-radius:6px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <strong style="font-size:0.9em;">${label}</strong>
            <div style="display:flex;gap:4px;">${editBtn}${extraButtons}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
            <label style="font-size:0.85em;opacity:0.75;white-space:nowrap;">Connection:</label>
            <select id="plz-profile-${id}" class="text_pole" style="flex:1;"
                    data-profile-key="${profileKey}"></select>
        </div>
        ${historyRow}
    </div>`;
}

function buildPanelHTML() {
    const modelOptions = POLLINATIONS_MODELS
        .map(m => `<option value="${m}">${m}</option>`)
        .join('');

    return `
    <div id="${PANEL_ID}" class="extension_settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b><i class="fa-solid fa-user"></i> PersonaLyze</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">

                <!-- Global Enable -->
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--SmartThemeBorderColor,#444);">
                    <label class="checkbox_label" style="font-size:0.9em;cursor:pointer;">
                        <input type="checkbox" id="plz-enabled" />
                        <span>Enable PersonaLyze</span>
                    </label>
                </div>

                <!-- Portrait Position -->
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--SmartThemeBorderColor,#444);">
                    <label style="font-size:0.85em;opacity:0.75;white-space:nowrap;min-width:110px;">Portrait Position</label>
                    <select id="plz-portrait-position" class="text_pole" style="flex:1;">
                        <option value="bottom-right">Bottom Right</option>
                        <option value="center-left">Center Left</option>
                    </select>
                </div>

                <!-- Pipeline Steps -->
                <p style="font-size:0.85em;opacity:0.7;margin:0 0 12px;">
                    Each pipeline step uses its own prompt and connection profile.
                    Leave connection blank to use the chat's active API.
                </p>

                ${buildCallRow('detection', 'Detection — Subject / Change / Classifier', null, 'detectionProfileId', 'detectionHistory', `
                    <button class="menu_button plz-open-prompt" data-prompt-key="subjectMatchPrompt"       style="font-size:0.75em;padding:2px 6px;">Subject?</button>
                    <button class="menu_button plz-open-prompt" data-prompt-key="subjectListPrompt"        style="font-size:0.75em;padding:2px 6px;">Who?</button>
                    <button class="menu_button plz-open-prompt" data-prompt-key="changeCheckPrompt"        style="font-size:0.75em;padding:2px 6px;">Changed?</button>
                    <button class="menu_button plz-open-prompt" data-prompt-key="combinedClassifierPrompt" style="font-size:0.75em;padding:2px 6px;">Classify</button>`)}
                ${buildCallRow('describer', 'Describer — New Outfit Description', 'outfitDescriberPrompt', 'describerProfileId', 'describerHistory')}

                <!-- Image Generation -->
                <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--SmartThemeBorderColor,#444);">
                    <strong style="font-size:0.95em;">Image Generation</strong>
                    <p style="font-size:0.83em;opacity:0.65;margin:4px 0 12px;">
                        Portraits are generated via Pollinations. Requires
                        <code>allowKeysExposure: true</code> in <code>config.yaml</code>.
                    </p>

                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                        <label style="font-size:0.85em;opacity:0.75;white-space:nowrap;min-width:80px;">API Key:</label>
                        <input type="password" id="plz-pollinations-key" class="text_pole"
                               placeholder="Enter new sk_ key…" style="flex:1;" />
                        <button class="menu_button" id="plz-pollinations-save" style="white-space:nowrap;">Save to Vault</button>
                    </div>
                    <div id="plz-key-status" style="font-size:0.82em;margin-left:88px;margin-bottom:10px;">
                        <span style="opacity:0.6;"><i class="fa-solid fa-spinner fa-spin"></i> Checking…</span>
                    </div>

                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                        <button class="menu_button" id="plz-pollinations-test">Test Connection</button>
                        <span id="plz-pollinations-status" style="font-size:0.82em;opacity:0.65;"></span>
                    </div>

                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                        <label style="font-size:0.85em;opacity:0.75;white-space:nowrap;min-width:80px;">Model:</label>
                        <select id="plz-image-model" class="text_pole" style="flex:1;">
                            ${modelOptions}
                        </select>
                    </div>

                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                        <label style="font-size:0.85em;opacity:0.75;white-space:nowrap;min-width:80px;">Style Suffix:</label>
                        <button class="menu_button plz-open-prompt" data-prompt-key="vnStyleSuffix"
                                style="font-size:0.8em;padding:2px 8px;">Edit Suffix</button>
                    </div>

                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                        <label class="checkbox_label" style="font-size:0.85em;cursor:pointer;">
                            <input type="checkbox" id="plz-dev-mode" />
                            <span>Dev mode</span>
                        </label>
                        <span style="font-size:0.78em;opacity:0.55;">Generates small preview images to save API credits</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <label class="checkbox_label" style="font-size:0.85em;cursor:pointer;">
                            <input type="checkbox" id="plz-verbose-logging" />
                            <span>Verbose logging</span>
                        </label>
                        <span style="font-size:0.78em;opacity:0.55;">Show [PLZ:*] info/warn output in the browser console</span>
                    </div>
                </div>

                <!-- Expression List -->
                <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--SmartThemeBorderColor,#444);display:flex;align-items:center;justify-content:space-between;">
                    <div>
                        <strong style="font-size:0.95em;">Expression List</strong>
                        <p style="font-size:0.83em;opacity:0.65;margin:3px 0 0;">
                            Labels the classifier picks from. Add custom entries for unusual characters.
                        </p>
                    </div>
                    <button class="menu_button" id="plz-edit-expressions" style="white-space:nowrap;flex-shrink:0;margin-left:12px;">
                        Edit List
                    </button>
                </div>

                <!-- Character Workshop -->
                <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--SmartThemeBorderColor,#444);display:flex;gap:8px;">
                    <button class="menu_button" id="plz-open-workshop" style="flex:1;">
                        <i class="fa-solid fa-user"></i> Character Workshop
                    </button>
                    <button class="menu_button" id="plz-open-register" style="flex:1;">
                        <i class="fa-solid fa-user-plus"></i> Register Character
                    </button>
                </div>

            </div>
        </div>
    </div>`;
}

// ─── Population ───────────────────────────────────────────────────────────────

function populateInputs() {
    const s = getSettings();

    $(`#${PANEL_ID} #plz-enabled`).prop('checked', s.enabled ?? true);
    $(`#${PANEL_ID} #plz-portrait-position`).val(s.portraitPosition ?? 'bottom-right');
    $(`#${PANEL_ID} #plz-image-model`).val(s.imageModel);
    $(`#${PANEL_ID} #plz-dev-mode`).prop('checked', s.devMode ?? false);
    $(`#${PANEL_ID} #plz-verbose-logging`).prop('checked', s.verboseLogging ?? false);

    $(`#${PANEL_ID} .plz-history-input`).each(function () {
        const key = $(this).data('history-key');
        $(this).val(s[key] ?? 0);
    });

    updateKeyStatusIndicator();
}

function initConnectionDropdowns() {
    const s = getSettings();
    const dropdowns = [
        { id: '#plz-profile-detection', key: 'detectionProfileId' },
        { id: '#plz-profile-describer', key: 'describerProfileId' },
    ];

    for (const { id, key } of dropdowns) {
        try {
            ConnectionManagerRequestService.handleDropdown(
                id,
                s[key] ?? '',
                (profile) => updateSetting(key, profile?.id ?? null),
            );
        } catch (err) {
            warn('Panel', `Connection Manager failed for ${id}:`, err);
            $(id).closest('.plz-call-row').find('select').closest('div').hide();
        }
    }
}

function updateKeyStatusIndicator() {
    const $indicator = $(`#${PANEL_ID} #plz-key-status`);
    if (!$indicator.length) return;

    const vaultState = secret_state[SECRET_KEY_NAME];
    if (Array.isArray(vaultState) && vaultState.length > 0) {
        $indicator.html('<span style="color:var(--SmartThemeQuoteColor,#28a745);"><i class="fa-solid fa-circle-check"></i> Configured</span>');
    } else {
        $indicator.html('<span style="color:var(--SmartThemeWarningColor,#ffc107);"><i class="fa-solid fa-triangle-exclamation"></i> Not configured</span>');
    }
}

// ─── Event Bindings ───────────────────────────────────────────────────────────

const PROMPT_TITLES = {
    subjectMatchPrompt:         'Step 1 — Subject Match (YES/NO)',
    subjectListPrompt:          'Step 2 — Subject From List',
    changeCheckPrompt:          'Step 2.9 — Change Check (YES/NO)',
    combinedClassifierPrompt:   'Step 3 — Combined Outfit + Expression Classifier',
    outfitDescriberPrompt:      'Describer — New Outfit',
    expressionDescriberPrompt:  'Describer — New Expression',
    vnStyleSuffix:              'VN Portrait Style Suffix',
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

function bindHandlers() {
    const $panel = $(`#${PANEL_ID}`);

    $panel.on('change', '#plz-enabled', function () {
        updateSetting('enabled', $(this).prop('checked'));
    });

    $panel.on('change', '#plz-portrait-position', function () {
        const val = $(this).val();
        updateSetting('portraitPosition', val);
        setPortraitPosition(val);
    });

    $panel.on('change', '#plz-image-model', function () {
        updateSetting('imageModel', $(this).val());
    });

    $panel.on('change', '#plz-dev-mode', function () {
        updateSetting('devMode', $(this).prop('checked'));
    });

    $panel.on('change', '#plz-verbose-logging', function () {
        const enabled = $(this).prop('checked');
        updateSetting('verboseLogging', enabled);
        setVerbose(enabled);
    });

    $panel.on('input', '.plz-history-input', function () {
        const key = $(this).data('history-key');
        const val = Math.max(0, parseInt($(this).val()) || 0);
        updateSetting(key, val);
    });

    // Prompt editor — opens a simple textarea popup
    $panel.on('click', '.plz-open-prompt', async function () {
        const key          = $(this).data('prompt-key');
        const title        = PROMPT_TITLES[key]   ?? key;
        const defaultValue = PROMPT_DEFAULTS[key] ?? '';
        const current      = getSettings()[key]   ?? defaultValue;

        const result = await callPopup(
            `<h3>${title}</h3>
             <textarea id="plz-prompt-editor" class="text_pole" rows="14"
                       style="width:100%;font-family:monospace;font-size:0.85em;">${current.replace(/</g, '&lt;')}</textarea>
             <div style="margin-top:8px;display:flex;gap:8px;">
                 <button class="menu_button" id="plz-prompt-reset"
                         style="font-size:0.8em;">Reset to Default</button>
             </div>`,
            'confirm',
        );

        $('#plz-prompt-reset').on('click', () => {
            $('#plz-prompt-editor').val(defaultValue);
        });

        if (result) {
            const newValue = $('#plz-prompt-editor').val();
            if (Object.prototype.hasOwnProperty.call(SETTINGS_DEFAULTS, key)) {
                updateSetting(key, newValue);
            }
        }
    });

    // API key vault
    $panel.on('click', '#plz-pollinations-save', async function () {
        const key = $('#plz-pollinations-key').val().trim();
        if (!key) {
            if (window.toastr) window.toastr.warning('Paste your Pollinations API key first.', 'PersonaLyze');
            return;
        }
        await writeSecret(SECRET_KEY_NAME, key, 'PersonaLyze: Pollinations');
        $('#plz-pollinations-key').val('');
        updateKeyStatusIndicator();
        if (window.toastr) window.toastr.success('API key saved to vault.', 'PersonaLyze');
    });

    // API key test
    $panel.on('click', '#plz-pollinations-test', async function () {
        const $btn    = $(this);
        const $status = $panel.find('#plz-pollinations-status');
        $btn.prop('disabled', true).text('Generating…');
        $status.text('');

        try {
            const objectUrl = await fetchPreviewBlob('a young woman smiling, portrait, soft lighting');
            $status.text('Connected!');
            await callPopup(
                `<h3>PersonaLyze — Connection OK</h3>
                 <p style="opacity:0.65;font-size:0.88em;">Pollinations responded successfully.</p>
                 <img src="${objectUrl}" style="width:100%;border-radius:6px;margin-top:8px;" />`,
                'text',
            );
        } catch (err) {
            $status.text(`Failed: ${err.message}`);
            error('Panel', 'Test connection failed:', err);
            if (window.toastr) window.toastr.error(err.message, 'PersonaLyze');
        } finally {
            $btn.prop('disabled', false).text('Test Connection');
        }
    });

    // Expression list editor
    $panel.on('click', '#plz-edit-expressions', async function () {
        const s       = getSettings();
        const current = (s.expressionLabels ?? []).join('\n');

        const result = await callPopup(
            `<h3>Expression List</h3>
             <p style="font-size:0.85em;opacity:0.7;margin:0 0 10px;">
                 One label per line. The classifier will pick from this list.<br>
                 Add unusual entries for specific characters (e.g. "sultry", "determined").
             </p>
             <textarea id="plz-expr-editor" class="text_pole" rows="16"
                       style="width:100%;font-family:monospace;font-size:0.88em;">${current}</textarea>
             <div style="margin-top:8px;display:flex;gap:8px;">
                 <button class="menu_button" id="plz-expr-reset" style="font-size:0.8em;">Reset to Defaults</button>
             </div>`,
            'confirm',
        );

        $('#plz-expr-reset').on('click', () => {
            $('#plz-expr-editor').val(DEFAULT_EXPRESSION_LABELS.join('\n'));
        });

        if (result) {
            const labels = $('#plz-expr-editor').val()
                .split('\n')
                .map(l => l.trim().toLowerCase())
                .filter(Boolean);
            if (labels.length > 0) {
                updateSetting('expressionLabels', labels);
                if (window.toastr) window.toastr.success(`Expression list updated (${labels.length} labels).`, 'PersonaLyze');
            }
        }
    });

    // Character Workshop buttons
    $panel.on('click', '#plz-open-workshop',  () => handleOpenWorkshop());
    $panel.on('click', '#plz-open-register',  () => handleOpenRegister());
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

/**
 * Injects the PLZ settings panel into the ST extensions drawer.
 * Idempotent — exits early if the panel is already present.
 */
export function injectSettingsPanel() {
    if ($(`#${PANEL_ID}`).length) return;

    const $parent = $('#extensions_settings');
    if (!$parent.length) return;

    $parent.append(buildPanelHTML());
    bindHandlers();
    initConnectionDropdowns();
    populateInputs();

    log('Panel', 'Settings panel injected.');
}
