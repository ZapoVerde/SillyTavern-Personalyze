
# PersonaLyze

PersonaLyze is a SillyTavern extension that automatically tracks character appearances, outfits, and emotional states during roleplay. As the story progresses, it generates visual novel-style character portraits that reflect the current narrative and displays them directly over your chat interface.

## Features

*   **Automatic Appearance Tracking:** Seamlessly updates character outfits, expressions, and poses based on the text of the chat.
*   **Dynamic Portraits:** Displays character images in a floating window or a visual novel-style split-screen layout.
*   **Multi-Character Support:** Tracks and displays a roster of multiple characters simultaneously within the same scene.
*   **Character Workshop:** A dedicated UI to manually edit character details, add custom clothing layers, and manage saved outfits.
*   **Global Library:** Save character templates and their generated wardrobes to a global library so they can be easily imported into new chats.
*   **Custom Image Styles:** Support for custom portrait prompts, negative prompts, and LoRAs depending on the selected image provider.

## Installation

PersonaLyze consists of two parts: the front-end extension and a server-side plugin that handles secure API requests for image generation. 

### Step 1: Install the Extension
1. Open SillyTavern and navigate to the **Extensions** menu (the block icon at the top).
2. Click **Install Extension**.
3. Paste the GitHub URL for PersonaLyze into the input box (e.g., `https://github.com/author/personalyze`) and click **Install for all users** or **Install just for me**.

### Step 2: Install the Server Plugin
1. Open your file explorer and navigate to where SillyTavern installed the extension (usually `SillyTavern/data/default-user/extensions/personalyze/`).
2. Locate the folder named `plugin` inside the PersonaLyze extension directory.
3. Move or copy the contents of this `plugin` folder into SillyTavern's root `plugins` directory (`SillyTavern/plugins/personalyze/`).

### Step 3: Enable Plugins in Configuration
1. Open your `config.yaml` file located in the SillyTavern base directory.
2. Find and set `enableServerPlugins: true`.
3. Find and set `allowKeysExposure: true` (this allows the extension to securely save your image generation API keys).
4. Restart your SillyTavern server.

## Setting Up LLMs

PersonaLyze uses a dual-model system to keep generation costs low and response times fast. You can map these models in the PersonaLyze settings panel using your active SillyTavern API connections.

*   **Fast Model:** Used for simple yes/no checks (e.g., "Did the scene change?", "Did the character change clothes?"). A smaller, faster model like Mistral Small or Claude Haiku is highly recommended here.
*   **Smart Model:** Used only when a change is detected. It reads the chat to extract complex details like the exact items of clothing a character put on. A more capable model like Gemini Flash, Claude Sonnet, or GPT-4o is recommended for this stage.

## Image Generation Providers

PersonaLyze supports multiple image generation services. You can configure these in the **Engines** menu within the extension settings. 

Available providers include:
*   **Pollinations** *(Note: An API key is strictly required to use Pollinations with this extension)*
*   **Fal AI**
*   **PiAPI**
*   **Runware.ai**

Once you choose a provider, you can securely save your API key into SillyTavern's vault directly from the extension's UI.

## How It Works

PersonaLyze operates entirely in the background as you chat. Every time the AI sends a message, PersonaLyze runs through a sequential logic chain to determine what the characters look like:

1.  **Scene Detection:** The system first checks if the characters have moved to a completely new location (e.g., moving from a bedroom to a snowy mountain). If they have, it evaluates if their current outfits still make sense, and updates them if the narrative demands it.
2.  **Subject Identification:** It scans the latest message to see which characters are acting or speaking.
3.  **Change Check:** It asks the Fast Model if the subject's clothing or expression has noticeably changed in this specific turn. If nothing changed, the process stops here to save time and API credits.
4.  **Detail Extraction:** If a change did occur, the Smart Model reads the context and breaks the character's new appearance down into distinct layers (outerwear, top, bottom, accessories, emotion, and pose).
5.  **Image Generation:** These layers are combined with the character's permanent physical description to generate a new portrait via your chosen image provider.

**Data Storage:** 
All active character visual states and clothing changes are saved directly into the metadata of your SillyTavern chat log. This means your character's appearance history is permanently tied to the story. If you branch the chat, swipe a message, or share the chat file with another SillyTavern instance, the character's visual timeline remains perfectly intact.