/**
 * @file data/default-user/extensions/personalyze/ui/heuristicModal.js
 * @stamp {"utc":"2026-04-28T00:00:00.000Z"}
 * @architectural-role UI Orchestrator
 * @description
 * Renders the Heuristic Approval Modal for newly detected characters.
 * Allows users to triage each detected character: Load to scene, Snooze for N
 * turns, or Archive permanently.
 *
 * Migrated from callPopup to self-owned openModal overlay.
 *
 * @api-declaration
 * showHeuristicApprovalModal(detectedIds) -> Promise<{
 *   load:    string[],
 *   snooze:  { id: string, duration: number }[],
 *   archive: string[],
 * }>
 *
 * @contract
 *   assertions:
 *     purity: IO Executor
 *     state_ownership: []
 *     external_io: [openModal, jQuery]
 */

import { openModal } from '../utils/modal.js';
import { state } from '../state.js';
import { escapeHtml } from '../utils/history.js';

const EMPTY = { load: [], snooze: [], archive: [] };

/**
 * Builds a short identity preview string from the granular identity map.
 */
function buildIdentityPreview(identity) {
    if (!identity || typeof identity !== 'object') return '—';
    const values = Object.values(identity).filter(Boolean);
    if (values.length === 0) return '—';
    const preview = values.slice(0, 3).join(', ');
    return preview.length > 80 ? preview.slice(0, 77) + '...' : preview;
}

/**
 * Scrapes the triage rows and returns categorised character lists.
 * @param {jQuery} $m
 */
function scrapeDecisions($m) {
    const load = [], snooze = [], archive = [];
    $m.find('.plz-heuristic-row').each(function() {
        const id = $(this).data('id');
        const action = $(this).find('.plz-heuristic-action:checked').val();
        if (action === 'load') {
            load.push(id);
        } else if (action === 'snooze') {
            const duration = parseInt($(this).find('.plz-snooze-turns').val(), 10) || 3;
            snooze.push({ id, duration });
        } else if (action === 'archive') {
            archive.push(id);
        }
    });
    return { load, snooze, archive };
}

/**
 * Displays a modal for the user to triage newly detected characters.
 *
 * @param {string[]} detectedIds
 * @returns {Promise<{ load: string[], snooze: { id: string, duration: number }[], archive: string[] }>}
 */
export async function showHeuristicApprovalModal(detectedIds) {
    if (!detectedIds || detectedIds.length === 0) return EMPTY;

    const rows = detectedIds.map(id => {
        const char = state.chatCharacters[id];
        const label = char?.label || id.replace(/_/g, ' ');
        const preview = buildIdentityPreview(char?.identity);
        const safeId = escapeHtml(id);
        return `
        <div class="plz-heuristic-row" data-id="${safeId}" style="padding:10px; border-bottom:1px solid var(--SmartThemeBorderColor);">
            <div style="display:flex; flex-direction:column; gap:2px; margin-bottom:8px;">
                <strong style="font-size:0.95em;">${escapeHtml(label)}</strong>
                <small style="opacity:0.5; font-size:0.75em; display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; overflow:hidden;">
                    ${escapeHtml(preview)}
                </small>
            </div>
            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                <label style="display:flex; align-items:center; gap:5px; cursor:pointer; margin:0;">
                    <input type="radio" name="plz-action-${safeId}" class="plz-heuristic-action" value="load" checked />
                    <span><i class="fa-solid fa-circle-play"></i> Load</span>
                </label>
                <label style="display:flex; align-items:center; gap:5px; cursor:pointer; margin:0;">
                    <input type="radio" name="plz-action-${safeId}" class="plz-heuristic-action" value="skip" />
                    <span><i class="fa-solid fa-forward-step"></i> Skip</span>
                </label>
                <label style="display:flex; align-items:center; gap:5px; cursor:pointer; margin:0;">
                    <input type="radio" name="plz-action-${safeId}" class="plz-heuristic-action" value="snooze" />
                    <span><i class="fa-solid fa-clock"></i> Snooze</span>
                    <input type="number" class="plz-snooze-turns" min="1" max="99" value="3" disabled
                           style="width:48px; padding:2px 4px; border-radius:4px; background:var(--SmartThemeBlurTintColor); border:1px solid var(--SmartThemeBorderColor); color:inherit; text-align:center;" />
                    <span style="font-size:0.8em; opacity:0.7;">turns</span>
                </label>
                <label style="display:flex; align-items:center; gap:5px; cursor:pointer; margin:0;">
                    <input type="radio" name="plz-action-${safeId}" class="plz-heuristic-action" value="archive" />
                    <span><i class="fa-solid fa-box-archive"></i> Archive</span>
                </label>
            </div>
        </div>`;
    }).join('');

    const content = `
    <div id="plz-heuristic-modal">
        <h3 style="margin-top:0;"><i class="fa-solid fa-users-viewfinder"></i> Characters Detected</h3>
        <p style="font-size:0.85em; opacity:0.8; margin-bottom:12px;">
            The following characters were mentioned. Choose what to do with each:
        </p>
        <div style="max-height:340px; overflow-y:auto; background:rgba(0,0,0,0.15); border-radius:6px; border:1px solid var(--SmartThemeBorderColor); margin-bottom:10px;">
            ${rows}
        </div>
    </div>`;

    const result = await openModal({
        content,
        buttons: [
            {
                label: 'Accept',
                onClick: ($m, resolve) => resolve(scrapeDecisions($m)),
            },
            {
                label: 'Skip All',
                value: null,
            },
        ],
        onReady: ($m) => {
            $m.on('change', '.plz-heuristic-action', function() {
                const $row = $(this).closest('.plz-heuristic-row');
                $row.find('.plz-snooze-turns').prop('disabled', $(this).val() !== 'snooze');
            });
        },
    });

    return result ?? EMPTY;
}
