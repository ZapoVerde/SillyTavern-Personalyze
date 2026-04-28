/**
 * @file data/default-user/extensions/personalyze/utils/modal.js
 * @stamp {"utc":"2026-04-28T00:00:00.000Z"}
 * @architectural-role Utility / Overlay UI
 * @description
 * Self-contained modal utility. Each call appends its own overlay to body
 * and tears it down completely on close. Safe to stack and nest — no shared
 * DOM state with SillyTavern's callPopup singleton.
 *
 * @api-declaration
 * openModal(config)           -> Promise<any>
 * confirmModal(messageHtml)   -> Promise<boolean>
 * promptModal(title, initial) -> Promise<string|null>
 *
 * @contract
 *   assertions:
 *     purity: IO / Side-effect (DOM Mutation)
 *     state_ownership: [_modalStack]
 *     external_io: [document.body, escapeHtml]
 */

import { escapeHtml } from './history.js';

/** Tracks teardown functions for open modals, topmost last. */
const _modalStack = [];

/**
 * Opens a self-contained modal overlay.
 *
 * @param {object}   config
 * @param {string}   [config.title]               - Optional plain-text header title
 * @param {string}   config.content               - Trusted HTML string for the body
 * @param {string}   [config.width]               - Optional CSS width override
 * @param {Array}    [config.buttons=[]]           - Footer button descriptors:
 *   { label (HTML), id, value, onClick($overlay, resolve), style: 'danger'|'muted' }
 *   Buttons with `value` auto-resolve when clicked.
 *   Buttons with `onClick` call onClick($overlay, resolve) — caller controls resolution.
 * @param {Function} [config.onReady]              - onReady($overlay, resolve) called after mount
 * @param {boolean}  [config.closeOnBackdrop=true] - Whether backdrop click resolves null
 * @returns {Promise<any>} Resolves with a button value, onClick-provided value, or null
 */
export function openModal({ title, content, width, buttons = [], onReady, closeOnBackdrop = true }) {
    return new Promise((resolve) => {
        let settled = false;
        const cleanups = [];

        const teardown = (value) => {
            if (settled) return;
            settled = true;
            const idx = _modalStack.indexOf(teardown);
            if (idx !== -1) _modalStack.splice(idx, 1);
            cleanups.forEach(fn => fn());
            $overlay.remove();
            resolve(value);
        };

        const headerHtml = title
            ? `<div class="plz-modal-header"><h3>${escapeHtml(title)}</h3></div>`
            : '';

        const footerHtml = buttons.length
            ? `<div class="plz-modal-footer">${
                buttons.map(b => {
                    const cls = b.style === 'danger' ? ' plz-modal-btn--danger'
                              : b.style === 'muted'  ? ' plz-modal-btn--muted'
                              : '';
                    const id = b.id ? ` id="${escapeHtml(b.id)}"` : '';
                    return `<button class="menu_button${cls}"${id}>${b.label}</button>`;
                }).join('')
              }</div>`
            : '';

        const $overlay = $(`
            <div class="plz-overlay plz-modal-overlay">
                <div class="plz-modal plz-modal--compact" role="dialog" aria-modal="true">
                    ${headerHtml}
                    <div class="plz-modal-body">${content}</div>
                    ${footerHtml}
                </div>
            </div>`);

        if (width) $overlay.find('.plz-modal--compact').css('width', width);

        // Wire footer buttons by position (avoids id-selector fragility)
        const $btns = $overlay.find('.plz-modal-footer .menu_button');
        buttons.forEach((b, i) => {
            $btns.eq(i).on('click', () => {
                if (typeof b.onClick === 'function') {
                    b.onClick($overlay, teardown);
                } else {
                    teardown(b.value !== undefined ? b.value : null);
                }
            });
        });

        // Backdrop absorbs clicks — only true overlay clicks close
        if (closeOnBackdrop) {
            $overlay.on('mousedown touchstart', (e) => {
                e.stopPropagation();
                e.preventDefault();
                if ($(e.target).is($overlay)) teardown(null);
            });
        }
        $overlay.find('.plz-modal').on('mousedown touchstart', (e) => e.stopPropagation());

        // Escape key — only the topmost stacked modal responds
        const escHandler = (e) => {
            if (e.key === 'Escape' && _modalStack[_modalStack.length - 1] === teardown) {
                teardown(null);
            }
        };
        $(document).on('keydown', escHandler);
        cleanups.push(() => $(document).off('keydown', escHandler));

        $('body').append($overlay);
        _modalStack.push(teardown);

        if (typeof onReady === 'function') {
            onReady($overlay, teardown);
        }
    });
}

/**
 * Simple yes/no confirmation modal.
 *
 * @param {string} messageHtml - Trusted HTML message body
 * @returns {Promise<boolean>}
 */
export function confirmModal(messageHtml) {
    return openModal({
        content: `<div class="plz-modal-confirm-msg">${messageHtml}</div>`,
        buttons: [
            { label: 'OK',     id: 'plz-modal-ok',     value: true },
            { label: 'Cancel', id: 'plz-modal-cancel',  value: false, style: 'muted' },
        ],
    });
}

/**
 * Simple single-line text prompt modal.
 *
 * @param {string} title        - Plain-text modal heading
 * @param {string} [initial=''] - Pre-filled input value
 * @returns {Promise<string|null>} Trimmed string on OK, null on cancel/escape
 */
export function promptModal(title, initial = '') {
    return openModal({
        title,
        content: `<input class="text_pole plz-modal-prompt-input" type="text" value="${escapeHtml(initial)}" style="width:100%;" />`,
        buttons: [
            {
                label: 'OK',
                id: 'plz-modal-ok',
                onClick: ($m, resolve) => {
                    const val = $m.find('.plz-modal-prompt-input').val();
                    resolve(val != null ? val : null);
                },
            },
            { label: 'Cancel', id: 'plz-modal-cancel', value: null, style: 'muted' },
        ],
        onReady: ($m) => {
            const $input = $m.find('.plz-modal-prompt-input');
            requestAnimationFrame(() => $input[0]?.focus());
            $input.on('keydown', (e) => {
                if (e.key === 'Enter') $m.find('#plz-modal-ok').trigger('click');
            });
        },
    });
}
