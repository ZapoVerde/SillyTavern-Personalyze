# Personalyze v1.0 — Project Principles
*Read before writing any code. Applies to every session.*

---

## 1. The Core Philosophy

Personalyze manages **Visual Character Continuity**. It captures the evolving appearance of characters—their identity, their wardrobe, and their expressions—and translates them into visual snapshots.

The system is built on the **DNA Chain** principle. We do not trust external databases or global settings for chat-specific character visuals. If a character is discovered wearing "Golden Armor" in Turn 50 of Chat A, that knowledge belongs to Chat A. If the user forks the chat at Turn 40, the "Golden Armor" should not exist in the new branch. **The chat log is the only source of truth for the narrative state.**

---

## 2. The Three Kinds of Code

Personalyze enforces strict separation of responsibilities to ensure stability and predictability.

### Pure Functions
Takes data in, returns derived data out. No external reads or writes. It does not know the DOM exists. It does not know about settings. It cannot see the filesystem. Given the same chat log array, a pure function must always produce the identical derived state object.
*   *Example:* Reconstruction logic that builds a character's current wardrobe by scanning the chat DNA.

### Stateful Owners
A strictly bounded set of modules allowed to mutate the runtime state singleton. They bridge the gap between reconstructed data and the active session. If a component needs to update the "Active Character" or the "Current Expression," it must do so through these gatekeepers.

### IO Executors
These are the workers. They talk to LLMs for detection, external APIs for image generation, and the host file system. They execute commands and return raw results. **They contain zero narrative logic.** An IO executor does not decide *if* an outfit changed; it only knows *how* to generate the image once told.

---

## 3. The Data Model: The DNA Chain

**The chat ledger is the database.** All character definitions and visual transitions are stored directly in the metadata of the messages. We use the **Array Pattern** for storage (`message.extra.personalyze = []`) so multiple events can coexist on a single turn.

There are three conceptual record types:
1.  **Character Definition (`character_def`):** Contains the identity anchor (permanent physical features) and the generation seed.
2.  **Outfit Definition (`outfit_def`):** Contains the visual description, display label, immutable key, and the specific image engine provider.
3.  **Visual State (`visual_state`):** A transition record marking the exact turn where a character becomes active and what they are wearing and expressing.

**Last Write Wins:** Definitions are mutable within the DNA. If a user edits an identity anchor, a new `character_def` is appended to the latest message. The forward-pass reconstruction logic always honors the most recent definition for a given key.

---

## 4. The Library vs. The DNA

While the chat log is the source of truth, Personalyze maintains a **Global Portfolio (The Library)** in the extension settings.

*   **The Library:** Acts as a "Template Gallery" or "Save Station." It stores characters and outfits the user wants to reuse across different stories.
*   **The DNA:** The active "Working Copy." When a character is "Imported" from the Library, their definitions are written into the chat DNA. 
*   **Decoupling:** Once a character is in the DNA, changes to the Library version do not affect existing chats. This ensures chat portability and branch safety.

---

## 5. The Detection Pipeline: "Falling Water"

Detection follows a cascading logic to minimize LLM costs and latency.

1.  **The Subject Gate:** A cheap check to see if any character in the active roster is the focus of the message.
2.  **The Change Check:** A check to see if the current character's visual state has actually changed.
3.  **The Classifier:** If a change is detected, the system checks the character's *local* wardrobe (derived from the DNA) for a match.
4.  **The Describer:** Only if the outfit is entirely new does the system perform the expensive extraction and request user approval.

---

## 6. Eventual Consistency: The Two-Write Pattern

Image generation is asynchronous and prone to failure. To keep the chat record accurate, we use a two-step process to ensure the chat record remains stable:

*   **Write 1 (Narrative Intent):** As soon as a visual change is confirmed, a `visual_state` record is written marking the character/outfit/expression, but the image filename is set to `null`. The narrative intent is now permanently captured.
*   **Generation (Async IO):** The image is generated in the background.
*   **Write 2 (Asset Completion):** Once the file is saved to disk, the exact same record is patched with the localized filename.

---

## 7. Just-in-Time Self-Healing

The system is designed to recover from missing assets gracefully, but conservatively:

*   **Requirement-Driven Healing:** If the system finds a `visual_state` that is **required for display** (e.g., it is the current active portrait or the user is looking at that specific turn in the history) and the image is `null` or missing from disk, it triggers an automatic background regeneration.
*   **Resource Preservation:** The system does not preemptively heal missing files found in the deep history of the chat unless they are specifically needed. This prevents unnecessary API usage on old or abandoned branches.