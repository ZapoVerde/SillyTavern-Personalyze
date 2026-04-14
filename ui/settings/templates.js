/**
 * @file data/default-user/extensions/personalyze/ui/settings/templates.js
 * @stamp {"utc":"2026-04-18T23:45:00.000Z"}
 * @architectural-role Pure UI Templates
 * @description
 * Pure functions for generating the Personalyze settings panel and forensic logs.
 * Implements the Forensic Observability Standard: full request/response mirroring,
 * JSON pretty-printing, and debug bundle exports.
 * 
 * Updated: 
 * 1. Fixed Debug Bundle copy failure by using ID-based DOM lookup for clipboard text.
 * 
 * @api-declaration
 * buildPanelHTML(settings, meta, profileNames) -> string
 * buildLogModalHTML(pipelineLogs, workshopLogs, systemLogs) -> string
 *
 * @contract
 *   assertions:
 *     purity: Pure (Structural)
 *     state_ownership: []
 *     external_io: []
 */

import { escapeHtml } from '../../utils/history.js';

/**
 * Renders the Forensic Call Log modal.
 */
export function buildLogModalHTML(pipelineLogs, workshopLogs, systemLogs) {
    let _copyId = 0;

    const utcTime = (ts) => new Date(ts).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

    /** Formats technical data for forensic display. */
    const prettyPrint = (data) => {
        if (!data) return '';
        try {
            const obj = typeof data === 'string' ? JSON.parse(data) : data;
            return JSON.stringify(obj, null, 2);
        } catch {
            return String(data);
        }
    };

    /** Builds a code block with a dedicated copy button. */
    const forensicBlock = (label, rawData, color = 'var(--SmartThemeQuoteColor)') => {
        if (!rawData) return '';
        const id = `plz-forensic-v-${_copyId++}`;
        const content = prettyPrint(rawData);
        return `
        <div style="margin-top:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.72em; opacity:0.6; margin-bottom:3px; text-transform:uppercase; letter-spacing:0.05em;">
                <span style="color:${color}; font-weight:bold;">${label}</span>
                <button onclick="navigator.clipboard.writeText(document.getElementById('${id}').textContent); event.stopPropagation();" 
                        class="menu_button" style="font-size:0.9em; padding:1px 6px;">Copy</button>
            </div>
            <pre id="${id}" style="font-family:monospace; font-size:0.75em; background:rgba(0,0,0,0.3); padding:8px; border-radius:4px; max-height:250px; overflow:auto; margin:0; border:1px solid rgba(255,255,255,0.05); white-space:pre-wrap; word-break:break-all;">${escapeHtml(content)}</pre>
        </div>`;
    };

    const renderTurns = (turns, limit) => {
        if (!turns.length) return `<p style="opacity:0.4; font-size:0.85em; padding:10px;">No entries recorded.</p>`;
        return [...turns].reverse().slice(0, limit).map(turn => {
            const calls = turn.calls.map(c => {
                const status = c.error ? `<span style="color:var(--SmartThemeErrorColor);">✗ FAIL</span>` : `<span style="color:var(--SmartThemeQuoteColor);">✓ OK</span>`;
                
                // INDUSTRIAL FIX: Use hidden DOM elements to store bundle text.
                // Inline Javascript template literals in 'onclick' attributes break on JSON quotes/newlines.
                const bundleId = `plz-bundle-v-${_copyId++}`;
                const debugBundleText = `--- DEBUG BUNDLE: ${c.label} ---\n\nREQUEST:\n${prettyPrint(c.requestBundle || c.prompt)}\n\nRESPONSE:\n${prettyPrint(c.responseDocument || c.response)}${c.error ? `\n\nERROR:\n${c.error}` : ''}`;

                return `
                <details style="margin-top:6px; border-left:2px solid rgba(255,255,255,0.1); padding-left:10px;">
                    <summary style="cursor:pointer; display:flex; justify-content:space-between; align-items:center; list-style:none;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <strong style="font-size:0.85em;">${escapeHtml(c.label)}</strong>
                            <small style="opacity:0.4;">${utcTime(c.timestamp)}</small>
                        </div>
                        <div style="display:flex; align-items:center; gap:10px;">
                            ${status}
                            <!-- Hidden source for the copy command to ensure valid JS string handling -->
                            <div id="${bundleId}" style="display:none;">${escapeHtml(debugBundleText)}</div>
                            <button onclick="navigator.clipboard.writeText(document.getElementById('${bundleId}').textContent); event.stopPropagation();" 
                                    class="menu_button" style="font-size:0.75em; padding:1px 8px;" title="Copy Full Request/Response Bundle">Debug Bundle</button>
                        </div>
                    </summary>
                    ${forensicBlock('Request Payload', c.requestBundle || c.prompt, '#aaa')}
                    ${forensicBlock('Response Document', c.responseDocument || c.response)}
                    ${c.error ? `<div style="color:var(--SmartThemeErrorColor); font-size:0.8em; margin-top:5px; padding:5px; background:rgba(224,85,85,0.1); border-radius:4px;">${escapeHtml(c.error)}</div>` : ''}
                </details>`;
            }).join('');

            return `
            <div style="background:rgba(255,255,255,0.03); border-radius:8px; padding:10px; margin-bottom:10px; border:1px solid rgba(255,255,255,0.05);">
                <div style="display:flex; justify-content:space-between; margin-bottom:5px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:5px;">
                    <strong>${escapeHtml(turn.label)}</strong>
                    <span style="opacity:0.4; font-size:0.8em;">${utcTime(turn.timestamp)}</span>
                </div>
                ${calls}
            </div>`;
        }).join('');
    };

    return `
    <div style="min-width:400px; display:flex; flex-direction:column; gap:15px;">
        <h3 style="margin:0;"><i class="fa-solid fa-plane-arrival"></i> Forensic Flight Recorder</h3>
        
        <details open>
            <summary style="cursor:pointer; font-weight:bold; opacity:0.8; margin-bottom:8px;">Narrative Pipeline (Last 4)</summary>
            ${renderTurns(pipelineLogs, 4)}
        </details>

        <details>
            <summary style="cursor:pointer; font-weight:bold; opacity:0.8; margin-bottom:8px;">Manual & Workshop (Last 3)</summary>
            ${renderTurns(workshopLogs, 3)}
        </details>

        <details>
            <summary style="cursor:pointer; font-weight:bold; opacity:0.8; margin-bottom:8px;">System Discovery (Last 5)</summary>
            ${renderTurns(systemLogs, 5)}
        </details>
    </div>`;
}

