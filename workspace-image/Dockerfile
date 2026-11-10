# Forge Desk workspace: one container with the web desktop server, code-server,
# a real Linux desktop (XFCE over VNC), Chromium, and the automation tools.
# Build context is the repository root (see docker-compose.yml).
FROM codercom/code-server:4.145.2-noble

USER root
ENV DEBIAN_FRONTEND=noninteractive

# Command-line tools, the desktop, and what automation needs.
# The base image bundles Node only for code-server itself, so install a system Node.js.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      build-essential ca-certificates curl wget git gh jq less nano openssh-client \
      python3 python3-pip python3-venv ripgrep fd-find sudo tmux htop unzip zip iproute2 procps \
      supervisor dbus-x11 tigervnc-standalone-server xfce4 xfce4-terminal \
      xdotool wmctrl scrot xclip adwaita-icon-theme \
      fonts-dejavu-core fonts-liberation fonts-noto-color-emoji \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Agent CLIs, plus Playwright with its own Chromium. That one browser is both the
# browser you see in the Linux desktop and the one automation scripts drive.
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright \
    NODE_PATH=/usr/lib/node_modules
RUN npm install -g @openai/codex@latest opencode-ai@latest playwright@latest \
    && apt-get update \
    && playwright install --with-deps chromium \
    && chmod -R a+rX /opt/ms-playwright \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /root/.npm

# The Forge Desk server. The interface in ./dashboard is baked in as a default and
# is replaced by the live folder that docker-compose mounts over it.
WORKDIR /opt/forge-desk/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && rm -rf /root/.npm
COPY server/server.js ./
COPY dashboard /opt/forge-desk/dashboard

COPY workspace-image/supervisord.conf /etc/supervisor/supervisord.conf
COPY workspace-image/bin/ /usr/local/bin/
COPY workspace-image/forge-browser.desktop /usr/share/applications/forge-browser.desktop
RUN chmod 755 /usr/local/bin/forge /usr/local/bin/forge-start /usr/local/bin/forge-browser /usr/local/bin/forge-desktop-session \
    # X needs its socket folder; create it as root so the unprivileged X server can use it.
    && mkdir -p /tmp/.X11-unix && chmod 1777 /tmp/.X11-unix \
    # Skip XFCE's "first start of the panel" question by seeding the default panel.
    && mkdir -p /etc/xdg/xfce4/xfconf/xfce-perchannel-xml \
    && cp /etc/xdg/xfce4/panel/default.xml /etc/xdg/xfce4/xfconf/xfce-perchannel-xml/xfce4-panel.xml \
    && update-alternatives --install /usr/bin/x-www-browser x-www-browser /usr/local/bin/forge-browser 200

USER coder
ENV HOME=/home/coder USER=coder BROWSER=/usr/local/bin/forge-browser
WORKDIR /home/coder/project
EXPOSE 7700
ENTRYPOINT ["dumb-init", "--", "/usr/local/bin/forge-start"]
