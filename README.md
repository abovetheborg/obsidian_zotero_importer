# Obsidian Zotero Importer

English | [中文](README.zh-CN.md)

## What it is

A small Obsidian scripting setup powered by the Obsidian Templater plugin (https://github.com/SilentVoid13/Templater): it fetches item metadata directly from Zotero's Local API on your machine and inserts the metadata into the current (existing) note, instead of creating a new note.

This is for people who want a lean Obsidian/Zotero workflow:

- No dependency on third-party plugins like zotero-integration / zotlit
- No requirement for Better BibTeX (optional only: if installed, the script tries to resolve a citation key; otherwise it falls back to the Zotero item key)

## Why this approach

- Templater-only: fewer moving parts, less likely to break on major Obsidian/Zotero updates
- Stay in Obsidian: select items from an in-app suggester list (no switching apps / external pickers)
- Direct Zotero Local API: no export steps, still gets core metadata (title/authors/year/journal/abstract/collections)
- Can be extended to fetch Zotero annotations/highlights (text, color, and note)
- Optional Zotero Web API fallback for annotations if you provide your Zotero user ID / API key in `scripts/zotero_picker.js`

## Repo layout

- `scripts/zotero_picker.js`: Templater user script; loads Zotero items, shows an Obsidian picker, returns structured metadata
- `templates/temp.md`: example template; writes metadata to YAML frontmatter + an info callout + abstract

## Prerequisites

1. Obsidian plugin: Templater
2. Zotero is running, with the setting enabled:
   - "Allow other applications on this computer to communicate with Zotero" (wording may vary)
3. Zotero Local API default port: `23119` (this project calls `http://localhost:23119`)

## Setup

1. Copy `scripts/zotero_picker.js` into your vault's Templater "User scripts" folder (as configured in Templater settings).
2. Copy `templates/temp.md` into your Templater template folder (or your own templates directory).
3. Restart Obsidian (or reload Templater).

## Usage (insert into an existing note)

1. Open the note you want to enrich (an existing note).
2. Run Templater: Insert template.
3. Choose `temp.md`.
4. Select an item from the in-app picker.
5. The template inserts metadata into the current note (YAML + info + Abstract).

## Customization

- Edit `templates/temp.md` to match your frontmatter fields / layout / tagging rules.
- Better BibTeX is optional:
  - If present, the script attempts to fetch a citation key.
  - If not, it falls back to the Zotero `itemKey`.
  - You can remove the Better BibTeX block in `scripts/zotero_picker.js` if you want zero optional integration.

## Troubleshooting

- Connection failed / no items:
  - Ensure Zotero is running
  - Ensure the "allow other applications..." setting is enabled
  - Ensure nothing blocks local port `23119`
- Script errors:
  - Open Obsidian devtools (`Cmd+Option+I`) and check Console logs

## Note

This script can be extended very easily to fetch Zotero notes/annotations as well, if you want. This project stays minimal on purpose and only fetches metadata.
