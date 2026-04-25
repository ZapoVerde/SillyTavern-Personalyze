/**
 * @file data/default-user/extensions/personalyze/logic/pipeline/lorebookSync.js
 * @stamp {"utc":"2026-04-25T00:00:00.000Z"}
 * @architectural-role Orchestrator (Lorebook Subsystem)
 * @description
 * Traffic cop for all PLZ lorebook writes. Exposes a single
 * syncCharacterToLorebook entry point consumed by the Archivist pipeline,
 * Studio commit, identity/AKA editors, and the import flow.
 *
 * Hold-Fire: if a CNZ sync cycle is in progress (signalled via
 * notifyCnzSyncStarted / notifyCnzSyncCompleted called from index.js),
 * incoming sync requests are held in a single pending slot — latest call
 * wins. On CNZ completion the pending call is executed automatically,
 * followed by a full roster reconciliation.
 *
 * @api-declaration
 * syncCharacterToLorebook(characterId, label, identityMap, akaList)
 * reconcileRosterToLorebook()
 * notifyCnzSyncStarted()
 * notifyCnzSyncCompleted()
 *
 * @contract
 *   assertions:
 *     purity: Stateful Orchestrator
 *     state_ownership: [_cnzSyncActive, _pendingSync]
 *     external_io: [lorebookApi.js]
 */

import { getContext } from '../../../../../extensions.js';
import { state } from '../../state.js';
import { log, warn, error } from '../../utils/logger.js';
import {
    lbEnsureLorebook,
    lbSaveLorebook,
    patchCharacterWorld,
} from '../../io/lorebookApi.js';
import {
    findEntryUid,
    formatIdentityMarker,
    stitchIdentityMarker,
    keywordUnion,
    nextEntryUid,
    makeLbEntry,
} from '../lorebookUtils.js';

// ─── Hold-Fire State ──────────────────────────────────────────────────────────

let _cnzSyncActive = false;
let _pendingSync   = null; // { characterId, label, identityMap, akaList } | null

// ─── CNZ Bridge Notifications ─────────────────────────────────────────────────

/**
 * Called by index.js when 'cnz:sync-started' fires.
 * Raises the hold-fire gate — incoming sync calls will be deferred.
 */
export function notifyCnzSyncStarted() {
    _cnzSyncActive = true;
}

/**
 * Called by index.js when 'cnz:sync-completed' fires.
 * Lowers the gate and flushes the pending slot if one was queued.
 */
export function notifyCnzSyncCompleted() {
    _cnzSyncActive = false;
    if (_pendingSync) {
        const args = _pendingSync;
        _pendingSync = null;
        syncCharacterToLorebook(args.characterId, args.label, args.identityMap, args.akaList)
            .catch(err => error('LbSync', 'Deferred sync failed:', err));
    }
}

// ─── Core Sync ────────────────────────────────────────────────────────────────

/**
 * Synchronises a character's physical identity into the active lorebook.
 * If a CNZ sync is currently in progress the call is deferred until
 * 'cnz:sync-completed' fires (latest-wins — only the final state matters).
 *
 * Routes through create or update depending on whether the character already
 * has a lorebook entry. The Content Stitcher preserves any narrative biography
 * CNZ has written above the -\*-\*- delimiter.
 *
 * @param {string}   characterId  Canonical PLZ character ID.
 * @param {string}   label        Display name (used as lorebook entry comment).
 * @param {object}   identityMap  Granular physical identity { hair, eyes, ... }.
 * @param {string[]} [akaList]    Alias list merged into lorebook entry keys.
 */
export async function syncCharacterToLorebook(characterId, label, identityMap, akaList = []) {
    if (_cnzSyncActive) {
        _pendingSync = { characterId, label, identityMap, akaList };
        return;
    }

    try {
        const context = getContext();
        const char    = context.characters?.[context.characterId];
        if (!char) {
            warn('LbSync', 'No ST character in context — skipping lorebook sync.');
            return;
        }

        // Determine lorebook name: respect any existing world link, fall back to char name.
        const lbName = char.data?.extensions?.world || char.name;

        // Fetch or create the lorebook — mutate in place to preserve all root fields
        // (including extensions.cnz_anchor_uuid written by CNZ).
        const lbData = await lbEnsureLorebook(lbName);

        // Bootstrap world link only when the character has none yet.
        if (!char.data?.extensions?.world) {
            try {
                await patchCharacterWorld(char, lbName);
            } catch (err) {
                warn('LbSync', 'World link patch failed (non-fatal):', err.message);
            }
        }

        const marker  = formatIdentityMarker(identityMap);
        const plzKeys = [characterId, ...akaList];
        const uid     = findEntryUid(lbData, characterId, label, akaList);

        if (uid !== null) {
            // ── Update: preserve narrative top half, replace physical bottom half ──
            const entry   = lbData.entries[uid];
            entry.comment = label;
            entry.key     = keywordUnion(entry.key, plzKeys);
            entry.content = stitchIdentityMarker(entry.content, marker);
        } else {
            // ── Create: placeholder narrative + physical block ──
            const newUid = nextEntryUid(lbData);
            lbData.entries[String(newUid)] = makeLbEntry(
                newUid,
                label,
                keywordUnion([], plzKeys),
                '[Narrative biography pending sync...]' + marker,
            );
        }

        await lbSaveLorebook(lbName, lbData);
        log('LbSync', `Synced "${label}" (${characterId}) → "${lbName}"`);

    } catch (err) {
        error('LbSync', `Failed to sync "${label}" (${characterId}):`, err.message);
    }
}

// ─── Roster Reconciliation ────────────────────────────────────────────────────

/**
 * Walks the active roster and ensures every character has a current PLZ
 * protected block in the lorebook. Called after 'cnz:sync-completed' as a
 * self-healing pass — guards against CNZ wipes or first-sync scenarios where
 * PLZ data was not yet present when CNZ adopted the lorebook.
 */
export async function reconcileRosterToLorebook() {
    for (const characterId of state.activeRoster) {
        const char = state.chatCharacters[characterId];
        if (!char?.identity) continue;
        await syncCharacterToLorebook(
            characterId,
            char.label || characterId.replace(/_/g, ' '),
            char.identity,
            char.aka ?? [],
        );
    }
}
