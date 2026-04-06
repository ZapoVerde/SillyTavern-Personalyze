/**
 * @file data/default-user/extensions/personalyze/utils/callLog.js
 * @stamp {"utc":"2026-04-06T00:00:00.000Z"}
 * @architectural-role Utility (In-Memory Log)
 * @description
 * Rolling in-memory log of the last two AI call groups ("turns").
 *
 * A turn is opened by startTurn() and accumulates logCall() entries until the
 * next startTurn() is called.  If logCall() fires without a matching open turn
 * (e.g. a standalone Workshop call) a "Standalone" turn is auto-created.
 * A stale-fallback also fires if the last logged call was more than 10 s ago,
 * preventing Workshop calls from being silently appended to an old pipeline turn.
 *
 * @api-declaration
 * startTurn(label)                            → void
 * logCall(label, prompt, response, errorMsg)  → void
 * getLogs()                                   → TurnRecord[]
 *
 * @contract
 *   assertions:
 *     purity: Stateful (session-scoped, in-memory only)
 *     state_ownership: [_turns, _currentTurnId]
 *     external_io: []
 */

const MAX_TURNS = 2;

let _turnCounter   = 0;
let _currentTurnId = 0;

/** @type {{ id: number, label: string, timestamp: number, calls: object[] }[]} */
let _turns = [];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Opens a new log group.  All logCall() invocations until the next startTurn()
 * (or until the 10-second stale threshold) are appended to this group.
 * Evicts the oldest turn once the buffer exceeds MAX_TURNS.
 * @param {string} label  Human-readable source, e.g. "Pipeline" or "Anchor Scan".
 */
export function startTurn(label) {
    _turnCounter++;
    _currentTurnId = _turnCounter;
    _turns.push({ id: _currentTurnId, label, timestamp: Date.now(), calls: [] });
    if (_turns.length > MAX_TURNS) _turns.shift();
}

/**
 * Records one LLM call under the current turn.
 * Auto-creates a Standalone turn if no matching turn exists or if the last
 * recorded call is more than 10 seconds old (stale-fallback).
 *
 * @param {string}      label     e.g. 'SubjectMatch', 'Combined', 'AnchorScan'
 * @param {string}      prompt    The full prompt string that was sent.
 * @param {string|null} response  Raw LLM response text, or null on failure.
 * @param {string|null} errorMsg  Error message string, or null on success.
 */
export function logCall(label, prompt, response, errorMsg) {
    let turn = _turns.find(t => t.id === _currentTurnId);

    // Stale-fallback: auto-open a Standalone turn if active turn is absent or
    // the last call in it is more than 10 s old.
    const lastCallTs = turn?.calls.at(-1)?.timestamp ?? 0;
    if (!turn || (turn.calls.length > 0 && Date.now() - lastCallTs > 10_000)) {
        startTurn('Standalone');
        turn = _turns[_turns.length - 1];
    }

    turn.calls.push({
        label,
        prompt:    prompt    ?? '',
        response:  response  ?? null,
        error:     errorMsg  ?? null,
        timestamp: Date.now(),
    });
}

/**
 * Returns a shallow copy of the current turn buffer (oldest first).
 * @returns {{ id: number, label: string, timestamp: number, calls: object[] }[]}
 */
export function getLogs() {
    return [..._turns];
}
