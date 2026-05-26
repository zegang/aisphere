import os
import traceback

# 1. Selectively clean malformed proxy environment variables
# Standalone colons or empty strings cause httpx to crash.
# We only pop them if they are invalid to preserve legitimate network routes.
proxy_vars = [
    "http_proxy", "https_proxy", "all_proxy", "no_proxy",
    "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY"
]
for var in proxy_vars:
    os.environ.pop(var, None)

# # SSL and Connection Resilience for Mirrors
# os.environ["HF_HUB_DISABLE_SSL_VERIFY"] = "1" # Use if mirror certs are untrusted
# os.environ["HF_HUB_ETAG_TIMEOUT"] = "30"      # Increase timeout for slow mirrors
# Hugging Face Mirror
# os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"

# ROCm / RDNA3 (gfx1100) Configuration
os.environ["VLLM_TARGET_DEVICE"] = "rocm"
os.environ["ROCR_VISIBLE_DEVICES"] = "0"
os.environ["HSA_OVERRIDE_GFX_VERSION"] = "11.0.0"

import sys
import argparse
import torch
import vllm
# Evaluate the active flag state (vLLM treats "1", "true", "yes" as True)
vllm_use_v1 = os.getenv("VLLM_USE_V1", "0").lower() in ("1", "true", "yes")

if vllm_use_v1:
    print("vLLM Engine Status: Running on V1 (Experimental New Engine Backend)")
else:
    print("vLLM Engine Status: Running on V0 (Stable/Production Engine Backend)")

import inspect

# Inspect where the vllm.LLM class or Engine imports point to
module_source = inspect.getfile(vllm.LLM)

if "v1" in module_source:
    print(f"Active Engine: V1 Backend\nSource Path: {module_source}")
else:
    print(f"Active Engine: V0 Backend\nSource Path: {module_source}")

# Programmatic check inside your code
if torch.cuda.is_available():
    # This will return 'cuda' on ROCm platforms
    device_type = torch.device("cuda")
    print(f"Using backend device: {device_type}")
    print(f"GPU Name: {torch.cuda.get_device_name(0)}")
else:
    print("Warning: ROCm/CUDA device not detected by PyTorch.")

print("--- Python Environment Interrogation ---")
print(f"Executable: {sys.executable}")

try:
    # 1. Force the lazy load mechanics inside vllm platforms to trigger right now
    from vllm.platforms import current_platform

    print("\n--- vLLM Detected Platform State ---")
    print(f"Platform Enum:  {current_platform._enum}")
    print(f"Device Type:    {repr(current_platform.device_type)}") # Will show "" if failing
    print(f"Device Name:    {current_platform.get_device_name()}")

    # 2. Assert check to replicate the vllm.config crash state before booting the engine
    if not current_platform.device_type:
        raise RuntimeError(
            "CRITICAL: vLLM inferred an empty device type string. "
            "Downstream PyTorch allocation will fail."
        )
    else:
        print(f"Success! Ready to target backend key: {current_platform.dispatch_key}")

except Exception as e:
    print(f"\nDetection Fault Encountered:\n{str(e)}")

def run_interactive_chat(model_name: str):
    print(f"--- Initializing vLLM with model: {model_name} ---")

    try:
        # Initialize the vllm.LLM engine
        # Note: This requires a GPU with sufficient VRAM
        llm = vllm.LLM(model=model_name, trust_remote_code=True)
    except Exception as e:
        traceback.print_exc()
        print(f"Error loading model: {e}")
        sys.exit(1)

    # Configure sampling parameters
    sampling_params = vllm.SamplingParams(
        temperature=0.7,
        top_p=0.95,
        max_tokens=256,
        presence_penalty=1.1
    )

    print("\n" + "="*50)
    print("AiSphere vLLM Test CLI")
    print("Type 'exit' or 'quit' to end the session.")
    print("="*50 + "\n")

    while True:
        try:
            user_input = input("User >>> ").strip()

            if user_input.lower() in ["exit", "quit"]:
                print("Goodbye!")
                break

            if not user_input:
                continue

            # vLLM generate expects a list of prompts
            outputs = llm.generate([user_input], sampling_params)

            for output in outputs:
                generated_text = output.outputs[0].text
                print(f"\nAssistant:{generated_text}\n")

        except KeyboardInterrupt:
            print("\nAborted by user.")
            break

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Simple vLLM Interactive CLI")
    parser.add_argument("--model", type=str, default="./facebook-opt-125m", help="Path or name of the model")
    args = parser.parse_args()

    run_interactive_chat(args.model)