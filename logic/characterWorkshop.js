/**
 * @file data/default-user/extensions/personalyze/logic/characterWorkshop.js
 * @stamp {"utc":"2026-04-04T00:00:00.000Z"}
 * @architectural-role Orchestrator / Workshop Controller
 * @description
 * Logic controller for the Character Workshop. Provides the entry points
 * called by index.js (toolbar button) and the panel button.
 *
 * Mirrors the role of localyze's logic/maintenance.js.
 *
 * @api-declaration
 * handleOpenWorkshop()       — opens the workshop on the Roster tab.
 * handleOpenStudio(id)       — opens the workshop directly on a character's Studio tab.
 * handleOpenRegister()       — opens the workshop on the Register tab.
 *
 * @contract
 *   assertions:
 *     purity: Stateful Controller
 *     state_ownership: [state (via setWorkshopCharacter)]
 *     external_io: [characterWorkshopModal.js (lazy import)]
 */

import { setWorkshopCharacter } from '../state.js';

/**
 * Opens the Character Workshop on the Roster tab.
 */
export async function handleOpenWorkshop() {
    const { openWorkshop } = await import('../ui/characterWorkshopModal.js');
    openWorkshop('roster');
}

/**
 * Opens the Character Workshop directly on the Studio tab for a specific character.
 * @param {string} characterId
 */
export async function handleOpenStudio(characterId) {
    setWorkshopCharacter(characterId);
    const { openWorkshop } = await import('../ui/characterWorkshopModal.js');
    openWorkshop('studio');
}

/**
 * Opens the Character Workshop on the Register tab.
 */
export async function handleOpenRegister() {
    const { openWorkshop } = await import('../ui/characterWorkshopModal.js');
    openWorkshop('register');
}
