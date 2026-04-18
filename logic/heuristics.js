/**
 * @file data/default-user/extensions/personalyze/logic/heuristics.js
 * @stamp {"utc":"2026-04-14T09:20:00.000Z"}
 * @architectural-role Pure Function
 * @description
 * Implements pure regex heuristics for zero-cost subject detection.
 * Identifies characters mentioned in the narrative by matching their 
 * canonical labels and aliases against the text.
 * 
 * @api-declaration
 * detectNamesInText(text, chatCharacters) → string[]
 * 
 * @contract
 *   assertions:
 *     purity: pure
 *     state_ownership: none
 *     external_io: none
 */

/**
 * Scans text for known character labels and AKAs using case-insensitive 
 * word-boundary regex.
 * 
 * @param {string} text - The text to scan (usually the latest AI message).
 * @param {Object} chatCharacters - The state.chatCharacters registry.
 * @returns {string[]} Array of matched character IDs.
 */
export function detectNamesInText(text, chatCharacters) {
    if (!text || !chatCharacters) return [];
    
    const matchedIds = new Set();
    
    for (const [id, char] of Object.entries(chatCharacters)) {
        // Archived characters are permanently excluded from detection
        if (char.isArchived) continue;

        // Collect all candidate strings (Label + AKAs)
        const candidates = [char.label, ...(char.aka || [])].filter(Boolean);
        
        for (const candidate of candidates) {
            // Escape the candidate string to prevent regex metacharacter injection
            const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            
            // Build case-insensitive word-boundary regex
            const regex = new RegExp(`\\b${escaped}\\b`, 'i');
            
            if (regex.test(text)) {
                matchedIds.add(id);
                break; // Found this character; move to the next entry in the registry
            }
        }
    }
    
    return Array.from(matchedIds);
}