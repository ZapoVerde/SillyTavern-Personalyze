/**
 * @file data/default-user/extensions/personalyze/ui/workshop/styleLogicListeners.js
 * @stamp {"utc":"2026-05-01T18:00:00.000Z"}
 * @architectural-role UI Controller (Global Style Logic)
 * @description
 * Manages event listeners and state synchronization for the Logic Probes drawer.
 * Features cursor-aware variable injection for the logic prompt preview,
 * enabling seamless DSL and query construction without clipboard usage.
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
import { confirmModal, promptModal, openModal } from '../../utils/modal.js';
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

    // Manual Edit Support for Inline Prompt Preview
    $overlay.on('input', '#plz-logic-prompt-preview', function() {
        const meta = getMetaSettings();
        const style = meta.styleWorkspaces[getSettings().currentStyleName];
        const probe = style.logicProbes[_activeProbeKey];
        const newVal = $(this).val();

        if (isCircular(style.logicProbes, _activeProbeKey, newVal)) {
            if (window.toastr) window.toastr.error('Circular logic detected.');
            $(this).val(probe.prompt);
            return;
        }

        probe.prompt = newVal;
        _isProbeDirty = true;
        _syncSelector();
        saveSettingsDebounced();
    });

    // Cursor-Based Token Injection (Inline Legend)
    $overlay.on('click', '.plz-token-inject', function(e) {
        e.stopPropagation();
        const token = $(this).data('token');
        const $ta   = $('#plz-logic-prompt-preview');
        const el    = $ta[0];
        if (!el) return;

        const start = el.selectionStart;
        const end   = el.selectionEnd;
        const val   = el.value;

        const isOp = ['!', 'is', 'in', 'contains', 'empty', 'AND', 'OR'].includes(token);
        const textToInsert = isOp ? ` ${token} ` : token;

        el.value = val.substring(0, start) + textToInsert + val.substring(end);
        el.selectionStart = el.selectionEnd = start + textToInsert.length;

        $ta.trigger('input');
        el.focus();

        const $this = $(this);
        const originalColor = $this.css('color');
        $this.css('color', '#fff');
        setTimeout(() => $this.css('color', originalColor), 200);
    });

    // Syntax Guide / Help Modal
    $overlay.on('click', '.plz-logic-help', async function(e) {
        e.stopPropagation();
        const content = `
        <div style="font-size:0.9em; line-height:1.5; display:flex; flex-direction:column; gap:12px;">
            <p style="margin:0;">Computational probes evaluate instantly (zero cost) by directly checking the character's current state and traits.</p>
            
            <div style="background:rgba(0,0,0,0.2); padding:10px; border-radius:6px; border:1px solid var(--SmartThemeBorderColor);">
                <strong style="color:var(--SmartThemeQuoteColor);">Atomic Operators</strong>
                <ul style="margin:5px 0 0 20px; padding:0;">
                    <li style="margin-bottom:4px;"><code style="color:var(--SmartThemeEmColor);">is</code> : Strict whole-word match.</li>
                    <li style="margin-bottom:4px;"><code style="color:var(--SmartThemeEmColor);">in</code> : List membership. Items should be comma-separated. Parentheses are required.</li>
                    <li style="margin-bottom:4px;"><code style="color:var(--SmartThemeEmColor);">contains</code> : Loose partial string match.</li>
                    <li><code style="color:var(--SmartThemeEmColor);">empty</code> : True if the value is missing, "none", or "unspecified".</li>
                </ul>
            </div>

            <div style="background:rgba(0,0,0,0.2); padding:10px; border-radius:6px; border:1px solid var(--SmartThemeBorderColor);">
                <strong style="color:var(--SmartThemeQuoteColor);">Boolean Logic</strong>
                <p style="margin:5px 0 0 0;">You can chain conditions using <code style="color:var(--SmartThemeEmColor);">AND</code>, <code style="color:var(--SmartThemeEmColor);">OR</code>, and <code style="color:var(--SmartThemeEmColor);">!</code> (NOT). Use parentheses <code style="color:var(--SmartThemeEmColor);">()</code> to control the order of operations.</p>
            </div>

            <div style="background:rgba(0,0,0,0.2); padding:10px; border-radius:6px; border:1px solid var(--SmartThemeBorderColor);">
                <strong style="color:var(--SmartThemeQuoteColor);">Examples</strong>
                <ul style="margin:5px 0 0 0; padding:0; list-style-type:none;">
                    <li style="margin-bottom:6px;"><code style="background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px;">{{top}} is t-shirt</code></li>
                    <li style="margin-bottom:6px;"><code style="background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px;">{{gender}} in (female, girl)</code></li>
                    <li style="margin-bottom:6px;"><code style="background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px;">{{eyes}} contains blue</code></li>
                    <li style="margin-bottom:6px;"><code style="background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px;">{{outerwear}} empty</code></li>
                    <li style="margin-bottom:6px;"><code style="background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px;">! {{top}} empty</code></li>
                    <li><code style="background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px; display:inline-block; line-height:1.4;">(! {{is_wet}} empty AND {{top}} empty) OR ({{pose}} contains sitting)</code></li>
                </ul>
            </div>
        </div>`;

        await openModal({
            title: 'Computational Logic Syntax',
            content,
            width: 'min(600px, 95vw)',
            buttons: [{ label: 'Close', value: null, style: 'muted' }]
        });
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
            vars.push({ v: 'is',       d: 'Strict Whole-Word Match' });
            vars.push({ v: 'in',       d: 'List Membership (a, b)' });
            vars.push({ v: 'contains', d: 'Partial Fuzzy Match' });
            vars.push({ v: 'empty',    d: 'Check Missing Value' });
            vars.push({ v: '!',        d: 'NOT (Negation)' });
            vars.push({ v: 'AND',      d: 'Logical AND' });
            vars.push({ v: 'OR',       d: 'Logical OR' });
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