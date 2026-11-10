# Forge Desk

A private desktop for one VPS that you open at a web address. Sign in once and you get windows, a dock and a launcher in the browser, backed by the real machine:

| App | What it is |
| --- | --- |
| **Terminal** | A real shell on the server. Open as many as you like. They keep running when you close the tab. |
| **Files** | Browse, upload (drag and drop), download, rename, delete, and edit text files. |
| **Code** | The full code-server editor (VS Code in the browser). |
| **Browser** | Chromium running on the server, shown inside the Linux desktop window. |
| **Linux desktop** | A complete XFCE desktop. Any graphical Linux app you install shows up here. |
| **Apps** | Web apps you start on any port, detected automatically and opened in a window. |
| **Automations** | Scripts that drive the browser (Playwright) or the server. Run them with one click. |
| **Codex / OpenCode** | Start an AI agent in a terminal. |
| **Settings** | Theme, background, server load, running terminals, sign out. |

Press **⌘K** (Mac) or **Ctrl+/** to search apps, open a port, browse a site or run a command.

## How it fits together

```
browser ──HTTPS──> host nginx ──> gateway (Caddy) ──> desk container, port 7700
                                                        ├─ Forge Desk server (login, terminals, files)
                                                        ├─ /ide/           code-server
                                                        ├─ /proxy/<port>/  your web apps
                                                        └─ /ws/vnc         XFCE desktop + Chromium
```

Everything lives in one container (`desk`), so the terminal, the editor, the desktop and your apps all see the same files and the same ports.

| Item | Location on the VPS | Survives rebuilds |
| --- | --- | --- |
| Projects | `./workspace` (shown as `~/project`) | Yes |
| Editor settings, browser profile, agent logins | Docker volume `ide_config` | Yes |
| Tools installed with `pip --user`, `npm` prefix in `~/.local` | Docker volume `ide_local` | Yes |
| The interface | `./dashboard` (served live: edit and reload) | Yes |
| Anything installed with `sudo apt install` | Inside the container | No. Add it to `workspace-image/Dockerfile` |

## Upgrade from version 1

Your `.env` keeps working. The password is the gateway password you already use (the `forge` user name is no longer asked for).

```sh
cd forge-desk
docker compose up -d --build --remove-orphans
docker compose ps
```

The first build downloads the desktop and Chromium, so expect several minutes and an image of a few gigabytes.

**One change on the host nginx.** nginx limits uploads to 1 MB unless told otherwise. In `/etc/nginx/sites-available/forge`, inside the `server` block, add:

```nginx
client_max_body_size 0;
```

then `sudo nginx -t && sudo systemctl reload nginx`. The vhost must also keep passing WebSocket upgrades, as it already does for code-server.

## Fresh install

1. Point a DNS record at the VPS and install Docker Engine with the Compose plugin.
2. Copy this folder to the server, then:

   ```sh
   cd forge-desk
   cp .env.example .env
   mkdir -p workspace && cp -rn workspace-template/. workspace/
   sudo chown -R 1000:1000 workspace        # the workspace runs as uid 1000
   docker compose run --rm --no-deps gateway caddy hash-password --plaintext 'a long unique password'
   ```

3. Paste the hash after `FORGE_PASSWORD_HASH=` in `.env`, **inside single quotes**, and set `FORGE_DOMAIN`.
4. `docker compose up -d --build`

This repository is set up for a server where a host nginx already owns ports 80 and 443 (see the note at the end). If Caddy should serve HTTPS itself, change the site address in `Caddyfile` from `http://{$FORGE_DOMAIN}` to `{$FORGE_DOMAIN}`, remove the `header_up X-Forwarded-Proto https` line, and publish `80:80` and `443:443` in `docker-compose.yml`.

## Everyday use

- **Install software:** the terminal runs as `coder` with `sudo`. `sudo apt install <pkg>` works straight away but is lost on rebuild; add permanent tools to the Dockerfile.
- **Run a web app:** start it in the terminal (`npm run dev`, `python3 -m http.server 8000`). It appears in **Apps** and on the home screen within a few seconds. Apps that need a base path can use `/absproxy/<port>/`. Port 7700, 7701, 5901 and 9222 are used by Forge Desk itself.
- **Graphical apps:** anything started from a Forge Desk terminal opens in the **Linux desktop** window (`DISPLAY` is already set). Try `xfce4-terminal &`.
- **Browser:** type an address in the bar at the top of the desktop window. Logins persist in `~/.config/forge-browser`. Inside that browser, `localhost:3000` reaches your own apps directly.
- **Automations:** scripts live in `~/project/automations`. A `.js` script can attach to the browser you are watching:

  ```js
  const { chromium } = require('playwright');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  ```

  `xdotool`, `wmctrl` and `scrot` are installed for driving other desktop apps.
- **`forge` command:** `forge open <address>`, `forge shot`, `forge ports`, `forge status`, `forge restart <desk|code|display|desktop>`.
- **AI agents:** click **Codex** or **OpenCode** in the dock. Sign in inside the terminal when asked. Never put API keys in this repository or in `.env`.

## Security

- **One login.** Version 1 asked for a gateway password and then a second code-server password. Version 2 has a single sign-in page; code-server, the terminals, the desktop and proxied apps all sit behind it and listen only inside the container. Use a long, unique password: it is the only thing between the internet and a root-capable shell.
- Sessions last 30 days per browser. **Settings → Sign out everywhere** ends all of them at once.
- Wrong passwords are throttled: 5 per address, then a growing lockout, plus a cap across all addresses.
- State-changing requests and every WebSocket are refused unless they come from Forge Desk's own pages.
- Web apps you run at `/proxy/<port>/` share the site's origin with Forge Desk, so only run code you trust there. This was already true of code-server's port proxy.
- Chromium runs with `--no-sandbox`, because its sandbox needs kernel privileges the container does not have. Treat the desktop browser as a work tool rather than a place for risky browsing.
- Single-user by design. Keep SSH key-only, and back up `workspace` and the Docker volumes (for example a nightly encrypted `restic` backup).

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Sign-in says no password is set | `FORGE_PASSWORD_HASH` in `.env` must be a bcrypt hash in single quotes. Then `docker compose up -d`. |
| "The Linux desktop is not running" | In a terminal: `forge status`, then `forge restart display` and `forge restart desktop`. |
| Code window says the editor is not running | `forge restart code`. A crash loop with `EACCES` means the volumes are not owned by uid 1000. |
| Uploads over 1 MB fail | Add `client_max_body_size 0;` to the host nginx vhost (see above). |
| Everything is slow | The desktop and Chromium want roughly 2 GB of free memory. Close the browser on the desktop, or check **Settings → Server**. |
| Logs | `docker compose logs -f desk` |

## Run the server without Docker (for development)

```sh
cd server && npm install
FORGE_HOME=/tmp/forge-home FORGE_PASSWORD_HASH='<bcrypt hash>' node server.js   # http://localhost:7700
```

Terminals, files and app proxying work anywhere. The Code and Linux desktop windows need code-server on port 7701 and a VNC server on port 5901.

## Deployment note: Raven (behind host nginx)

On 92.242.191.186 (Raven) ports 80/443 already belong to the host nginx serving the Raven Hermes dashboard, so Forge Desk does **not** bind them:

- `docker-compose.yml` publishes the gateway on `127.0.0.1:8081:80`.
- `Caddyfile` uses the plain-HTTP site address `http://{$FORGE_DOMAIN}` and sets `X-Forwarded-Proto: https` upstream, so sign-in cookies are marked secure and code-server builds HTTPS URLs.
- Host nginx vhost `/etc/nginx/sites-available/forge` terminates TLS (`forge.92.242.191.186.sslip.io`) and proxies to `127.0.0.1:8081`.

The volume folders and `workspace` must be owned by uid 1000.
