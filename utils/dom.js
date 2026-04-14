/**
 * @file data/default-user/extensions/personalyze/utils/dom.js
 * @stamp {"utc":"2026-04-05T00:00:00.000Z"}
 * @architectural-role Utility / DOM Helper
 * @description
 * Provides layout and sizing utilities for the Personalyze UI. 
 * Includes the smartResize logic used to manage auto-expanding textareas.
 * Modified to allow unlimited expansion so that the parent modal container
 * handles scrolling rather than the textarea itself.
 *
 * @api-declaration
 * smartResize(el) -> void
 *
 * @contract
 *   assertions:
 *     purity: Side-effect (DOM Mutation)
 *     state_ownership: []
 *     external_io: [Element.style, Element.scrollHeight]
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
    //    Using '0px' causes some engines to return the previous pixel value from
    //    scrollHeight on the next read, producing runaway growth on each keystroke.
    el.style.height = 'auto';

    // 3. Set height exactly to content height.
    el.style.height = el.scrollHeight + 'px';

    el.style.resize = 'none';
}

/**
 * Initializes Global Focus Mode for mobile text entry.
 * Call this once when the extension initializes.
 */
export function initMobileFocusMode() {
    let $exitBtn = null;

    // Helper to close focus mode
    const exitFocusMode = (el) => {
        document.body.classList.remove('plz-focus-active');
        el.classList.remove('plz-fullscreen-input');
        if ($exitBtn) {
            $exitBtn.remove();
            $exitBtn = null;
        }
        // Run your existing resize logic to snap it back to normal size
        smartResize(el);
    };

    // 1. Listen for focus (tapping into the box)
    $(document).on('focusin', '.plz-auto-textarea', function() {
        // Only trigger on mobile/small tablet screens
        if (window.innerWidth > 768) return;

        const el = this;
        document.body.classList.add('plz-focus-active');
        el.classList.add('plz-fullscreen-input');

        // Create the Top-Right "Done" button
        if (!$exitBtn) {
            $exitBtn = $('<button class="plz-focus-exit-btn">Done</button>');
            $('body').append($exitBtn);

            // Exit when clicking "Done"
            $exitBtn.on('mousedown touchstart', (e) => {
                e.preventDefault(); // Prevents keyboard from flashing
                el.blur(); // Blur naturally triggers the focusout event below
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