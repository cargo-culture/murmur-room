# Murmur Room

A multi-agent conversation with one human, seeded agent personalities, user-directed turns, bounded automatic rounds, pruning/restoring, and a silent observer. The interface is published on GitHub Pages. A companion runs the agents using Codex CLI signed in through ChatGPT, so it does not call a metered Platform API key. Host that companion behind HTTPS on a server for mobile use without installing anything on the phone.

## Run

1. Install Node.js 20+ and [Codex CLI](https://learn.chatgpt.com/docs/codex/cli). Run `codex login` and choose **Sign in with ChatGPT**. Confirm with `codex login status`. Do not use an API key.
2. Clone this repository and run `npm start`. The companion listens only on `127.0.0.1:4317` and prints a fresh room token.
3. Open the Pages URL or `http://127.0.0.1:4317`. Paste the token into **Connection** and connect. The token is stored only in this tab's session storage.
4. If using Pages, set the exact Pages origin before starting the companion, for example:

   ```bash
   MURMUR_ALLOWED_ORIGIN=https://YOUR-USERNAME.github.io npm start
   ```

   On Chromium, grant the Pages site local network permission if prompted. A mobile browser's `localhost` points at the phone. Use the remote setup below for phones.

## Mobile and remote deployment

The Pages UI supports an HTTPS companion hostname. The companion still binds only to loopback on a persistent Linux server; a Cloudflare Tunnel maps an HTTPS hostname to `http://127.0.0.1:4317` without opening inbound port 4317. Cloudflare Tunnel is a transport, not the agent runtime. The server must remain on, have Node.js 20+, Codex CLI signed in with ChatGPT, and enough disk space for the local transcript. **No software installation is needed on the phone.**

1. On the server, clone this repository into `~/murmur-room`, install Codex CLI from OpenAI's official installer, run `codex login --device-auth` if browser sign-in is unavailable, and check `codex login status` reports ChatGPT sign-in. Enable device-code sign-in in ChatGPT settings if required. Do not use an OpenAI API key.
2. Choose a dedicated hostname, such as `room.example.com`, and create a named Cloudflare Tunnel with a published application route to `http://127.0.0.1:4317`. Run `cloudflared` as a service on the server. Keep the route public at the transport layer; the companion's 256-bit bearer token authenticates API requests. For added account access protection, a same-origin proxy with interactive login can be added later; a cross-origin Cloudflare Access login may block CORS preflight requests from GitHub Pages.
3. Generate a secret on the server and create `~/.config/murmur-room/env` with permissions `0600`:

   ```bash
   umask 077
   mkdir -p ~/.config/murmur-room ~/murmur-room/.data
   printf 'MURMUR_TOKEN=%s\nMURMUR_PUBLIC_HOST=%s\nMURMUR_ALLOWED_ORIGIN=%s\n' \
     "$(openssl rand -hex 32)" 'room.example.com' 'https://cargo-culture.github.io' \
     > ~/.config/murmur-room/env
   chmod 600 ~/.config/murmur-room/env
   ```

   Substitute the actual hostname. Keep this secret off GitHub, logs, URLs, and chat. The server will refuse remote mode without a persistent token of at least 32 characters.
4. Install the bundled `deploy/murmur.service` under `~/.config/systemd/user/murmur.service`, run `systemctl --user daemon-reload && systemctl --user enable --now murmur`, and enable user lingering if the service must survive logout. The service expects the repository in `~/murmur-room`. Verify `curl -H 'Host: room.example.com' http://127.0.0.1:4317/health` locally and `https://room.example.com/health` over the tunnel.
5. On any mobile browser, open [Murmur Room](https://cargo-culture.github.io/murmur-room/), enter `https://room.example.com` as Companion URL, and paste the private room token from the server's environment file. The token remains in that browser tab's session storage. No local companion or mobile download is needed.

The direct cross-origin connection requires the Pages origin to be listed in `MURMUR_ALLOWED_ORIGIN`; it uses HTTPS and the `X-Murmur-Token` header. A public hostname is only accepted if configured in `MURMUR_PUBLIC_HOST`. A public tunnel can expose the health and static pages; API operations require the token. Anyone who obtains the token can read the transcript and use subscription capacity, so rotate it if exposed. The cloud server and tunnel may incur hosting charges independent of OpenAI usage.

## GitHub Pages

Publish the `docs/` directory from `main` in **Settings → Pages → Deploy from a branch**. For a repository named `murmur-room`, the URL is `https://YOUR-USERNAME.github.io/murmur-room/`. The static site contains no credentials. The companion and its `.data/room.json` transcript remain on your machine; Pages alone cannot execute agents.

## How it works

- Every agent receives the same room transcript and a reproducible personality from a random 32-bit seed. These are different prompts to the same Codex subscription-backed model, not independent model weights.
- **Give floor** starts a specific agent turn. **Automatic turns** takes turns across active agents with a configurable delay and a hard cap per run; it stops when an agent errors or the limit is reached. **Stop** aborts the current process.
- **Prune** removes an agent from future turns while preserving the transcript. Restore reactivates it.
- The observer makes private notes when messages change. It never posts to the room or triggers an agent turn. Turn off **Observer** to stop it.
- The companion persists messages and settings in `.data/room.json`, uses `codex exec --ephemeral` in a temporary read-only directory, and passes no API key. It binds only to loopback, checks exact Origins and Host, and requires a random room token on every API request. Do not publish the token or expose port 4317 to the internet.
- A Pages browser can reach a companion on the same device via loopback, or on a persistent server via an HTTPS hostname. A browser can restrict local network requests; use the remote HTTPS route for mobile.

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
| `MURMUR_PUBLIC_HOST` | unset | Exact external HTTPS hostname forwarded by a private tunnel |

OpenAI documentation distinguishes [ChatGPT sign-in from API-key billing](https://learn.chatgpt.com/docs/auth) and documents [non-interactive `codex exec`](https://learn.chatgpt.com/docs/non-interactive-mode). Subscription usage remains subject to the user's plan limits and workspace permissions.
