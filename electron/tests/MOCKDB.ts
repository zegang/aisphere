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
  }
]