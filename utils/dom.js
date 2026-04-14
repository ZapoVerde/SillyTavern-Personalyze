/**
 * @file data/default-user/extensions/personalyze/utils/dom.js
 * @stamp {"utc":"2026-04-18T21:00:00.000Z"}
 * @architectural-role Utility / DOM Helper
 * @description
 * Provides layout and sizing utilities for the Personalyze UI. 
 * Includes the smartResize logic and the Mobile Focus Mode takeover engine.
 *
 * @api-declaration
 * smartResize(el) -> void
 * initMobileFocusMode() -> void
 *
 * @contract
 *   assertions:
 *     purity: Side-effect (DOM Mutation)
 *     state_ownership: []
 *     external_io: [Element.style, Element.scrollHeight, document.body]
 */

/**
 * Automatically adjusts the height of a textarea to match its content.
 * Removes internal scrollbars to force parent containers to expand.
 * 
 * @param {HTMLTextAreaElement|HTMLElement} el 
 */
export function smartResize(el) {
    if (!el) return;
    
    // 1. Prevent internal scrollbars so the parent container is forced to grow
    el.style.overflow = 'hidden';

    // 2. Reset to 'auto' so the browser re-measures natural content height.
    el.style.height = 'auto';

    // 3. Set height exactly to content height.
    el.style.height = el.scrollHeight + 'px';

    el.style.resize = 'none';
}

/**
 * Initializes Global Focus Mode for mobile text entry.
 * Rips large textareas into a full-screen fixed view on small devices
 * to prevent the on-screen keyboard from squishing the composition area.
 */
export function initMobileFocusMode() {
    let $exitBtn = null;

    // Helper to close focus mode and restore layout
    const exitFocusMode = (el) => {
        document.body.classList.remove('plz-focus-active');
        el.classList.remove('plz-fullscreen-input');
        if ($exitBtn) {
            $exitBtn.remove();
            $exitBtn = null;
        }
        // Restore natural auto-height sizing
        smartResize(el);
    };

    // 1. Listen for focus (tapping into the box)
    $(document).on('focusin', '.plz-auto-textarea', function() {
        // Breakpoint: Only trigger on mobile/small tablet screens
        if (window.innerWidth > 768) return;

        const el = this;
        document.body.classList.add('plz-focus-active');
        el.classList.add('plz-fullscreen-input');

        // Create the Top-Right "Done" escape hatch
        if (!$exitBtn) {
            $exitBtn = $('<button class="plz-focus-exit-btn">Done</button>');
            $('body').append($exitBtn);

            // Exit when clicking "Done"
            // Use mousedown/touchstart to fire before the input blurs naturally
            $exitBtn.on('mousedown touchstart', (e) => {
                e.preventDefault(); 
                el.blur(); 
            });
        }
    });

    // 2. Listen for loss of focus (Keyboard dismissed, tapped outside)
    $(document).on('focusout', '.plz-auto-textarea', function() {
        exitFocusMode(this);
    });

    // 3. Listen for clicks on the darkened backdrop to exit
    $(document).on('mousedown touchstart', function(e) {
        if (document.body.classList.contains('plz-focus-active')) {
            // If they clicked the background (not the textarea or the button)
            if (!$(e.target).closest('.plz-fullscreen-input, .plz-focus-exit-btn').length) {
                const activeEl = document.querySelector('.plz-fullscreen-input');
                if (activeEl) activeEl.blur(); 
            }
        }
    });
}