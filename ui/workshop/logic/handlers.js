/**
 * @file data/default-user/extensions/personalyze/ui/workshop/logic/handlers.js
 * @stamp {"utc":"2026-05-01T20:00:00.000Z"}
 * @architectural-role Event Orchestrator
 * @description
 * Consolidates all jQuery event listeners for the Logic Probes UI module.
 * Coordinates between state management, creators, testers, and the renderer.
 * 
 * @api-declaration
 * bindStyleLogicHandlers($overlay) -> void
 * 
 * @contract
 *   assertions:
 *     purity: IO Executor (Events)
 *     state_ownership: []
 *     external_io: [DOM, settings.js, creators.js, help.js, tester.js, renderer.js, utils.js, state.js]
 */

import { saveSettingsDebounced } from '../../../../../../script.js';
import { getMetaSettings, getSettings } from '../../settings.js';
import { state } from '../../state.js';
import { confirmModal } from '../../utils/modal.js';
import { openTextModal } from '../../utils/textModal.js';
import { getActiveProbeKey, setActiveProbeKey, setProbeDirty, setLastFocusedInput, getLastFocusedInput } from './state.js';
import { isCircular, getInjectionString } from './utils.js';
import { handleNewProbe, handleCloneProbe } from './creators.js';
import { showLogicHelp } from './help.js';
import { handleTestProbe } from './tester.js';
import { renderLogicDrawer, syncLogicSelector } from './renderer.js';
import { BASE_SLOTS } from '../../../defaults.js';

/**
 * Binds all Logic Probe CRUD and Editor events to the workshop overlay.
 * 
 * @param {jQuery} $overlay - The workshop modal overlay.
 */
