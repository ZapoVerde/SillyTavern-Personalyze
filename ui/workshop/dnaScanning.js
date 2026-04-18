/**
 * @file data/default-user/extensions/personalyze/ui/workshop/dnaScanning.js
 * @stamp {"utc":"2026-04-18T16:25:00.000Z"}
 * @architectural-role UI Sub-module (LLM Tools)
 * @description
 * Handles LLM-driven character scanning tools in the Studio.
 *
 * Updated for Granular Identity Architecture:
 * 1. Overhauled Identity Scan to populate granular Physical Identity grid.
 * 2. Dynamically updates character physical schema with newly discovered features.
 * 3. Triggers UI re-render and DNA commitment upon successful discovery.
 * 4. Fixed race condition mapping bug where newly discovered keys triggered a UI rebuild
 *    before existing keys were saved to memory.
 * 5. Fixed Force Costume Scan where meta-slots (Emotion, Pose) failed to populate
 *    due to being raw objects rather than un-wrapped strings.
 *
 * @api-declaration
 * bindScanningHandlers($overlay)
 * 
 * @contract
 *   assertions:
 *     purity: IO / Stateful UI
 *     state_ownership: [state.chatCharacters]
 *     external_io: [LLM Services, history.js, state.js, DOM, dnaListeners.js]
 */

import { getContext } from '../../../../../extensions.js';
import { state } from '../../state.js';
import { getSettings } from '../../settings.js';
import { META_SLOTS } from '../../defaults.js';
import { buildDescriberContext, buildHistoryText } from '../../utils/history.js';
import { detectAnchorScan, detectForceCostume } from '../../io/llm/workshop.js';
import { parsePhase3, mergeLayeredUpdate } from '../../logic/parsers.js';
import { renderStudioView, getGridLayers } from './dnaListeners.js';

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
            if (result && result.identity) {
                const char = state.chatCharacters[id];
                let schemaChanged = false;

                // FIX: Write all new identity items directly to state synchronously first
                // to prevent the UI re-render from wiping out the form values with stale memory.
                for (const [key, val] of Object.entries(result.identity)) {
                    if (char.identity[key] === undefined) {
                        schemaChanged = true;
                    }
                    char.identity[key] = val;
                }

                if (schemaChanged) {
                    // SCHEMA GROWTH: New physical traits discovered. Full re-render.
                    renderStudioView();
                    // Final trigger to ensure the new state is committed to DNA ledger
                    $('.plz-studio-identity-item').trigger('input');
                } else {
                    // If no schema growth, just update the existing DOM inputs directly
                    for (const [key, val] of Object.entries(result.identity)) {
                        const $input = $(`.plz-studio-identity-item[data-key="${key}"]`);
                        if ($input.length) {
                            $input.val(val).trigger('input');
                        }
                    }
                }

                if (window.toastr) window.toastr.success(`Physical traits updated for ${result.name || id}.`);
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

            // Pass the raw parsed output through the standardized merge pipeline.
            // This safely flattens meta-slots into strings and handles 'KEEP' or 'None' gracefully.
            const parsed = parsePhase3(raw);
            const currentLayers = getGridLayers();
            const newLayers = mergeLayeredUpdate(currentLayers, parsed);

            // Populate meta-slots (now guaranteed to be un-wrapped strings)
            if (newLayers.emotion) $('#plz-layer-emotion').val(newLayers.emotion).trigger('input');
            if (newLayers.pose)    $('#plz-layer-pose').val(newLayers.pose).trigger('input');

            // Populate clothing slots (guaranteed to be objects or null)
            Object.entries(newLayers).forEach(([slot, val]) => {
                if (META_SLOTS.includes(slot)) return;
                const $item = $(`.plz-layer-item[data-slot="${slot}"]`);
                const $mod  = $(`.plz-layer-mod[data-slot="${slot}"]`);
                
                if ($item.length) $item.val(val?.item ?? '').trigger('input');
                if ($mod.length)  $mod.val(val?.modifier ?? '').trigger('input');
            });
        } catch (err) {
            if (window.toastr) window.toastr.error('Costume scan failed.');
        } finally {
            $btn.prop('disabled', false).text(originalText);
        }
    });
}