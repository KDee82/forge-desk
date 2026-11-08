FROM codercom/code-server:4.145.2-noble

USER root

# The base image bundles Node only for code-server itself (no npm on PATH),
# so install a system Node.js to host the agent CLIs.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      build-essential ca-certificates curl git jq less openssh-client python3 python3-pip ripgrep sudo \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && npm install -g @openai/codex@latest opencode-ai@latest \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

USER coder

WORKDIR /home/coder/project

