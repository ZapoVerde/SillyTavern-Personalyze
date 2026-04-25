/**
 * @file data/default-user/extensions/personalyze/io/lorebookApi.js
 * @stamp {"utc":"2026-04-25T00:00:00.000Z"}
 * @architectural-role IO Executor
 * @description
 * Thin HTTP wrapper around ST's worldinfo and character endpoints.
 * No logic regarding lorebook content — only reads and writes raw payloads.
 *
 * @api-declaration
 * lbListLorebooks, lbGetLorebook, lbSaveLorebook,
 * lbEnsureLorebook, patchCharacterWorld
 *
 * @contract
 *   assertions:
 *     purity: mutates
 *     state_ownership: [none]
 *     external_io: [/api/worldinfo/*, /api/characters/edit]
 */

import { getRequestHeaders, eventSource, event_types } from '../../../../../script.js';
import { updateWorldInfoList } from '../../../../../scripts/world-info.js';

// ─── Lorebook Endpoints ───────────────────────────────────────────────────────

export async function lbListLorebooks() {
    const res = await fetch('/api/worldinfo/list', {
        method:  'POST',
        headers: getRequestHeaders(),
        body:    JSON.stringify({}),
    });
    if (!res.ok) throw new Error(`Lorebook list failed (HTTP ${res.status})`);
    return res.json();
}

export async function lbGetLorebook(name) {
    const res = await fetch('/api/worldinfo/get', {
        method:  'POST',
        headers: getRequestHeaders(),
        body:    JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error(`Lorebook fetch failed (HTTP ${res.status})`);
    return res.json();
}

export async function lbSaveLorebook(name, data) {
    const res = await fetch('/api/worldinfo/edit', {
        method:  'POST',
        headers: getRequestHeaders(),
        body:    JSON.stringify({ name, data }),
    });
    if (!res.ok) throw new Error(`Lorebook save failed (HTTP ${res.status})`);
    await eventSource.emit(event_types.WORLDINFO_UPDATED, name, data);
}

/**
 * Ensures a lorebook named `name` exists, then returns its data.
 * Creates a blank lorebook if none exists.
 */
export async function lbEnsureLorebook(name) {
    let list;
    try {
        list = await lbListLorebooks();
    } catch (_) {
        list = [];
    }
    if (!list.some(item => item.name === name)) {
        await lbSaveLorebook(name, { entries: {} });
        await updateWorldInfoList();
    }
    return lbGetLorebook(name);
}

// ─── Character World Link ─────────────────────────────────────────────────────

/**
 * Patches the ST character file so its linked world info points to `lorebookName`.
 * Only called when `char.data.extensions.world` is not already set.
 * @param {object} char         ST character object from getContext().
 * @param {string} lorebookName Target lorebook name.
 */
export async function patchCharacterWorld(char, lorebookName) {
    const updatedChar = structuredClone(char);
    if (!updatedChar.data)            updatedChar.data = {};
    if (!updatedChar.data.extensions) updatedChar.data.extensions = {};
    updatedChar.data.extensions.world = lorebookName;

    const formData = new FormData();
    formData.append('ch_name',                   char.name);
    formData.append('description',               char.description                     ?? '');
    formData.append('personality',               char.personality                     ?? '');
    formData.append('scenario',                  char.scenario                        ?? '');
    formData.append('first_mes',                 char.first_mes                       ?? '');
    formData.append('mes_example',               char.mes_example                     ?? '');
    formData.append('creator_notes',             char.data?.creator_notes             ?? '');
    formData.append('system_prompt',             char.data?.system_prompt             ?? '');
    formData.append('post_history_instructions', char.data?.post_history_instructions ?? '');
    formData.append('creator',                   char.data?.creator                   ?? '');
    formData.append('character_version',         char.data?.character_version         ?? '');
    formData.append('world',                     lorebookName);
    formData.append('json_data',                 JSON.stringify(updatedChar));
    formData.append('avatar_url',                char.avatar);
    formData.append('chat',                      char.chat);
    formData.append('create_date',               char.create_date);

    const headers = getRequestHeaders();
    delete headers['Content-Type'];

    const res = await fetch('/api/characters/edit', {
        method:  'POST',
        headers,
        body:    formData,
    });
    if (!res.ok) throw new Error(`World link patch failed (HTTP ${res.status})`);
}
