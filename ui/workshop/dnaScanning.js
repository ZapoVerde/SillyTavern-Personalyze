/**
 * @file data/default-user/extensions/personalyze/ui/workshop/dnaScanning.js
 * @stamp {"utc":"2026-04-12T11:50:00.000Z"}
 * @architectural-role UI Sub-module (LLM Tools)
 * @description
 * Handles LLM-driven character scanning tools in the Studio.
 * Implements "Anchor Scan" (Identity) and "Force Costume" (Costume Scan).
 * 
 * Logic:
 * - If character is '__new__', Anchor Scan uses the label input as the search focus.
 * - Population triggers 'input' events to ensure dnaIdentity and dnaListeners
 *   receive the new data for memory updates.
 * 
 * @api-declaration
 * bindScanningHandlers($overlay)
 * 
 * @contract
 *   assertions:
 *     purity: IO / Stateful UI
 *     state_ownership: [state.chatCharacters]
 *     external_io: [LLM Services, history.js, state.js, DOM]
 */

import { getContext } from '../../../../../extensions.js';
import { state } from '../../state.js';
import { getSettings } from '../../settings.js';
import { META_SLOTS } from '../../defaults.js';
import { buildDescriberContext, buildHistoryText } from '../../utils/history.js';
import { detectAnchorScan, detectForceCostume } from '../../io/llm/workshop.js';
import { parsePhase3 } from '../../logic/parsers.js';

/**
 * Binds event listeners for LLM-driven scanning tools.
 * @param {jQuery} $overlay - The workshop modal overlay.
 */
export function bindScanningHandlers($overlay) {

    // ─── Identity Anchor Scan ───
    $overlay.on('click', '.plz-anchor-scan', async function() {
        const s = getSettings();
        const lastIdx = Math.max(0, getContext().chat.length - 1);
        const context = buildDescriberContext(getContext().chat, lastIdx, s.describerHistory);
        
        const id = state._workshopCharacterId;
        let focus = id;
        
        // Revised Logic: If ghost, pull focus name from the label input field
        if (id === '__new__') {
            focus = $('#plz-studio-label').val().trim();
            if (!focus) {
                if (window.toastr) window.toastr.warning('Please enter a character name first to scan for.', 'PersonaLyze');
                return;
            }
        }
        
        const $btn = $(this);
        const originalHtml = $btn.html();
        $btn.prop('disabled', true).text('Scanning...');

        try {
            const result = await detectAnchorScan(context, focus, s.smartProfileId);
            if (result) {
                $('#plz-studio-anchor').val(result.anchor).trigger('input');
            }
        } catch (err) {
            if (window.toastr) window.toastr.error('Identity scan failed.');
        } finally {
            $btn.prop('disabled', false).html(originalHtml);
        }
    });

    // ─── Force Costume Scan ───
    $overlay.on('click', '#plz-studio-force-costume', async function() {
        const id = state._workshopCharacterId;
        if (!id) return;
        
        // Resolve focus name: use input label for ghosts, stored label for others
        const label = id === '__new__' 
            ? $('#plz-studio-label').val().trim() 
            : (state.chatCharacters[id]?.label || id.replace(/_/g, ' '));
            
        if (id === '__new__' && !label) {
            if (window.toastr) window.toastr.warning('Enter a character name first to use as a scan focus.', 'PersonaLyze');
            return;
        }

        const s = getSettings();
        const hint = $('#plz-studio-hint').val().trim();
        const lastIdx = Math.max(0, getContext().chat.length - 1);
        const chat = getContext().chat;
        const currentTurn = buildDescriberContext(chat, lastIdx, 0);
        const history = buildHistoryText(chat, lastIdx, s.detectionHistory ?? 4);

        const $btn = $(this);
        const originalText = $btn.text();
        $btn.prop('disabled', true).text('Scanning...');

        try {
            const raw = await detectForceCostume(history, currentTurn, label, hint, s.forceCostumeHintTemplate, s.smartProfileId, s.forceCostumePrompt);
            const layers = parsePhase3(raw);

            // Populate meta-slots
            if (layers.emotion) $('#plz-layer-emotion').val(layers.emotion).trigger('input');
            if (layers.pose)    $('#plz-layer-pose').val(layers.pose).trigger('input');

            // Populate clothing slots
            Object.entries(layers).forEach(([slot, val]) => {
                if (META_SLOTS.includes(slot)) return;
                const $item = $(`.plz-layer-item[data-slot="${slot}"]`);
                const $mod  = $(`.plz-layer-mod[data-slot="${slot}"]`);
                
                if ($item.length) $item.val(val?.item || '').trigger('input');
                if ($mod.length)  $mod.val(val?.modifier || '').trigger('input');
            });
        } catch (err) {
            if (window.toastr) window.toastr.error('Costume scan failed.');
        } finally {
            $btn.prop('disabled', false).text(originalText);
        }
    });
}