/**
 * @file data/default-user/extensions/personalyze/ui/panel/templates.js
 * @stamp {"utc":"2026-04-06T00:00:00.000Z"}
 * @architectural-role Pure UI Templates
 * @description
 * Generates the HTML strings for the PersonaLyze settings panel.
 * 
 * This version restores the "Configure Engines" button architecture, 
 * delegating detailed API key, model, and HuggingFace configuration 
 * to the dedicated Engines Modal.
 *
 * @api-declaration
 * buildPanelHTML(settings, meta, profileNames) -> string (HTML)
 *
 * @contract
 *   assertions:
 *     purity: Pure (Structural)
 *     state_ownership: []
 *     external_io: []
 */

/**
 * Generates a styled informational icon with a hover tooltip.
 * @param {string} text 
 */
function tip(text) {
    return `<span class="plz-info-icon" title="${text}" style="cursor:help; opacity:0.6; margin-left:4px;"><i class="fa-solid fa-circle-info"></i></span>`;
}

/**
 * Builds a single pipeline call row with its labels and control IDs.
 */
function buildCallRow(id, label, promptKey, profileKey, historyKey, description, extraButtons = '') {
    const historyRow = historyKey ? `
        <div class="plz-settings-inline-row" style="margin-top:10px; display:flex; align-items:center; gap:8px;">
            <label style="font-size:0.85em; opacity:0.75; white-space:nowrap;">History Window:</label>
            <div style="display:flex; align-items:center; gap:4px;">
                <input id="plz-history-${id}" type="number" min="0" step="1"
                       class="text_pole plz-history-input" data-history-key="${historyKey}"
                       style="width:60px;" />
                <span style="font-size:0.83em; opacity:0.6;">pairs</span>
            </div>
        </div>` : '';

    const editBtn = promptKey
        ? `<button class="menu_button plz-open-prompt" data-prompt-key="${promptKey}">Edit Prompt</button>`
        : '';

    return `
    <div class="plz-call-row" style="margin-bottom:14px; padding:12px; border:1px solid var(--SmartThemeBorderColor,#555); border-radius:6px;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
            <div style="display:flex; align-items:center;">
                <strong style="font-size:0.9em;">${label}</strong>
                ${tip(description)}
            </div>
            <div style="display:flex; gap:6px;">${editBtn}${extraButtons}</div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
            <label style="font-size:0.85em; opacity:0.75; white-space:nowrap; min-width:80px;">Connection:</label>
            <select id="plz-profile-${id}" class="text_pole" style="flex:1;"
                    data-profile-key="${profileKey}"></select>
        </div>
        ${historyRow}
    </div>`;
}

/**
 * Main Settings Panel template.
 * @param {object} settings       The activeState (working copy).
 * @param {object} meta           The root metadata (currentProfileName).
 * @param {string[]} profileNames List of all saved profile keys.
 */
