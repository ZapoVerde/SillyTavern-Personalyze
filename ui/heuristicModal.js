/**
 * @file data/default-user/extensions/personalyze/ui/heuristicModal.js
 * @stamp {"utc":"2026-04-14T12:30:00.000Z"}
 * @architectural-role UI Orchestrator
 * @description
 * Renders the Heuristic Approval Modal for newly detected characters.
 * Allows users to prevent false-positives from pulling characters into
 * the active scene unnecessarily.
 *
 * @api-declaration
 * showHeuristicApprovalModal(detectedIds) -> Promise<string[]>
 *
 * @contract
 *   assertions:
 *     purity: IO Executor
 *     state_ownership: []
 *     external_io: [callPopup, jQuery]
 */

import { callPopup } from '../../../../../script.js';
import { state } from '../state.js';
import { escapeHtml } from '../utils/history.js';

/**
 * Displays a modal for the user to approve which newly detected characters
 * should be added to the active roster.
 * 
 * @param {string[]} detectedIds - List of character IDs found by the heuristic.
 * @returns {Promise<string[]>} - List of approved IDs.
 */
export async function showHeuristicApprovalModal(detectedIds) {
    if (!detectedIds || detectedIds.length === 0) return [];

    const rows = detectedIds.map(id => {
        const char = state.chatCharacters[id];
        const label = char?.label || id.replace(/_/g, ' ');
        return `
        <div class="plz-heuristic-row" style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid var(--SmartThemeBorderColor);">
            <div style="display:flex; flex-direction:column; gap:2px; flex:1; margin-right:12px;">
                <strong style="font-size:0.95em;">${escapeHtml(label)}</strong>
                <small style="opacity:0.5; font-size:0.75em; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden;">
                    ${escapeHtml(char?.identityAnchor || '—')}
                </small>
            </div>
            <label class="checkbox_label" style="margin:0; cursor:pointer; display:flex; align-items:center; gap:8px;">
                <input type="checkbox" class="plz-heuristic-check" data-id="${escapeHtml(id)}" checked />
                <span>Load</span>
            </label>
        </div>`;
    }).join('');

    const html = `
    <div id="plz-heuristic-modal">
        <h3 style="margin-top:0;"><i class="fa-solid fa-users-viewfinder"></i> Characters Detected</h3>
        <p style="font-size:0.85em; opacity:0.8; margin-bottom:12px;">
            The following characters were mentioned in the narrative. Select who should be added to the scene:
        </p>
        <div style="max-height:300px; overflow-y:auto; background:rgba(0,0,0,0.15); border-radius:6px; border:1px solid var(--SmartThemeBorderColor); margin-bottom:10px;">
            ${rows}
        </div>
    </div>`;

    return new Promise((resolve) => {
        callPopup(html, 'confirm').then(ok => {
            if (!ok) {
                // If user clicks Cancel or closes modal, we treat all newly detected as "No"
                resolve([]);
                return;
            }
            
            const approved = [];
            $('.plz-heuristic-check:checked').each(function() {
                approved.push($(this).data('id'));
            });
            resolve(approved);
        }).catch(() => {
            resolve([]);
        });
    });
}