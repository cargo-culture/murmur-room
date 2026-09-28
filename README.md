# Murmur Room

A multi-agent conversation with one human, seeded agent personalities, user-directed turns, bounded automatic rounds, pruning/restoring, and a silent observer. The interface is static and can be published with GitHub Pages. A **local companion** runs the agents using Codex CLI signed in through ChatGPT, so it does not call a metered Platform API key.

## Run

1. Install Node.js 20+ and [Codex CLI](https://learn.chatgpt.com/docs/codex/cli). Run `codex login` and choose **Sign in with ChatGPT**. Confirm with `codex login status`. Do not use an API key.
2. Clone this repository and run `npm start`. The companion listens only on `127.0.0.1:4317` and prints a fresh room token.
3. Open the Pages URL or `http://127.0.0.1:4317`. Paste the token into **Connection** and connect. The token is stored only in this tab's session storage.
4. If using Pages, set the exact Pages origin before starting the companion, for example:

   ```bash
   MURMUR_ALLOWED_ORIGIN=https://YOUR-USERNAME.github.io npm start
   ```

   On Chromium, grant the Pages site local network permission if prompted. A mobile browser's `localhost` points at the phone, so the companion needs to run on that device for this direct connection. Access from a different device requires a separately secured remote transport.

## GitHub Pages

Publish the `docs/` directory from `main` in **Settings → Pages → Deploy from a branch**. For a repository named `murmur-room`, the URL is `https://YOUR-USERNAME.github.io/murmur-room/`. The static site contains no credentials. The companion and its `.data/room.json` transcript remain on your machine; Pages alone cannot execute agents.

## How it works

- Every agent receives the same room transcript and a reproducible personality from a random 32-bit seed. These are different prompts to the same Codex subscription-backed model, not independent model weights.
- **Give floor** starts a specific agent turn. **Automatic turns** takes turns across active agents with a configurable delay and a hard cap per run; it stops when an agent errors or the limit is reached. **Stop** aborts the current process.
- **Prune** removes an agent from future turns while preserving the transcript. Restore reactivates it.
- The observer makes private notes when messages change. It never posts to the room or triggers an agent turn. Turn off **Observer** to stop it.
- The companion persists messages and settings in `.data/room.json`, uses `codex exec --ephemeral` in a temporary read-only directory, and passes no API key. It binds only to loopback, checks exact Origins and Host, and requires a random room token on every API request. Do not publish the token or expose port 4317 to the internet.
- A Pages browser must reach the companion on the **same device**. A browser can restrict local network requests; use the local URL if the Pages origin cannot get permission.

## Tests

`npm test` checks the seeded parameters and turn order. `node --check server/index.js && node --check docs/app.js` checks syntax. A live model turn needs a locally installed, ChatGPT-authenticated Codex CLI and available plan usage; the repository does not ship credentials.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `MURMUR_PORT` | `4317` | Loopback port |
| `MURMUR_ALLOWED_ORIGIN` | local origins | Exact Pages origin, or comma-separated exact origins |
| `MURMUR_TOKEN` | random at startup | Optional fixed secret for restarts; keep private |
| `MURMUR_DATA` | `.data/room.json` | Local transcript storage |
| `MURMUR_CODEX` | `codex` | Codex executable path |

OpenAI documentation distinguishes [ChatGPT sign-in from API-key billing](https://learn.chatgpt.com/docs/auth) and documents [non-interactive `codex exec`](https://learn.chatgpt.com/docs/non-interactive-mode). Subscription usage remains subject to the user's plan limits and workspace permissions.
