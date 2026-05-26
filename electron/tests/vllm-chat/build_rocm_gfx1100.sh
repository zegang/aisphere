#!/bin/bash
# Script to build vLLM locally for ROCm gfx1100 using uv
set -e

# Set ROCm specific environment variables for vLLM compilation
export VLLM_TARGET_DEVICE=rocm
export PYTORCH_ROCM_ARCH=gfx1100
export ROCM_HOME=${ROCM_HOME:-/opt/rocm}
export MAX_JOBS=${MAX_JOBS:-$(nproc)}
# export VLLM_VERSION_OVERRIDE="0.6.4"
# export SETUPTOOLS_SCM_PRETEND_VERSION="0.6.4"

export UV_INDEX_URL="https://download.pytorch.org/whl/rocm7.2"
export UV_EXTRA_INDEX_URL="https://pypi.org/simple"
export UV_NO_BUILD_ISOLATION=1
export UV_INDEX_STRATEGY=unsafe-best-match

echo "--- Starting vLLM Local Build for ROCm (gfx1100) ---"
echo "--- Using ROCm Path: $ROCM_HOME (Jobs: $MAX_JOBS) ---"

# 1. Ensure the virtual environment exists
rm -rf .venv
uv venv

# 2. Pre-install numpy, torch (ROCm), and build tools
# Since we are disabling build isolation, we must provide build-time deps manually.
echo "--- Pre-installing build requirements (numpy, torch, setuptools, etc.) ---"
uv pip install numpy torch amdsmi setuptools setuptools-rust setuptools-scm wheel cmake ninja

# 3. Sync the project (this will trigger the local vLLM build)
echo "--- Building local vLLM and syncing dependencies ---"
# uv sync
cd vllm_src; git clean -xdf; uv cache clean; uv pip install -e .

echo "--- Build and environment synchronization complete ---"
