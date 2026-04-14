/**
 * @file data/default-user/extensions/personalyze/utils/dom.js
 * @stamp {"utc":"2026-04-18T22:00:00.000Z"}
 * @architectural-role Utility / DOM Helper
 * @description
 * Provides layout and sizing utilities for the Personalyze UI. 
 * Implements a Portal-based Mobile Focus Mode that breaks textareas out of
 * nested SillyTavern modals into the document body to ensure correct viewport centering.
 *
 * @api-declaration
 * smartResize(el) -> void
 * initMobileFocusMode() -> void
 *
 * @contract
 *   assertions:
 *     purity: Side-effect (DOM Mutation / Portal Pattern)
 *     state_ownership: []
 *     external_io: [Element.style, Element.parentNode, document.body]
 */

/**
 * Automatically adjusts the height of a textarea to match its content.
 * 
 * @param {HTMLTextAreaElement|HTMLElement} el 
 */
export function smartResize(el) {
    if (!el) return;
    
    // 1. Prevent internal scrollbars
    el.style.overflow = 'hidden';

    // 2. Reset to 'auto' for measurement
    el.style.height = 'auto';

    // 3. Snap to scrollHeight
    el.style.height = el.scrollHeight + 'px';

    el.style.resize = 'none';
}

/**
 * Initializes Global Focus Mode for mobile text entry.
 * On focus: Moves the element to document.body and leaves a placeholder.
 * On blur: Returns the element to its original spot in the DOM.
 */
export function initMobileFocusMode() {
    let $exitBtn = null;
    let placeholder = null;

    /**
     * Restores the element to its original DOM position and cleans up UI.
     */
    const exitFocusMode = (el) => {
        document.body.classList.remove('plz-focus-active');
        el.classList.remove('plz-fullscreen-input');
        
        if ($exitBtn) {
            $exitBtn.remove();
            $exitBtn = null;
        }

        // Restore original location via placeholder replacement
        if (placeholder && placeholder.parentNode) {
            placeholder.parentNode.replaceChild(el, placeholder);
            placeholder = null;
            // Notify local logic that the content may have changed
            $(el).trigger('input');
        }

        // Reset auto-sizing
        smartResize(el);
    };

    // 1. Focus Entry (The Portal Move)
    $(document).on('focusin', '.plz-auto-textarea', function() {
        // Prevent recursive triggers if already fullscreen
        if (this.classList.contains('plz-fullscreen-input')) return;

        // Breakpoint: Only trigger on mobile/small tablet screens
        if (window.innerWidth > 768) return;

        const el = this;

        // Guard against focusout firing during the move
        el.dataset.moving = 'true';

        document.body.classList.add('plz-focus-active');
        el.classList.add('plz-fullscreen-input');

        // Create a placeholder to maintain the layout flow in the original modal
        placeholder = document.createElement('div');
        placeholder.className = 'plz-focus-placeholder';
        placeholder.style.width = el.offsetWidth + 'px';
        placeholder.style.height = el.offsetHeight + 'px';
        
        // Portal: Swap placeholder in, move textarea to body
        el.parentNode.insertBefore(placeholder, el);
        document.body.appendChild(el);

        // Create escape hatch button
        if (!$exitBtn) {
            $exitBtn = $('<button class="plz-focus-exit-btn">Done</button>');
            $('body').append($exitBtn);

            $exitBtn.on('mousedown touchstart', (e) => {
                e.preventDefault(); 
                el.blur(); 
            });
        }

        // Re-establish focus on the new body-level element
        setTimeout(() => {
            el.focus();
            delete el.dataset.moving;
        }, 20);
    });

    // 2. Focus Exit
    $(document).on('focusout', '.plz-auto-textarea', function() {
        // Do not cleanup if focusout was triggered by the portal move itself
        if (this.dataset.moving === 'true') return;
        exitFocusMode(this);
    });

    // 3. Backdrop Interception
    $(document).on('mousedown touchstart', function(e) {
        if (document.body.classList.contains('plz-focus-active')) {
            // If they clicked the dimmed background
            if (!$(e.target).closest('.plz-fullscreen-input, .plz-focus-exit-btn').length) {
                const activeEl = document.querySelector('.plz-fullscreen-input');
                if (activeEl) activeEl.blur(); 
            }
        }
    });
}