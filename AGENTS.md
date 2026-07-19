# Project instructions

- After making any changes, always run `bun run ci` before handing work back.
- `bun run ci` must run the Ultracite-configured Biome checks automatically, followed by the TypeScript check and production build.
- Fix all reported issues rather than bypassing or disabling checks unless the project requirements explicitly demand an exception.
- Do not reference the AI name used (codex, openai, etc...) in any commits, pr's, issue titles or anywhere else.
- When the user says "add, commit", group all existing changes into logical sets, stage and commit each group, and repeat until every change is committed and the working tree is clean.
- Keep React component modules compatible with Vite Fast Refresh: export only React components from component files, and move non-component runtime exports such as constants, helpers, and metadata into separate modules to avoid incompatible-export invalidations.
- Record every new user-facing feature in the README as part of implementing it.
