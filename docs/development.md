# Development and deployment

## Local development

Use Bun 1.4.4 (pinned in `package.json`) and Node.js 26.13.1 (pinned in `.node-version`).

```bash
bun install --frozen-lockfile
bun run dev
```

Open <http://localhost:4200> in current Chrome.

Open this repository directory as an editor project root so Biome uses the installed version and
`biome.jsonc`, rather than an editor-bundled fallback. When editing the sibling backend as well,
add it as a separate project root. For Zed, run `zed --new . ../backend` from this directory instead
of opening their shared parent directory.

`bun run ci` checks Biome diagnostics, Tailwind CSS diagnostics, tests, types, and the production
build. The Biome configuration explicitly enables Tailwind directives and rejects `!important`;
chart tooltip presentation is stylesheet-owned while TanStack retains its native interaction and
positioning behavior.

Ultracite 8 and Biome 2.6 enforce Tailwind class ordering, Unicode-aware regular expressions,
and named captures. Browser DOM queries use selectors with escaped dynamic IDs. XML parsing
retains the tag-name APIs supported by both browsers and `@xmldom/xmldom`, with local lint
exceptions. CSS Baseline exceptions are limited to existing Chrome-supported features or
declarations with explicit fallbacks; they do not relax the rule globally.

Charts use TanStack Charts 1.x, including the React adapter from `@tanstack/charts/react`;
the separate `@tanstack/react-charts` package is no longer needed.

## Deployment

`bun run cf <command>` disables CLI telemetry with `CF_SEND_TELEMETRY=false` and
`DO_NOT_TRACK=1`. Development, builds, deployment, and CI enforce the same opt-out.
For direct `cf` commands outside these scripts, disable the machine-wide preference with
`CF_SEND_TELEMETRY=false DO_NOT_TRACK=1 cf cli telemetry disable`.

Pull requests and pushes to `main` run the complete `bun run ci` suite in GitHub Actions. After
CI succeeds on `main`, the deployment job runs `bun run build` and deploys the generated Cloudflare
Build Output to a Worker at [ridecontrol.xyz](https://ridecontrol.xyz). Development, builds, and
deployment use the pinned `cf` CLI and Cloudflare Vite plugin v2 beta. `cloudflare.config.ts` owns
the account, custom domain, SPA routing, and observability settings. Build output and generated
types live in the ignored `.cloudflare/` directory.

The Cloudflare packages intentionally track their beta channel; the Vite plugin's v1 stable
release is not a replacement for v2. The current CLI requires Node.js 26.12.0 or newer on the
Node.js 26 release line.

`bun run deploy` builds and deploys locally. To validate an existing production build without
uploading it, run `bun run cf deploy --prebuilt --mode production --dry-run`; CI runs this check
for every pull request. Production deployment uses the same prebuilt command without `--dry-run`
and authenticates with the `CLOUDFLARE_API_TOKEN` repository secret. Workflow actions are pinned
to full commit hashes; Bun and Node.js use the repository's pinned versions.

Each build emits `version.json` beside those static assets. Running clients revalidate that marker with the browser
cache at most once per hour, so unchanged checks can use Cloudflare's asset ETag without invoking
dynamic Worker code or transferring the application bundle again.
