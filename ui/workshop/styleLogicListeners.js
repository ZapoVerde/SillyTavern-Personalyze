/**
 * @file data/default-user/extensions/personalyze/ui/workshop/styleLogicListeners.js
 * @stamp {"utc":"2026-05-01T08:25:00.000Z"}
 * @architectural-role UI Controller (Global Style Logic)
 * @description
 * Manages event listeners and state synchronization for the Logic Probes drawer.
 * Handles CRUD operations on the Style's logicProbes dictionary and enforces
 * circular dependency guards.
 * 
 * @api-declaration
 * bindStyleLogicHandlers($overlay) -> void
 * renderLogicDrawer() -> void
 * 
 * @contract
 *   assertions:
 *     purity: IO / Stateful UI
 *     state_ownership: [_activeProbeKey, _isProbeDirty]
 *     external_io: [settings.js, styleLogicTemplates.js, logicExecutor.js, ConnectionManagerRequestService, DOM]
 */

import { ConnectionManagerRequestService } from '../../../../shared.js';
import { getMetaSettings, getSettings, updateSetting } from '../../settings.js';
import { saveSettingsDebounced } from '../../../../../../script.js';
import { confirmModal, promptModal } from '../../utils/modal.js';
import { openTextModal } from '../../utils/textModal.js';
import { executeLogicProbe } from '../../io/llm/logicExecutor.js';
import { getLogicDrawerHTML, getProbeSelectorHTML, getProbeEditorHTML } from './styleLogicTemplates.js';
import { log, warn } from '../../utils/logger.js';
import { getContext } from '../../../../../extensions.js';
import { buildHistoryText } from '../../utils/history.js';

// --- Module State (Session Ephemeral) ---
let _activeProbeKey = '';
let _isProbeDirty   = false;

/**
 * Extracts tokens from a string.
 */
function extractTokens(text) {
    if (!text) return [];
    const matches = text.match(/\{\{([a-zA-Z0-9_]+)\}\}/g);
    return matches ? matches.map(m => m.slice(2, -2).toLowerCase()) : [];
}

/**
 * Checks for circular dependencies in the logic graph.
 */
function isCircular(probes, targetKey, currentPrompt, visited = new Set()) {
    const deps = extractTokens(currentPrompt);
    if (deps.includes(targetKey)) return true;

    for (const d of deps) {
        if (probes[d] && !visited.has(d)) {
            visited.add(d);
            if (isCircular(probes, targetKey, probes[d].prompt, visited)) return true;
        }
    }
    return false;
}

/**
 * Renders or refreshes the Logic drawer content.
 */
export function renderLogicDrawer() {
    const meta = getMetaSettings();
    const s = getSettings();
    const style = meta.styleWorkspaces[s.currentStyleName];
    if (!style) return;

    $('#plz-logic-drawer-mount').html(getLogicDrawerHTML(style, _activeProbeKey, _isProbeDirty));
    
    // Bind Connection Dropdown if editor is open
    if (_activeProbeKey && style.logicProbes[_activeProbeKey]) {
        const probe = style.logicProbes[_activeProbeKey];
        ConnectionManagerRequestService.handleDropdown(
            '#plz-logic-profile',
            probe.profileId || '',
            (profile) => {
                probe.profileId = profile?.id ?? null;
                _isProbeDirty = true;
                _syncSelector();
                saveSettingsDebounced();
            }
        );
    }
}

/**
 * Internal helper to update just the selector row without a full re-mount.
 */
function _syncSelector() {
    const meta = getMetaSettings();
    const style = meta.styleWorkspaces[getSettings().currentStyleName];
    $('#plz-logic-selector-container').html(getProbeSelectorHTML(style.logicProbes, _activeProbeKey, _isProbeDirty));
}

/**
 * Binds all Logic Probe CRUD and Editor events.
 */
