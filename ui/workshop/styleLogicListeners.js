/**
 * @file data/default-user/extensions/personalyze/ui/workshop/styleLogicListeners.js
 * @stamp {"utc":"2026-05-01T13:00:00.000Z"}
 * @architectural-role UI Controller (Global Style Logic)
 * @description
 * Manages event listeners and state synchronization for the Logic Probes drawer.
 * Handles CRUD operations on the Style's logicProbes dictionary and enforces
 * circular dependency guards.
 * 
 * Updated for Computational Logic:
 * 1. Instant local testing for computational probes.
 * 2. Inclusion of comparison chips in the Fullscreen Editor variables.
 * 
 * @api-declaration
 * bindStyleLogicHandlers($overlay) -> void
 * renderLogicDrawer() -> void
 * 
 * @contract
 *   assertions:
 *     purity: IO / Stateful UI
 *     state_ownership: [_activeProbeKey, _isProbeDirty]
 *     external_io: [settings.js, styleLogicTemplates.js, logicExecutor.js, computationalParser.js, ConnectionManagerRequestService, DOM]
 */

import { ConnectionManagerRequestService } from '../../../../shared.js';
import { getMetaSettings, getSettings, updateSetting } from '../../settings.js';
import { saveSettingsDebounced } from '../../../../../../script.js';
import { confirmModal, promptModal } from '../../utils/modal.js';
import { openTextModal } from '../../utils/textModal.js';
import { executeLogicProbe } from '../../io/llm/logicExecutor.js';
import { evaluateComputationalLogic, extractTokens } from '../../logic/computationalParser.js';
import { getLogicDrawerHTML, getProbeSelectorHTML, getProbeEditorHTML } from './styleLogicTemplates.js';
import { state } from '../../state.js';
import { log, warn } from '../../utils/logger.js';
import { getContext } from '../../../../../extensions.js';
import { buildHistoryText } from '../../utils/history.js';

// --- Module State (Session Ephemeral) ---
let _activeProbeKey = '';
let _isProbeDirty   = false;

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

    const wasOpen = $('#plz-logic-details').prop('open');
    const workshopChar = state.chatCharacters[state._workshopCharacterId];
    const identitySlots = Object.keys(workshopChar?.identity || {});
    $('#plz-logic-drawer-mount').html(getLogicDrawerHTML(style, _activeProbeKey, _isProbeDirty, identitySlots));
    if (wasOpen) $('#plz-logic-details').prop('open', true);
    
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

    $overlay.on('click', '#plz-logic-clone', async () => {
        const meta = getMetaSettings();
        const style = meta.styleWorkspaces[getSettings().currentStyleName];
        const source = style.logicProbes[_activeProbeKey];
        if (!source) return;

        const nameRaw = await promptModal(`Clone "${_activeProbeKey}" as...`);
        if (!nameRaw) return;

        const key = nameRaw.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
        if (!key) return;

        if (style.logicProbes[key]) {
            if (window.toastr) window.toastr.warning('Token name already exists.');
            return;
        }

        style.logicProbes[key] = structuredClone(source);
        _activeProbeKey = key;
        _isProbeDirty = true;
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

        // Add dynamic tokens
        const workshopChar = state.chatCharacters[state._workshopCharacterId];
        const slots = workshopChar?.slots || [];
        const identity = Object.keys(workshopChar?.identity || {});
        slots.forEach(s => vars.push({ v: `{{${s}}}`, d: 'Clothing Slot' }));
        identity.forEach(i => vars.push({ v: `{{${i}}}`, d: 'Identity Trait' }));
        
        Object.keys(probes).forEach(k => { if (k !== _activeProbeKey) vars.push({ v: `{{${k}}}`, d: 'Other Logic' }); });

        // Add comparison chips if computational
        if (probe.type === 'computational') {
            vars.push({ v: 'is', d: 'Strict Whole-Word Equality' });
            vars.push({ v: 'in', d: 'List Membership (a, b)' });
            vars.push({ v: 'contains', d: 'Partial Fuzzy Match' });
            vars.push({ v: '!', d: 'Negation' });
        }

        const result = await openTextModal({
            title: probe.type === 'computational' ? `Logic Expression: ${_activeProbeKey}` : `Logic Query: ${_activeProbeKey}`,
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

    // 4. Live Test
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
            
            const workshopChar = state.chatCharacters[state._workshopCharacterId];
            const chain = state.characterChain[state._workshopCharacterId];
            const layers = chain?.layers || {};

            // Build full context including wardrobe for the test
            const contextData = { 
                current_turn: text, 
                history, 
                character_name: state._workshopCharacterId || 'test_subject' 
            };

            // Inject identity
            if (workshopChar?.identity) {
                Object.assign(contextData, workshopChar.identity);
            }

            // Inject serialized wardrobe
            Object.entries(layers).forEach(([k, v]) => {
                if (k === 'logic') return;
                if (!v) contextData[k] = 'none';
                else if (typeof v === 'string') contextData[k] = v;
                else contextData[k] = `${v.item} (${v.modifier || 'none'})`;
            });

            let finalOutput = '';

            if (probe.type === 'computational') {
                // Instant Local Evaluation
                const isTrue = evaluateComputationalLogic(probe.prompt, contextData);
                finalOutput = isTrue ? (probe.trueTemplate ?? '') : (probe.falseTemplate ?? '');
                if (window.toastr) window.toastr.info(`Result: ${isTrue ? 'TRUE' : 'FALSE'}${finalOutput ? `\nInjected: "${finalOutput}"` : ''}`, `Instant Evaluation: ${_activeProbeKey}`);
            } else {
                // LLM Evaluation
                finalOutput = await executeLogicProbe(_activeProbeKey, probe, contextData);
                if (window.toastr) window.toastr.info(`Result: ${finalOutput || '(empty)'}`, `Probe: ${_activeProbeKey}`);
            }
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