export function buildPanelHTML(settings, meta, profileNames = ['Default']) {
    const s = settings;
    
    const profileOptions = profileNames
        .map(n => `<option value="${n}"${n === meta.currentProfileName ? ' selected' : ''}>${n}</option>`)
        .join('');

    return `
    <div id="plz-settings" class="extension_settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b><i class="fa-solid fa-user"></i> PersonaLyze</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">

                <!-- ── Profile Management Bar ── -->
                <div class="plz-settings-row cnz-profile-bar" style="display:flex; align-items:center; gap:6px; margin-bottom:14px; padding-bottom:14px; border-bottom:1px solid var(--SmartThemeBorderColor,#444);">
                    <div style="flex:1; display:flex; align-items:center;">
                        <select id="plz-profile-select" class="text_pole plz-profile-select" style="width:100%;" title="Active settings profile">
                            ${profileOptions}
                        </select>
                        ${tip("Switch between different configurations. Adding a new profile clones your current settings table.")}
                    </div>
                    <button id="plz-profile-save"   class="menu_button" title="Save current settings to this profile" style="padding: 5px 12px;">💾</button>
                    <button id="plz-profile-add"    class="menu_button" title="Save as new profile (clones current table)" style="padding: 5px 12px;">➕</button>
                    <button id="plz-profile-rename" class="menu_button" title="Rename this profile" style="padding: 5px 12px;">✏️</button>
                    <button id="plz-profile-delete" class="menu_button" title="Delete this profile" style="padding: 5px 12px; background:rgba(224, 85, 85, 0.15); color:#e05555; border-color:rgba(224, 85, 85, 0.3);">🗑️</button>
                </div>

                <!-- Global Enable -->
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">
                    <label class="checkbox_label" style="font-size:0.9em; cursor:pointer;">
                        <input type="checkbox" id="plz-enabled" ${s.enabled ? 'checked' : ''} />
                        <span>Enable PersonaLyze</span>
                    </label>
                    ${tip("Globally activates or deactivates the PersonaLyze character detection pipeline.")}
                </div>

                <!-- Portrait Position -->
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                    <label style="font-size:0.85em; opacity:0.75; white-space:nowrap; min-width:110px;">Portrait Position</label>
                    <select id="plz-portrait-position" class="text_pole" style="flex:1;">
                        <option value="bottom-right" ${s.portraitPosition === 'bottom-right' ? 'selected' : ''}>Bottom Right</option>
                        <option value="center-left" ${s.portraitPosition === 'center-left' ? 'selected' : ''}>Center Left</option>
                    </select>
                    ${tip("Controls where the floating character portrait appears in the chat view.")}
                </div>

                <!-- Split-Screen Character View -->
                <div style="margin-bottom:14px; padding-bottom:14px; border-bottom:1px solid var(--SmartThemeBorderColor,#444);">
                    <label class="checkbox_label" style="font-size:0.9em; cursor:pointer; margin-bottom:6px;">
                        <input type="checkbox" id="plz-vn-mode" ${s.plzVnMode ? 'checked' : ''} />
                        <span>Split-Screen Character View</span>
                    </label>
                    ${tip("Shows the portrait in a dedicated panel above the chat. Drag the handle to resize.")}
                    <p style="font-size:0.8em; opacity:0.6; margin:0 0 0 22px;">
                        Overrides the floating portrait above. Drag handle to resize.
                    </p>
                </div>

                <!-- Pipeline Steps -->
                ${buildCallRow('boolean', 'Boolean — Subject / Changed', null, 'booleanProfileId', 'detectionHistory', 
                    "Cheap YES/NO checks. 'Subject?' confirms if the active character is the focus. 'Changed?' checks if their outfit/expression has altered.", `
                    <button class="menu_button plz-open-prompt" data-prompt-key="subjectMatchPrompt">Subject?</button>
                    <button class="menu_button plz-open-prompt" data-prompt-key="changeCheckPrompt">Changed?</button>`)}
                
                ${buildCallRow('classifier', 'Classifier — Who / Visual State', null, 'classifierProfileId', null, 
                    "Identifies which character is acting from your roster and classifies their current visual state.", `
                    <button class="menu_button plz-open-prompt" data-prompt-key="subjectListPrompt">Who?</button>
                    <button class="menu_button plz-open-prompt" data-prompt-key="combinedClassifierPrompt">Classify</button>`)}
                
                ${buildCallRow('describer', 'Describer — Extraction', 'outfitDescriberPrompt', 'describerProfileId', 'describerHistory', 
                    "Extracts permanent physical features for the Identity Anchor and creates visual descriptions for new outfits found in chat.")}

                <!-- Image Generation -->
                <div style="margin-top:18px; padding-top:14px; border-top:1px solid var(--SmartThemeBorderColor,#444);">
                    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
                        <strong style="font-size:0.95em;">Image Generation</strong>
                        ${tip("Configure image generation engines, API keys, models, and HuggingFace Spaces.")}
                    </div>
                    
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                        <button class="menu_button" id="plz-open-engines" style="flex:1;">
                            <i class="fa-solid fa-gear"></i> Configure Engines
                        </button>
                    </div>

                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
                        <label style="font-size:0.85em; opacity:0.75; white-space:nowrap; min-width:60px;">Prompt:</label>
                        <button class="menu_button plz-open-prompt" data-prompt-key="vnStyleSuffix" style="flex:1;">Edit Portrait Prompt Template</button>
                        ${tip("The foundation of your image prompt. Supports {{character}}, {{outfit}}, and {{expression}} variables.")}
                    </div>

                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
                        <label class="checkbox_label" style="font-size:0.85em; cursor:pointer;">
                            <input type="checkbox" id="plz-dev-mode" ${s.devMode ? 'checked' : ''} />
                            <span>Dev mode (low resolution)</span>
                        </label>
                        ${tip("Generates smaller images to save bandwidth and credits during testing.")}
                    </div>
                </div>

                <!-- Developer Settings -->
                <div style="margin-top:18px; padding-top:14px; border-top:1px solid var(--SmartThemeBorderColor,#444);">
                    <div style="display:flex; align-items:center; margin-bottom:10px;">
                        <strong style="font-size:0.95em;">Developer Settings</strong>
                        ${tip("Technical controls for troubleshooting and advanced use.")}
                    </div>
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                        <label class="checkbox_label" style="font-size:0.85em; cursor:pointer;">
                            <input type="checkbox" id="plz-verbose-logging" ${s.verboseLogging ? 'checked' : ''} />
                            <span>Verbose logging (browser console)</span>
                        </label>
                        ${tip("Enables detailed debug logs in the browser's developer console.")}
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <button class="menu_button" id="plz-view-logs" style="font-size:0.85em; padding:4px 10px;">
                            <i class="fa-solid fa-list"></i> View Logs
                        </button>
                        ${tip("Inspect the last few turns of AI call logs — prompts sent, responses received, and any errors.")}
                    </div>
                </div>

                <!-- Footer Actions -->
                <div style="margin-top:18px; padding-top:14px; border-top:1px solid var(--SmartThemeBorderColor,#444); display:flex; gap:8px;">
                    <button class="menu_button" id="plz-open-workshop" style="flex:1;">
                        <i class="fa-solid fa-user"></i> Workshop
                    </button>
                    <button class="menu_button" id="plz-open-register" style="flex:1;">
                        <i class="fa-solid fa-user-plus"></i> Register
                    </button>
                </div>

            </div>
        </div>
    </div>`;
}