import { Application } from '../../src/types/api'

export const MOCK_APPLICATIONS: Application[] = [
  {
    id: 'app-001',
    name: 'Ollama',
    org: 'Ollama',
    version: '0.5.7',
    icon: 'https://ollama.com/public/openclaw_ollama.png',
    description: 'Run large language models locally.',
    category: 'LLMs Inference Engine',
    type: 'llm',
    runtime: {
      runtime: 'apptainer',
    },
    labels: ['local', 'LLM', 'AI'],
    requirements: {
      platform: 'any',
      cpu: 'x64',
      memory: '8GB RAM',
      storage: '10GB',
      gpu: 'NVIDIA RTX 3060'
    },
    packages: ['file://../aisphere2/resources/sifs/ollama.sif']
  },
  {
    id: 'app-002',
    name: 'DeepseekR1',
    org: 'DeepSeek',
    version: '0.5.7',
    icon: 'https://ollama.com/public/openclaw_ollama.png',
    description: 'Run large language models locally.',
    category: 'WebUI',
    type: 'llm',
    runtime: {
      runtime: 'podman',
      options: ['-p 6060:8080', '--entrypoint "/app/backend/start.sh"']
    },
    labels: ['local', 'LLM', 'AI', 'Web'],
    requirements: {
      platform: 'any',
      cpu: 'x64',
      memory: '8GB RAM',
      storage: '10GB',
      gpu: 'NVIDIA RTX 3060'
    },
    packages: [
      'https://github.com/zegang/aisphere/releases/download/v0.0.1-alpha/install.sh'
    ]
  },
  {
    id: 'app-003',
    name: 'vLLM',
    org: 'vLLM Project',
    url: 'https://github.com/vllm-project/vllm',
    version: '0.6.4',
    icon: 'https://raw.githubusercontent.com/vllm-project/vllm/main/docs/source/assets/vllm-logo-text.png',
    description: 'High-throughput and memory-efficient inference engine for LLMs.',
    category: 'LLMs Inference Engine',
    type: 'llm',
    runtime: {
      runtime: 'conda',
      install:[ 'pytroch', 'trochvision', 'torchaudio', 'pytroch-cuda=11.8', '-c pytorch', '-c nvidia'],
      args: ['--model', 'facebook/opt-125m']
    },
    labels: ['local', 'inference', 'vllm'],
    requirements: {
      platform: 'linux',
      cpu: 'x64',
      memory: '16GB RAM',
      storage: '10GB',
      gpu: 'NVIDIA RTX 3090/4090'
    },
    packages: ['file://../aisphere2/resources/sifs/vllm.tar.gz']
  },
  {
    id: 'app-004',
    name: 'SGLang',
    org: 'SGL-Project',
    url: 'https://github.com/sgl-project/sglang',
    version: '0.4.1',
    description: 'A structured generation language for LLMs, optimized for performance.',
    category: 'LLMs Inference Engine',
    type: 'llm',
    runtime: {
      runtime: 'conda',
      args: ['--model-path', 'meta-llama/Llama-3-8B']
    },
    labels: ['local', 'inference', 'sglang'],
    requirements: {
      platform: 'linux',
      cpu: 'x64',
      memory: '16GB RAM',
      storage: '10GB',
      gpu: 'NVIDIA RTX 3090/4090'
    },
    packages: ['file://../aisphere2/resources/sifs/sglang.tar.gz']
  },
  {
    id: 'app-005',
    name: 'llama.cpp Chat',
    org: 'ggml-org',
    url: 'https://github.com/ggml-org/llama.cpp',
    version: 'latest',
    description: 'Chat with a compact Qwen2.5 0.5B model in your browser. Runs llama.cpp in Docker with its built-in web UI.',
    category: 'LLMs Inference Engine',
    type: 'llm',
    runtime: {
      runtime: 'docker',
      image: 'ghcr.io/ggml-org/llama.cpp:server',
      options: ['-p', '8090:8080'],
      // {model} is replaced by the runtime with the installed GGUF model.
      args: ['-m', '{model}', '--host', '0.0.0.0', '--port', '8080', '-c', '4096', '--jinja']
    },
    labels: ['local', 'LLM', 'chat', 'webui', 'docker'],
    requirements: {
      platform: 'any',
      cpu: 'x64',
      memory: '4GB RAM',
      storage: '1GB',
      gpu: 'Not required (CPU inference)'
    },
    packages: [
      'https://modelscope.cn/models/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/master/qwen2.5-0.5b-instruct-q4_k_m.gguf'
    ]
  },
  {
    id: 'app-006',
    name: 'DeepSeek R1 1.5B Chat',
    org: 'DeepSeek',
    url: 'https://github.com/deepseek-ai/DeepSeek-R1',
    version: 'latest',
    description: 'Chat with DeepSeek-R1-Distill-Qwen-1.5B locally. Runs llama.cpp in Docker with its built-in web UI; the downloaded GGUF model is detected automatically by the Notes workspace.',
    category: 'LLMs Inference Engine',
    type: 'llm',
    runtime: {
      runtime: 'docker',
      image: 'ghcr.io/ggml-org/llama.cpp:server',
      options: ['-p', '8091:8080'],
      // {model} is replaced by the runtime with the installed GGUF model.
      args: ['-m', '{model}', '--host', '0.0.0.0', '--port', '8080', '-c', '8192', '--jinja']
    },
    labels: ['local', 'LLM', 'chat', 'webui', 'docker', 'deepseek', 'reasoning'],
    requirements: {
      platform: 'any',
      cpu: 'x64',
      memory: '4GB RAM',
      storage: '2GB',
      gpu: 'Not required (CPU inference)'
    },
    packages: [
      'https://modelscope.cn/models/unsloth/DeepSeek-R1-Distill-Qwen-1.5B-GGUF/resolve/master/DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf'
    ]
  }
]