export function bindStyleLogicHandlers($overlay) {
    
    // 0. Focus Tracking
    // Ensures token injection targets the correct box (Expression, True, or False)
    $overlay.on('focus', '#plz-logic-prompt-preview, #plz-logic-true, #plz-logic-false', function() {
        setLastFocusedInput('#' + this.id);
    });

    // 1. Selector CRUD Row
    $overlay.on('change', '#plz-logic-selector', function() {
        const val = $(this).val();
        const meta = getMetaSettings();
        const style = meta.styleWorkspaces[getSettings().currentStyleName];

        if (val === '__new__') {
            $overlay.find('#plz-logic-selector').val('');
            handleNewProbe(style, renderLogicDrawer);
            return;
        }

        setActiveProbeKey(val);
        setProbeDirty(false);
        renderLogicDrawer();
    });

    $overlay.on('click', '#plz-logic-save', () => {
        setProbeDirty(false);
        renderLogicDrawer();
        if (window.toastr) window.toastr.success(`Probe "${getActiveProbeKey()}" saved to Workspace.`);
    });

    $overlay.on('click', '#plz-logic-revert', async () => {
        const meta = getMetaSettings();
        const activeStyle = getSettings().currentStyleName;
        const probeKey = getActiveProbeKey();
        const checkpoint = meta.styleLibrary[activeStyle]?.logicProbes?.[probeKey];
        if (!checkpoint) return;

        meta.styleWorkspaces[activeStyle].logicProbes[probeKey] = structuredClone(checkpoint);
        setProbeDirty(false);
        saveSettingsDebounced();
        renderLogicDrawer();
    });

    $overlay.on('click', '#plz-logic-delete', async () => {
        const probeKey = getActiveProbeKey();
        if (!probeKey || !(await confirmModal(`Delete logic probe "${probeKey}" from this style?`))) return;
        
        const meta = getMetaSettings();
        delete meta.styleWorkspaces[getSettings().currentStyleName].logicProbes[probeKey];
        setActiveProbeKey('');
        setProbeDirty(false);
        saveSettingsDebounced();
        renderLogicDrawer();
    });

    $overlay.on('click', '#plz-logic-clone', async () => {
        const style = getMetaSettings().styleWorkspaces[getSettings().currentStyleName];
        handleCloneProbe(style, getActiveProbeKey(), renderLogicDrawer);
    });

    // 2. Editor Inputs
    $overlay.on('click', '.plz-logic-type-btn', function() {
        const type = $(this).data('type');
        const meta = getMetaSettings();
        const probe = meta.styleWorkspaces[getSettings().currentStyleName].logicProbes[getActiveProbeKey()];
        if (probe.type === type) return;

        probe.type = type;
        setProbeDirty(true);
        saveSettingsDebounced();
        renderLogicDrawer();
    });

    $overlay.on('input', '#plz-logic-true, #plz-logic-false', function() {
        const meta = getMetaSettings();
        const probe = meta.styleWorkspaces[getSettings().currentStyleName].logicProbes[getActiveProbeKey()];
        probe.trueTemplate = $('#plz-logic-true').val();
        probe.falseTemplate = $('#plz-logic-false').val();
        setProbeDirty(true);
        syncLogicSelector();
        saveSettingsDebounced();
    });

    $overlay.on('input', '#plz-logic-prompt-preview', function() {
        const meta = getMetaSettings();
        const style = meta.styleWorkspaces[getSettings().currentStyleName];
        const probe = style.logicProbes[getActiveProbeKey()];
        const newVal = $(this).val();

        // Circular Logic Guard
        if (isCircular(style.logicProbes, getActiveProbeKey(), newVal)) {
            if (window.toastr) window.toastr.error('Circular logic detected.');
            $(this).val(probe.prompt);
            return;
        }

        probe.prompt = newVal;
        setProbeDirty(true);
        syncLogicSelector();
        saveSettingsDebounced();
    });

    // 3. Cursor-Based Token Injection
    $overlay.on('click', '.plz-token-inject', function(e) {
        e.stopPropagation();
        const token = $(this).data('token');
        const $ta   = $(getLastFocusedInput());
        const el    = $ta[0];
        if (!el) return;

        const start = el.selectionStart;
        const end   = el.selectionEnd;
        const val   = el.value;

        const textToInsert = getInjectionString(token);

        el.value = val.substring(0, start) + textToInsert + val.substring(end);
        el.selectionStart = el.selectionEnd = start + textToInsert.length;

        $ta.trigger('input');
        el.focus();

        // UI Pulse
        const $this = $(this);
        const originalColor = $this.css('color');
        $this.css('color', '#fff');
        setTimeout(() => $this.css('color', originalColor), 200);
    });

    // 4. Help & Modals
    $overlay.on('click', '.plz-logic-help', (e) => {
        e.stopPropagation();
        showLogicHelp();
    });

    $overlay.on('click', '#plz-logic-edit-prompt', async () => {
        const meta = getMetaSettings();
        const styleName = getSettings().currentStyleName;
        const probes = meta.styleWorkspaces[styleName].logicProbes;
        const probeKey = getActiveProbeKey();
        const probe = probes[probeKey];

        const vars = [
            { v: '{{history}}', d: 'Chat context' },
            { v: '{{current_turn}}', d: 'Latest message' },
            { v: '{{character_name}}', d: 'Active ID' }
        ];

        const workshopChar = state.chatCharacters[state._workshopCharacterId];
        const slots = workshopChar?.slots || [];
        const identity = Object.keys(workshopChar?.identity || {});
        slots.forEach(s => vars.push({ v: `{{${s}}}`, d: 'Clothing Slot' }));
        identity.forEach(i => vars.push({ v: `{{${i}}}`, d: 'Identity Trait' }));
        
        Object.keys(probes).forEach(k => { if (k !== probeKey) vars.push({ v: `{{${k}}}`, d: 'Other Logic' }); });

        if (probe.type === 'computational') {
            ['is', 'in', 'contains', 'empty', '!', 'AND', 'OR'].forEach(op => vars.push({ v: op, d: 'Operator' }));
        }

        const result = await openTextModal({
            title: probe.type === 'computational' ? `Logic Expression: ${probeKey}` : `Logic Query: ${probeKey}`,
            initialValue: probe.prompt,
            variables: vars
        });

        if (result !== null) {
            if (isCircular(probes, probeKey, result)) {
                if (window.toastr) window.toastr.error('Circular Logic Detected.', 'Logic Error');
                return;
            }
            probe.prompt = result;
            setProbeDirty(true);
            saveSettingsDebounced();
            renderLogicDrawer();
        }
    });

    // 5. Execution Test
    $overlay.on('click', '#plz-logic-test-probe', async function() {
        const meta = getMetaSettings();
        const probeKey = getActiveProbeKey();
        const probe = meta.styleWorkspaces[getSettings().currentStyleName].logicProbes[probeKey];
        const $btn = $(this);
        const originalHtml = $btn.html();
        
        $btn.prop('disabled', true).text('Evaluating...');
        await handleTestProbe(probeKey, probe);
        $btn.prop('disabled', false).html(originalHtml);
    });
}