/** Utility for help tooltips. */
function tip(text) {
    return `<span class="plz-info-icon" title="${text}" style="cursor:help; opacity:0.6; margin-left:4px;"><i class="fa-solid fa-circle-info"></i></span>`;
}

/** Builds a pipeline stage row. */
function buildCallRow(id, label, profileKey, historyKey, description, promptButtons = []) {
    const historyRow = historyKey ? `
        <div style="margin-top:10px; display:flex; align-items:center; gap:8px;">
            <label style="font-size:0.85em; opacity:0.75; white-space:nowrap;">History Window:</label>
            <input id="plz-history-${id}" type="number" min="0" step="1" class="text_pole plz-history-input" data-history-key="${historyKey}" style="width:60px;" />
            <span style="font-size:0.83em; opacity:0.6;">pairs</span>
        </div>` : '';

    return `
    <div class="plz-call-row" style="margin-bottom:14px; padding:12px; border:1px solid var(--SmartThemeBorderColor,#555); border-radius:6px;">
        <div style="display:flex; align-items:center; margin-bottom:10px;"><strong style="font-size:0.9em;">${label}</strong>${tip(description)}</div>
        <div style="display:flex; flex-direction:column; gap:5px; margin-bottom:10px;">
            ${promptButtons.map(btn => `<button class="menu_button plz-open-prompt plz-btn-left" data-prompt-key="${btn.key}" style="width:100%; font-size:0.82em;">${btn.label}</button>`).join('')}
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
            <label style="font-size:0.85em; opacity:0.75; white-space:nowrap; min-width:80px;">Connection:</label>
            <select id="plz-profile-${id}" class="text_pole" style="flex:1;" data-profile-key="${profileKey}"></select>
        </div>
        ${historyRow}
    </div>`;
}

