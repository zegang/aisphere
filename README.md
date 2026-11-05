# AiSphere Desktop

**AiSphere Desktop** is a versatile, privacy-focused local AI application manager. It empowers users to discover, install, and manage a wide array of AI tools—including Large Language Models (LLMs), autonomous agents, and datasets—directly on their own hardware.

By leveraging local runtimes (containers, singularity or natives/conda), AiSphere ensures that your data and models never leave your machine, providing a secure and high-performance environment for modern AI workflows.

## Visual Overview

Below are some highlights of the AiSphere Desktop interface:

### 1. The Home Dashboard
![AiSphere Home Dashboard](docs/screenshots/home.png)
*A unified view of your local AI ecosystem, showing active applications and system health.*

### 2. Application Exploration
![Explore on various AIs to install locally](docs/screenshots/explore.png)
*Discover new AIs to install locally, categorized by type (LLM, Agent, Tool) with detailed hardware requirement checks.*

### 3. Your AI Apps
![Local AI Apps ready for use](docs/screenshots/myapps.png)

### 4. Start & Enjoy AIs
![deepseekr1podman](docs/screenshots/deepseekr1podman.png)
![deepseekr1podmanstart](docs/screenshots/deepseekr1podmanstart.png)
*Manage running instances with built-in terminals and one-click access to local web services.*
![deepseekr1podmanlogshell](docs/screenshots/deepseekr1podmanlogshell.png)
![deepseekr1podmanopenwebui](docs/screenshots/deepseekr1podmanopenwebui.png)

### 4. Runtime Management
![Runtimes](docs/screenshots/runtimes.png)
*Automated checks and installation guides for required runtimes like Podman and Apptainer.*
![Runtime Install](docs/screenshots/runtimeinstalling.png)

## Core Features

*   **Local Execution**: Run powerful AI models like Ollama, DeepSeek-R1, and custom agents without cloud dependencies.
*   **Multi-Runtime Support**: Native integration with **Podman** and **Apptainer** (Singularity) to handle various container formats and isolation requirements.
*   **Integrated Workspace**:
    *   **Interactive Shell**: Directly attach to running containers.
    *   **Real-time Logs**: Monitor installation and execution processes with a resizable terminal.
    *   **Internal Web View**: Access web-based AI interfaces (like Open WebUI) directly inside the desktop app.
*   **Hardware Monitoring**: Real-time insights into your system's CPU, GPU (NVIDIA/Apple Silicon/Linux), Memory, and Storage availability.
*   **Global App Store**: An "Explore" section to discover new AI tools tailored for your specific hardware architecture.

More are on the way...vLLM & SGLang...
![vLLM](docs/screenshots/vllm.png)

## Getting Started

To begin your local AI journey, ensure you have a supported container runtime installed via the **Runtimes** tab, then head over to **Explore** to install your first AI application.

## Build and Run on Windows

The repository ships self-contained scripts for Windows 11. They bootstrap a portable
Node.js and Yarn into `.tools/` when no suitable system Node.js is available, so the
only prerequisite is Windows PowerShell 5.1+ (included with Windows 11) and an internet
connection for the first run.

From the repository root, double-click the `.cmd` files or run them from a terminal:

| Command | What it does |
| --- | --- |
| `scripts\windows\setup.cmd` | Downloads Node.js/Yarn if needed, installs dependencies, and prepares the icons. Run this first. |
| `scripts\windows\dev.cmd` | Starts Vite and launches Electron in development mode (hot reload). |
| `scripts\windows\build.cmd` | Builds the renderer/main process and packages a Windows installer. |

Build options (PowerShell):

```powershell
# Build the NSIS installer for x64 (default)
.\scripts\windows\build.ps1 -Arch x64

# Build an unpacked application folder instead (faster, no installer)
.\scripts\windows\build.ps1 -Kind dir

# Build for ARM64
.\scripts\windows\build.ps1 -Arch arm64

# Reinstall dependencies and/or skip the TypeScript check
.\scripts\windows\setup.ps1 -ForceInstall
.\scripts\windows\build.ps1 -SkipTypeCheck
```

Outputs are written to `release/`:

* `release\aisphere-<version>-win-<arch>.exe` – the installer.
* `release\win-<arch>-unpacked\aisphere.exe` – the unpacked app, runnable without installing.

Notes:

* Dependencies are installed with `--ignore-scripts`; the scripts then run only the
  installers that are actually needed (Electron download, node-pty, esbuild). This keeps
  the build working without Visual Studio C++ build tools or Python.
* Closing the main window hides AiSphere to the system tray instead of quitting. Click the
  tray icon (or launch the app again) to reopen the window; use **Quit AiSphere** in the
  tray menu to exit completely.
* `.tools/` is ignored by git and can be deleted at any time to force a clean bootstrap.
* Portable-tool versions can be overridden with the `AISPHERE_NODE_VERSION` environment
  variable (default `v24.22.2`).

## Authors
- <zegang.luo@qq.com>
- You are welcomed to join AiSphere to make everyone enjoy AI

---
*AiSphere Desktop - Your Versatile Local AI*