export function bindStyleLogicHandlers($overlay) {
    
    // 1. Selector CRUD Row
    $overlay.on('change', '#plz-logic-selector', function() {
        const val = $(this).val();
        const meta = getMetaSettings();
        const style = meta.styleWorkspaces[getSettings().currentStyleName];

        if (val === '__new__') {
            _activeProbeKey = '';
            _isProbeDirty = false;
            $overlay.find('#plz-logic-selector').val('');
            _handleNewProbe(style);
            return;
        }

        _activeProbeKey = val;
        _isProbeDirty = false;
        renderLogicDrawer();
    });

    $overlay.on('click', '#plz-logic-save', () => {
        _isProbeDirty = false;
        renderLogicDrawer();
        if (window.toastr) window.toastr.success(`Probe "${_activeProbeKey}" saved to Workspace.`);
    });

    $overlay.on('click', '#plz-logic-revert', async () => {
        const meta = getMetaSettings();
        const activeStyle = getSettings().currentStyleName;
        const checkpoint = meta.styleLibrary[activeStyle]?.logicProbes?.[_activeProbeKey];
        if (!checkpoint) return;

        meta.styleWorkspaces[activeStyle].logicProbes[_activeProbeKey] = structuredClone(checkpoint);
        _isProbeDirty = false;
        saveSettingsDebounced();
        renderLogicDrawer();
    });

    $overlay.on('click', '#plz-logic-delete', async () => {
        const name = _activeProbeKey;
        if (!name || !(await confirmModal(`Delete logic probe "${name}" from this style?`))) return;
        
        const meta = getMetaSettings();
        delete meta.styleWorkspaces[getSettings().currentStyleName].logicProbes[name];
        _activeProbeKey = '';
        _isProbeDirty = false;
        saveSettingsDebounced();
        renderLogicDrawer();
    });

    // 2. Editor Inputs
    $overlay.on('click', '.plz-logic-type-btn', function() {
        const type = $(this).data('type');
        const meta = getMetaSettings();
        const probe = meta.styleWorkspaces[getSettings().currentStyleName].logicProbes[_activeProbeKey];
        if (probe.type === type) return;

        probe.type = type;
        _isProbeDirty = true;
        saveSettingsDebounced();
        renderLogicDrawer();
    });

    $overlay.on('input', '#plz-logic-true, #plz-logic-false', function() {
        const meta = getMetaSettings();
        const probe = meta.styleWorkspaces[getSettings().currentStyleName].logicProbes[_activeProbeKey];
        probe.trueTemplate = $('#plz-logic-true').val();
        probe.falseTemplate = $('#plz-logic-false').val();
        _isProbeDirty = true;
        _syncSelector();
        saveSettingsDebounced();
    });

    // 3. Prompt Modal Integration
    $overlay.on('click', '#plz-logic-edit-prompt', async () => {
        const meta = getMetaSettings();
        const probes = meta.styleWorkspaces[getSettings().currentStyleName].logicProbes;
        const probe = probes[_activeProbeKey];

        const vars = [
            { v: '{{history}}', d: 'Chat context' },
            { v: '{{current_turn}}', d: 'Latest message' },
            { v: '{{character_name}}', d: 'Active ID' }
        ];
        Object.keys(probes).forEach(k => { if (k !== _activeProbeKey) vars.push({ v: `{{${k}}}`, d: 'Other Logic' }); });

        const result = await openTextModal({
            title: `Logic Query: ${_activeProbeKey}`,
            initialValue: probe.prompt,
            variables: vars
        });

        if (result !== null) {
            if (isCircular(probes, _activeProbeKey, result)) {
                if (window.toastr) window.toastr.error('Circular Logic Detected: Probe cannot depend on itself or its own results.', 'Logic Error');
                return;
            }
            probe.prompt = result;
            _isProbeDirty = true;
            saveSettingsDebounced();
            renderLogicDrawer();
        }
    });

    // 4. Token Legend Copy
    $overlay.on('click', '.plz-logic-token-chip', function() {
        navigator.clipboard.writeText($(this).text().trim());
        if (window.toastr) window.toastr.info('Token copied');
    });

    // 5. Live Test
    $overlay.on('click', '#plz-logic-test-probe', async function() {
        const meta = getMetaSettings();
        const probe = meta.styleWorkspaces[getSettings().currentStyleName].logicProbes[_activeProbeKey];
        const $btn = $(this);
        const originalHtml = $btn.html();
        
        $btn.prop('disabled', true).text('Evaluating...');
        
        try {
            const context = getContext();
            const lastIdx = Math.max(0, context.chat.length - 1);
            const text = context.chat[lastIdx]?.mes || '';
            const history = buildHistoryText(context.chat, lastIdx, getSettings().detectionHistory);
            
            const result = await executeLogicProbe(_activeProbeKey, probe, { 
                current_turn: text, 
                history, 
                character_name: 'test_subject' 
            });

            if (window.toastr) window.toastr.info(`Result: ${result || '(empty)'}`, `Probe: ${_activeProbeKey}`);
        } catch (err) {
            warn('LogicUI', 'Test failed:', err.message);
        } finally {
            $btn.prop('disabled', false).html(originalHtml);
        }
    });
}

/**
 * Handles the creation of a new probe.
 */
async function _handleNewProbe(style) {
    const nameRaw = await promptModal('New Logic Probe Token Name');
    if (!nameRaw) return;

    const key = nameRaw.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!key) return;

    if (style.logicProbes[key]) {
        if (window.toastr) window.toastr.warning('Token name already exists.');
        return;
    }

    style.logicProbes[key] = {
        prompt: '',
        profileId: null,
        type: 'boolean',
        trueTemplate: '',
        falseTemplate: ''
    };

    _activeProbeKey = key;
    _isProbeDirty = true;
    saveSettingsDebounced();
    renderLogicDrawer();
}