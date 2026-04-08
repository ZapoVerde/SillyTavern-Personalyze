/**
 * @file data/default-user/extensions/personalyze/ui/workshop/libraryListeners.js
 * @stamp {"utc":"2026-04-07T14:20:00.000Z"}
 * @architectural-role UI Controller (Workshop Library)
 * @description
 * Manages event listeners and rendering for the Global Library tab.
 * 
 * Handles importing templates from extension settings into the active 
 * chat's DNA and managing the global portfolio storage.
 *
 * @api-declaration
 * renderLibraryView() — renders the library list.
 * bindLibraryHandlers() — binds all Library-specific events.
 *
 * @contract
 *   assertions:
 *     purity: IO / Stateful UI
 *     state_ownership: [state]
 *     external_io: [importExport.js, library.js, jQuery DOM]
 */

import { state } from '../../state.js';
import { getAllLibraryIds, getLibraryCharacter, removeFromLibrary } from '../../library.js';
import { handleImportToChat } from '../../logic/importExport.js';
import { getLibraryListHTML } from './libraryTemplates.js';
import { switchTab } from './core.js';
import { log } from '../../utils/logger.js';

/**
 * Renders the Global Library tab content.
 */
export function renderLibraryView() {
    const libraryIds = getAllLibraryIds();
    const characters = {};
    for (const id of libraryIds) {
        characters[id] = getLibraryCharacter(id);
    }

    const dnaIds = Object.keys(state.chatCharacters);
    const html = getLibraryListHTML(characters, dnaIds);
    
    $('#plz-tab-library').html(html);
}

/**
 * Binds library interaction events.
 * Called during workshop initialization via core.js.
 */
export function bindLibraryHandlers() {
    const $overlay = $('#plz-workshop-overlay');

    // ─── Import to Chat ──────────────────────────────────────────────────────

    $overlay.on('click', '.plz-lib-import', async function(e) {
        e.stopPropagation();
        const id = $(this).closest('.plz-roster-item').data('id');
        
        if (!id) return;

        const $btn = $(this);
        $btn.removeClass('fa-file-import').addClass('fa-spinner fa-spin');

        try {
            await handleImportToChat(id);
            
            // Refresh views to show the character now exists in DNA
            renderLibraryView();
            
            // UX: If this is the only character in DNA, jump to Studio
            if (Object.keys(state.chatCharacters).length === 1) {
                const { setWorkshopCharacter } = await import('../../state.js');
                setWorkshopCharacter(id);
                switchTab('studio');
            }
        } catch (err) {
            log('Library', 'Import failed:', err);
        } finally {
            $btn.removeClass('fa-spinner fa-spin').addClass('fa-file-import');
        }
    });

    // ─── Delete from Global Library ──────────────────────────────────────────

    $overlay.on('click', '.plz-lib-delete', function(e) {
        e.stopPropagation();
        const id = $(this).closest('.plz-roster-item').data('id');
        if (!id) return;

        const label = id.replace(/_/g, ' ');
        if (!confirm(`Delete "${label}" template from the Global Library?\n\nThis will NOT affect chats where this character was already imported.`)) {
            return;
        }

        removeFromLibrary(id);
        renderLibraryView();
    });
}