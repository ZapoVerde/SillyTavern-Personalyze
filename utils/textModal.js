/**
 * @file data/default-user/extensions/personalyze/utils/textModal.js
 * @stamp {"utc":"2026-04-28T00:00:00.000Z"}
 * @architectural-role Utility / Overlay UI
 * @description
 * Fullscreen-capable text editing overlay. Appends directly to document.body.
 * Participates in the shared _modalStack from modal.js so that Escape key
 * routing is correct when stacked on top of other overlays — only the topmost
 * modal responds to Escape at any given time.
 *
 * @api-declaration
 * openTextModal(config) -> Promise<string|null>
 *
 * @contract
 *   assertions:
 *     purity: IO / Side-effect (DOM Mutation)
 *     state_ownership: [_modalStack (shared)]
 *     external_io: [document.body, smartResize, escapeHtml, _modalStack]
 */

import { smartResize } from './dom.js';
import { escapeHtml } from './history.js';
import { _modalStack } from './modal.js';

/**
 * Opens a self-contained text editing overlay.
 *
 * @param {object}   config
 * @param {string}   config.title                - Modal heading
 * @param {string}   [config.initialValue='']    - Pre-filled textarea content
 * @param {Array}    [config.variables=[]]        - [{v, d}] variable reference rows
 * @param {Array}    [config.extraButtons=[]]     - [{label, id, onClick($ta)}] extra action buttons
 * @returns {Promise<string|null>} Resolves with textarea value on Done, null on cancel/escape
 */
export function openTextModal({ title, initialValue = '', variables = [], extraButtons = [] }) {
    return new Promise((resolve) => {
        let settled = false;

        const teardown = (value) => {
            if (settled) return;
            settled = true;
            const idx = _modalStack.indexOf(teardown);
            if (idx !== -1) _modalStack.splice(idx, 1);
            $(document).off('keydown', escHandler);
            $overlay.remove();
            resolve(value);
        };

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

        // Escape — only fires if this is the topmost stacked overlay
        const escHandler = (e) => {
            if (e.key === 'Escape' && _modalStack[_modalStack.length - 1] === teardown) {
                teardown(null);
            }
        };
        $(document).on('keydown', escHandler);

        $('body').append($overlay);
        _modalStack.push(teardown);

        // Init textarea size and focus after render
        requestAnimationFrame(() => {
            smartResize($ta[0]);
            $ta[0]?.focus();
        });
    });
}
