# Forge Desk

A private, browser-based development desk for one Contabo VPS. It has a minimal landing dashboard and a full [code-server](https://github.com/coder/code-server) workspace with an integrated terminal, Git, persistent files, Codex CLI, and OpenCode for DeepSeek.

## What is stored where

| Item | Location on the VPS | Persists through rebuilds |
| --- | --- | --- |
| Your projects and Markdown docs | `./workspace` | Yes |
| IDE settings and extensions | Docker volumes | Yes |
| HTTPS certificates | Docker volume | Yes |
| API credentials configured by agent CLIs | IDE Docker volume | Yes |

## Deploy on the VPS

1. Point an `A` record such as `desk.example.com` to the VPS IPv4 address. Open ports **80** and **443** in Contabo's firewall and Ubuntu's firewall.
2. Install Docker Engine and the Docker Compose plugin from Docker's official Ubuntu instructions.
3. Copy this directory to the server, then create your secrets file:

   ```sh
   cd forge-desk
   cp .env.example .env
   mkdir -p workspace && cp -rn workspace-template/. workspace/   # starter files (auto-opens a terminal)
   sudo chown -R 1000:1000 workspace   # code-server runs as uid 1000
   docker compose run --rm --no-deps gateway caddy hash-password --plaintext 'a long unique gateway password'
   ```

4. Paste the generated bcrypt value after `FORGE_PASSWORD_HASH=` in `.env`, **wrapped in single quotes** (the hash contains `$`, which Docker Compose would otherwise mangle); set the same hostname in `FORGE_DOMAIN` and another long password in `CODE_SERVER_PASSWORD`.
5. Build and start it:

   ```sh
   docker compose up -d --build
   docker compose ps
   ```

Open `https://desk.example.com`. The first browser prompt is the gateway login (`forge` plus the gateway password); the second is the IDE password. Keeping both layers is intentional.

## Terminal and apps

- **Terminal:** the dashboard's **Open terminal** button opens the workspace, and the starter `.vscode/tasks.json` opens a terminal automatically (click *Allow automatic tasks* once). You can always press <kbd>Ctrl</kbd>+<kbd>`</kbd>.
- **Installing software:** the terminal runs as `coder` with `sudo`, so `sudo apt install <pkg>`, `pip install`, `npm i -g` all work. Anything installed outside `./workspace`, `~/.config` or `~/.local` is lost when the image is rebuilt, so add tools you want permanently to `workspace-image/Dockerfile`.
- **Apps:** start any web app in the terminal, then use the dashboard's **Apps** section or **Open app on port**. It opens at `/ide/proxy/<port>/` behind both logins. Bind servers to `0.0.0.0` or `127.0.0.1`; apps that need a base path can use `/ide/absproxy/<port>/` instead. Favourites live in `dashboard/apps.json` (edit it on the VPS, no rebuild).

## Using AI agents

Open **Workspace**, then open its terminal.

```sh
codex
```

Sign into Codex in its own terminal flow. Do not put a ChatGPT or OpenAI secret into the repository or `.env`.

For DeepSeek, run the following and follow the connection flow:

```sh
opencode
```

Then type `/connect`, choose `deepseek`, and enter the DeepSeek API key only when OpenCode requests it. Its saved authentication stays in the persistent IDE volume, not in your project source.

## Safety notes

- This is single-user by design. Do not create user accounts for other people in this version.
- Back up the `workspace` folder and Docker volumes before upgrades. A simple start is a nightly encrypted `restic` backup to external storage.
- Keep SSH key-only and disable password authentication after confirming access. The web terminal should never be exposed outside this HTTPS gateway.
- Update the workspace tools deliberately: `docker compose build --pull ide && docker compose up -d ide`.

## Configuration check

After creating a real `.env`, confirm Docker accepts the stack before starting it:

```sh
docker compose config >/dev/null && echo 'Compose configuration is valid'
```

For the real VPS, always use a public domain so Caddy can obtain a trusted TLS certificate.