/** Renders the Image & Asset Settings section. */
function buildImageSettingsHTML(settings) {
    const resOptions = ['MAX', 'HIGH', 'MED', 'SMALL'].map(k => `<option value="${k}" ${settings.maxResolution === k ? 'selected' : ''}>${k}</option>`).join('');
    return `
    <div style="margin-bottom:14px; padding-bottom:14px; border-bottom:1px solid var(--SmartThemeBorderColor,#444);">
        <div style="font-size:0.8em; opacity:0.6; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:10px;">Image & Asset Settings</div>
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
            <label style="font-size:0.85em; opacity:0.75; min-width:110px;">Max Resolution</label>
            <select id="plz-max-resolution" class="text_pole" style="flex:1;">${resOptions}</select>
            ${tip("Max resolution tier for any generation.")}
        </div>
        <div style="margin-bottom:8px;">
            <label class="checkbox_label"><input type="checkbox" id="plz-dynamic-resolution" ${settings.dynamicResolution ? 'checked' : ''} /><span>Dynamic Resolution</span></label>${tip("Matches resolution to card size.")}
        </div>
        <div style="margin-bottom:8px;">
            <label class="checkbox_label"><input type="checkbox" id="plz-keep-cache" ${settings.keepCache ? 'checked' : ''} /><span>Persistent Cache</span></label>${tip("Prevents auto-cleanup of old portraits.")}
        </div>
        <div style="margin-bottom:12px;">
            <label class="checkbox_label"><input type="checkbox" id="plz-portrait-status" ${settings.showPortraitStatus ? 'checked' : ''} /><span>Show generation progress bar</span></label>
        </div>
        <div style="display:flex; gap:8px;">
            <button class="menu_button" id="plz-purge-chat" style="flex:1; font-size:0.85em;">Purge Chat</button>
            <button class="menu_button" id="plz-purge-all" style="flex:1; font-size:0.85em; color:var(--SmartThemeErrorColor);">Purge All</button>
        </div>
    </div>`;
}

/** Main Settings Panel template. */
export function buildPanelHTML(settings, meta, profileNames) {
    const profileOptions = profileNames.map(n => `<option value="${n}"${n === meta.currentProfileName ? ' selected' : ''}>${n}</option>`).join('');
    return `
    <div id="plz-settings" class="extension_settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header"><b><i class="fa-solid fa-user"></i> Personalyze</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div>
            <div class="inline-drawer-content">
                <div style="display:flex; align-items:center; gap:6px; margin-bottom:14px; padding-bottom:14px; border-bottom:1px solid var(--SmartThemeBorderColor,#444);">
                    <select id="plz-profile-select" class="text_pole" style="flex:1;">${profileOptions}</select>
                    <button id="plz-profile-save" class="menu_button">💾</button><button id="plz-profile-add" class="menu_button">➕</button><button id="plz-profile-delete" class="menu_button" style="color:#e05555;">🗑️</button>
                </div>
                <div style="margin-bottom:14px;"><label class="checkbox_label"><input type="checkbox" id="plz-enabled" ${settings.enabled ? 'checked' : ''} /><span>Enable PersonaLyze</span></label></div>
                ${buildCallRow('fast', 'Fast Model (Phases 1-2)', 'fastProfileId', 'detectionHistory', "Subject detection & Change gate.", [{ key: 'phase1SubjectPrompt', label: 'Subject' }, { key: 'phase2ChangePrompt', label: 'Change' }, { key: 'sceneChangePrompt', label: 'Scene' }, { key: 'wardrobeValidityPrompt', label: 'Validity' }])}
                ${buildCallRow('smart', 'Smart Model (Phase 3+)', 'smartProfileId', 'describerHistory', "Extraction & Scanning.", [{ key: 'phase3LayeredPrompt', label: 'Layered' }, { key: 'anchorScanPrompt', label: 'Anchor' }, { key: 'redressPrompt', label: 'Redress' }, { key: 'forceCostumePrompt', label: 'Manual' }])}
                <div style="margin-bottom:14px; padding-bottom:14px; border-bottom:1px solid var(--SmartThemeBorderColor,#444);"><button class="menu_button" id="plz-open-engines" style="width:100%;"><i class="fa-solid fa-gear"></i> Configure Engines</button></div>
                ${buildImageSettingsHTML(settings)}
                <div style="margin-bottom:14px; padding-bottom:14px; border-bottom:1px solid var(--SmartThemeBorderColor,#444); display:flex; flex-direction:column; gap:8px;">
                    <div style="font-size:0.8em; opacity:0.6; text-transform:uppercase; letter-spacing:0.05em;">Technical Schema</div>
                    <button class="menu_button" id="plz-open-schema-editor" style="width:100%;"><i class="fa-solid fa-code"></i> Edit Model Parameter Schema</button>
                </div>
                <div style="margin-bottom:14px;"><label class="checkbox_label"><input type="checkbox" id="plz-dev-mode" ${settings.devMode ? 'checked' : ''} /><span>Dev Mode</span></label></div>
                <div style="margin-bottom:14px;"><label class="checkbox_label"><input type="checkbox" id="plz-verbose-logging" ${settings.verboseLogging ? 'checked' : ''} /><span>Verbose Logging</span></label></div>
                <div style="display:flex; gap:8px;"><button class="menu_button" id="plz-open-workshop" style="flex:1;"><i class="fa-solid fa-dna"></i> Workshop</button><button class="menu_button" id="plz-view-logs" style="flex:1;"><i class="fa-solid fa-plane-arrival"></i> Logs</button></div>
            </div>
        </div>
    </div>`;
}