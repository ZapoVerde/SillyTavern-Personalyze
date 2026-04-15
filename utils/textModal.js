/**
 * @file data/default-user/extensions/personalyze/utils/textModal.js
 * @stamp {"utc":"2026-04-15T00:00:00.000Z"}
 * @architectural-role Utility / Overlay UI
 * @description
 * Provides a fullscreen-capable text editing overlay that bypasses SillyTavern's
 * callPopup entirely. Appends directly to document.body. Scroll is self-contained
 * within the modal body. All click events are captured to prevent bleed-through.
 *
 * @api-declaration
 * openTextModal(config) -> Promise<string|null>
 *
 * @contract
 *   assertions:
 *     purity: IO / Side-effect (DOM Mutation)
 *     state_ownership: []
 *     external_io: [document.body, smartResize, escapeHtml]
 */

import { smartResize } from './dom.js';
import { escapeHtml } from './history.js';

/**
 * Opens a self-contained text editing overlay.
 *
 * @param {object}   config
 * @param {string}   config.title         - Modal heading
 * @param {string}   [config.initialValue=''] - Pre-filled textarea content
 * @param {Array}    [config.variables=[]]    - [{v, d}] variable reference rows
 * @param {Array}    [config.extraButtons=[]] - [{label, id, onClick($ta)}] extra action buttons
 * @returns {Promise<string|null>} Resolves with textarea value on Done, null on cancel/escape
 */
export function openTextModal({ title, initialValue = '', variables = [], extraButtons = [] }) {
    return new Promise((resolve) => {
        const varsHtml = variables.length ? `
            <div class="plz-var-list">
                ${variables.map(e => `
                    <div class="plz-var-row">
                        <button class="menu_button plz-var-copy-btn" data-copy="${escapeHtml(e.v)}">
                            <i class="fa-regular fa-copy"></i>
                        </button>
                        <code class="plz-var-code">${escapeHtml(e.v)}</code>
                        <span class="plz-var-desc">— ${escapeHtml(e.d)}</span>
                    </div>`).join('')}
            </div>` : '';

        const extraBtnsHtml = extraButtons.length ? `
            <div class="plz-text-modal-actions">
                ${extraButtons.map(b => `<button class="menu_button" id="${escapeHtml(b.id)}">${escapeHtml(b.label)}</button>`).join('')}
            </div>` : '';

        const $overlay = $(`
            <div class="plz-overlay plz-text-modal-overlay">
                <div class="plz-modal plz-text-modal" role="dialog" aria-modal="true">
                    <button class="plz-text-modal-fab">Done</button>
                    <div class="plz-text-modal-header">
                        <h3>${escapeHtml(title)}</h3>
                    </div>
                    <div class="plz-text-modal-body">
                        ${varsHtml}
                        <textarea class="text_pole plz-text-modal-ta" spellcheck="false">${escapeHtml(initialValue)}</textarea>
                        ${extraBtnsHtml}
                    </div>
                </div>
            </div>`);

        const $ta = $overlay.find('.plz-text-modal-ta');

        const teardown = (value) => {
            $(document).off('.plzTextModal');
            $overlay.remove();
            resolve(value);
        };

        // Auto-resize on input
        $ta.on('input', () => smartResize($ta[0]));

        // Done FAB
        $overlay.find('.plz-text-modal-fab').on('click', () => teardown($ta.val()));

        // Extra buttons
        extraButtons.forEach(b => {
            $overlay.find(`#${b.id}`).on('click', () => b.onClick($ta));
        });

        // Copy buttons
        $overlay.on('click', '.plz-var-copy-btn', function(e) {
            e.stopPropagation();
            navigator.clipboard.writeText($(this).data('copy'));
        });

        // Backdrop absorbs all clicks — modal stops propagation so only true backdrop clicks reach here
        $overlay.on('mousedown touchstart', (e) => {
            e.stopPropagation();
            e.preventDefault();
            if ($(e.target).is($overlay)) teardown(null);
        });
        $overlay.find('.plz-modal').on('mousedown touchstart', (e) => e.stopPropagation());

        // Escape to cancel
        $(document).on('keydown.plzTextModal', (e) => {
            if (e.key === 'Escape') teardown(null);
        });

        $('body').append($overlay);

        // Init textarea size and focus after render
        requestAnimationFrame(() => {
            smartResize($ta[0]);
            $ta[0]?.focus();
        });
    });
}
