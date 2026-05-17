import { Application } from '../../src/types/api'

export const MOCK_APPLICATIONS_INSTALLED: Application[] = [
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
    install_url: 'file:///opt/aisphere/resources/sifs/ollama.sif',
    requirements: {
      platform: 'any',
      cpu: 'x64',
      memory: '8GB RAM',
      storage: '10GB',
      gpu: 'NVIDIA RTX 3060'
    },
    install: {
      installed: true,
      installed_at: new Date().toISOString(),
      installed_by: 'user-001',
      installed_package: '/../aisphere2/resources/sifs/ollama.sif'
    },
  }
]

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
    install_url: 'file://../aisphere2/resources/sifs/ollama.sif',
    requirements: {
      platform: 'any',
      cpu: 'x64',
      memory: '8GB RAM',
      storage: '10GB',
      gpu: 'NVIDIA RTX 3060'
    }
  },
  {
    id: 'app-002',
    name: 'DeepseekR1',
    org: 'DeepSeek',
    version: '0.5.7',
    icon: 'https://ollama.com/public/openclaw_ollama.png',
    description: 'Run large language models locally.',
    category: 'Web',
    type: 'llm',
    runtime: {
      runtime: 'podman',
      options: ['-p 6060:8080', '--entrypoint "/app/backend/start.sh"']
    },
    labels: ['local', 'LLM', 'AI', 'Web'],
    install_url: 'file://../aisphere2/resources/containers/images/openwebui-deepseekr1.tar',
    requirements: {
      platform: 'any',
      cpu: 'x64',
      memory: '8GB RAM',
      storage: '10GB',
      gpu: 'NVIDIA RTX 3060'
    }
  },
  {
    id: 'app-003',
    name: 'ImageGen Tool',
    org: 'CreativeAI',
    version: '2.0.1-beta',
    icon: 'https://cdn-icons-png.flaticon.com/512/1048/1048953.png',
    description: 'Generate images from text prompts.',
    category: 'Tool',
    type: 'tool',
    runtime: {
      runtime: 'apptainer',
    },
    labels: ['image', 'generation', 'creative'],
    install_url: 'https://imagegen.com',
    requirements: {
      platform: 'mac',
      cpu: 'arm64',
      memory: '16GB RAM',
      storage: '20GB',
      gpu: 'Apple M1/M2/M3'
    }
  },
  {
    id: 'app-004',
    name: 'Speech-to-Text Dataset',
    org: 'OpenData',
    version: '2024.Q4',
    icon: 'https://cdn-icons-png.flaticon.com/512/5907/5907684.png',
    description: 'A large dataset for training speech recognition models.',
    category: 'Dataset',
    type: 'dataset',
    runtime: {
      runtime: 'native',
    },
    labels: ['speech', 'dataset', 'audio'],
    install_url: 'https://dataset.org',
    requirements: {
      platform: 'linux',
      cpu: 'x64',
      memory: '32GB RAM',
      storage: '500GB',
      gpu: 'None'
    }
  },
  {
    id: 'app-005',
    name: 'Autonomous Researcher',
    org: 'AiSphere',
    version: '1.0.2',
    icon: 'https://cdn-icons-png.flaticon.com/512/1903/1903162.png',
    description: 'An AI agent capable of browsing the web and synthesizing research papers into structured summaries.',
    category: 'Agent',
    type: 'agent',
    runtime: {
      runtime: 'podman',
      options: ['-p 3000:3000'],
    },
    labels: ['research', 'agent', 'web-search'],
    install_url: 'file:///../aisphere2/resources/containers/images/research-agent.tar',
    requirements: {
      platform: 'any',
      cpu: 'x64',
      memory: '4GB RAM',
      storage: '5GB',
      gpu: 'None'
    }
  },
  {
    id: 'app-006',
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
    }
  },
  {
    id: 'app-007',
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
    }
  }
]