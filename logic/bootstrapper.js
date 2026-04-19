/**
 * @file data/default-user/extensions/personalyze/logic/bootstrapper.js
 * @stamp {"utc":"2026-04-19T00:00:00.000Z"}
 * @architectural-role Orchestrator / Boot Sequence
 * @description
 * Manages the initialization of the PersonaLyze environment for the active chat.
 *
 * Updated for Chat UUID / Anchor Architecture:
 * 1. Reads chat_uuid from reconstructed DNA to identify the active chat.
 * 2. Loads a per-character anchor from extension_settings on every boot.
 * 3. When a new chat has no UUID in its DNA:
 *    - If an anchor exists, seeds state.chatCharacters + activeRoster from it.
 *    - Generates a new UUID and batch-writes it + character_def records into
 *      the first AI message so the chat becomes self-documenting.
 * 4. After every boot (new or existing chat), refreshes the anchor with the
 *    latest state snapshot.
 *
 * @api-declaration
 * runBoot() → Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: Stateful IO
 *     state_ownership: [state (mutates via setters only)]
 *     external_io: [reconstruction, imageCache, state, anchorFile, dnaWriter]
 */

import { getContext } from '../../../../extensions.js';
import { log, error } from '../utils/logger.js';
import { state, bulkInitState, setFileIndex, addToFileIndex, updateChainLayers } from '../state.js';
import { reconstruct } from '../reconstruction.js';
import { fetchFileIndex, generate } from '../imageCache.js';
import { lockedPatchVisualStateImage, lockedBatchWrite } from '../io/dnaWriter.js';
import { readAnchor, writeAnchor } from '../io/anchorFile.js';
import { slugify } from '../utils/history.js';

/**
 * Heals a specific character's missing portrait if requirements are met.
 *
 * @param {string} characterId
 * @param {number} lastAiIdx
 */
async function healCharacter(characterId, lastAiIdx) {
    const character = state.chatCharacters[characterId];
    const chain = state.characterChain[characterId];
    if (!character || !chain || !chain.layers) return;

    // Skip if state is missing or explicitly 'KEEP' (ambiguous/legacy)
    if (!chain.layers.emotion || chain.layers.emotion === 'KEEP') return;

    log('Boot', `Healing missing portrait for: ${characterId}`);

    try {
        const filename = await generate(
            characterId,
            'layered',
            slugify(chain.layers.emotion),
            chain.layers,
            chain.layers.emotion,
            chain.layers.pose || 'upright',
            character.identity,
            character.seed
        );

        addToFileIndex(filename);
        updateChainLayers(characterId, chain.layers, filename);

        if (lastAiIdx !== -1) {
            await lockedPatchVisualStateImage(lastAiIdx, characterId, filename);
        }

        // Notify UI that an image is ready
        document.dispatchEvent(new CustomEvent('plz:roster-render-req'));
        log('Boot', `Healing complete for ${characterId}: ${filename}`);
    } catch (err) {
        error('Boot', `Healing failed for ${characterId}:`, err.message);
    }
}

export async function runBoot() {
    log('Boot', 'Starting Multi-Character DNA reconstruction sequence...');

    const context = getContext();
    if (!context.chatId) {
        log('Boot', 'Abort: No active chatId found.');
        return;
    }

    // ── 1. DNA Reconstruction ─────────────────────────────────────────────────
    const reconstructed = reconstruct(context.chat);
    bulkInitState(reconstructed);
    state._activeChatUuid = reconstructed.chatUuid ?? null;

    log('Boot', 'DNA Reconstructed.', {
        activeRoster: state.activeRoster,
        activeChar:   state.activeCharacterId,
        chatUuid:     state._activeChatUuid ?? '(none — new chat)',
    });

    // ── 2. Locate the most recent AI message ──────────────────────────────────
    // Computed early so both the anchor block and healing can reference it.
    let lastAiIdx = -1;
    for (let i = context.chat.length - 1; i >= 0; i--) {
        if (!context.chat[i].is_user) { lastAiIdx = i; break; }
    }

    // ── 3. Anchor Reconciliation ──────────────────────────────────────────────
    const char      = context.characters?.[context.characterId];
    const avatarKey = char?.avatar ?? null;

    if (avatarKey) {
        const anchor = readAnchor(avatarKey);

        if (!state._activeChatUuid) {
            // New chat — no UUID found in DNA.
            const newUuid = crypto.randomUUID();
            state._activeChatUuid = newUuid;

            if (anchor) {
                log('Boot', `New chat detected for known character (${avatarKey}). Seeding from anchor...`);

                // Merge anchor characters into state — don't overwrite any chars
                // the chat has already defined (there shouldn't be any, but be safe).
                for (const [id, charDef] of Object.entries(anchor.chatCharacters ?? {})) {
                    if (!state.chatCharacters[id]) {
                        state.chatCharacters[id] = structuredClone(charDef);
                    }
                }

                // Restore roster if the new chat has none yet.
                if (state.activeRoster.length === 0 && anchor.activeRoster?.length > 0) {
                    state.activeRoster = [...anchor.activeRoster];
                }
            }

            // Write the UUID + character_def records in one batch so we only
            // call saveChatConditional() once instead of once per record.
            if (lastAiIdx !== -1) {
                const seedRecords = [{ type: 'chat_uuid', uuid: newUuid }];

                for (const [id, charDef] of Object.entries(state.chatCharacters)) {
                    seedRecords.push({
                        type:        'character_def',
                        characterId: id,
                        identity:    structuredClone(charDef.identity ?? {}),
                        seed:        charDef.seed,
                    });
                }

                await lockedBatchWrite(lastAiIdx, seedRecords);
                log('Boot', `Seeded ${seedRecords.length - 1} character(s) into message ${lastAiIdx}.`);
            } else {
                log('Boot', 'No AI message yet — UUID will be written on first pipeline run.');
            }
        }

        // Always refresh the anchor so it reflects the current chat's latest state.
        writeAnchor(avatarKey, state._activeChatUuid, state.chatCharacters, state.activeRoster);
    }

    // ── 4. Filesystem Reconciliation ──────────────────────────────────────────
    const { fileIndex } = await fetchFileIndex();
    setFileIndex(fileIndex);
    log('Boot', `File index: ${state.fileIndex.size} portrait(s) detected.`);

    // ── 5. UI Sync ────────────────────────────────────────────────────────────
    // Fires after anchor seeding so the roster reflects any restored characters.
    document.dispatchEvent(new CustomEvent('plz:roster-changed'));

    // ── 6. Requirement-Driven Healing (Multi-Character) ───────────────────────
    const healingTasks = [];
    for (const id of state.activeRoster) {
        const chain = state.characterChain[id];
        const isImageMissing = chain && (!chain.image || !state.fileIndex.has(chain.image));

        if (isImageMissing) {
            healingTasks.push(healCharacter(id, lastAiIdx));
        }
    }

    if (healingTasks.length > 0) {
        log('Boot', `Triggering ${healingTasks.length} healing task(s)...`);
        await Promise.all(healingTasks);
    }
}
