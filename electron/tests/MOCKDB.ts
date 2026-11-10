import { ApplicationSpec } from '../../src/types/api'
import { pathToFileURL } from 'url';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { LAN_NAS_APP_ID } from '../../src/shared/channel-types';

/**
 * Locates `resources/market` for the local component artifacts. In packaged
 * builds the whole `resources` dir is shipped via extraResources, so the files
 * live next to the executable under `process.resourcesPath`; in dev they live
 * in the project folder.
 */
const marketDirCandidates = [
  join(process.resourcesPath ?? '', 'market'),
  join(process.cwd(), 'resources', 'market'),
];
const marketDir = marketDirCandidates.find((dir) => existsSync(dir)) ?? marketDirCandidates[1];

/** file:// URL of a marketplace artifact shipped with the app. */
const marketFile = (name: string) => pathToFileURL(join(marketDir, name)).href;

function marketSpec(filename: string): ApplicationSpec {
  const spec = JSON.parse(readFileSync(join(marketDir, filename), 'utf8')) as ApplicationSpec;
  return {
    ...spec,
    // Keep a local manifest artifact for the mock catalog entries that do not
    // install another package; this mirrors the existing Explore test setup.
    packages: spec.packages.length > 0 ? spec.packages : [marketFile(filename)],
    postInstallActions: spec.lifecycle?.postInstall,
    postStopActions: spec.lifecycle?.postStop,
    postUnInstallActions: spec.lifecycle?.postUninstall,
  };
}

const deepseekSpec = marketSpec('deepseek-r1-1.5b.json');
const fileBrowserNasSpec = marketSpec('filebrowser-nas.json');

const appRequirements = {
  platform: 'any' as const,
  cpu: 'x64',
  memory: 'Minimal',
  storage: '1MB',
  gpu: 'Not required',
};

export const MOCK_APPLICATIONS: ApplicationSpec[] = [
  {
    id: LAN_NAS_APP_ID,
    name: 'AiSphere LAN NAS',
    org: 'AiSphere',
    version: '1.0.0',
    description: 'Share a selected folder over your local network. Browse and upload files from phones, tablets, and other computers.',
    category: 'File Sharing',
    type: 'other',
    kind: 'app',
    runtime: { runtime: 'native' },
    labels: ['local network', 'NAS', 'file sharing', 'upload'],
    requirements: {
      platform: 'any',
      cpu: 'Any',
      memory: 'Minimal',
      storage: 'No additional storage',
      gpu: 'Not required',
    },
    packages: [],
  },
  {
    id: 'app-001',
    name: 'Ollama',
    org: 'Ollama',
    version: '0.5.7',
    icon: 'https://ollama.com/public/openclaw_ollama.png',
    description: 'Run large language models locally.',
    category: 'LLMs Inference Engine',
    type: 'llm',
    kind: 'engine',
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
    kind: 'webui',
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
    kind: 'engine',
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
    kind: 'engine',
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
    kind: 'engine',
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
    description: 'Run DeepSeek-R1-Distill-Qwen-1.5B locally on a personal laptop using CPU inference. AiSphere downloads a compact GGUF model and serves it through llama.cpp; after starting, it appears in the Workspace model picker.',
    category: 'LLMs Inference Engine',
    type: 'llm',
    kind: 'engine',
    runtime: {
      ...deepseekSpec.runtime,
    },
    labels: deepseekSpec.labels,
    requirements: {
      platform: 'any',
      cpu: 'x64',
      memory: '4GB RAM',
      storage: '2GB',
      gpu: 'Not required (CPU inference)'
    },
    packages: deepseekSpec.packages
  },
  {
    id: 'app-007',
    name: 'Open WebUI',
    org: 'Open WebUI',
    url: 'https://github.com/open-webui/open-webui',
    version: 'latest',
    description: 'Open WebUI: a self-hosted chat front-end for local LLM engines. The workspace opens its web interface as a tab once it is running.',
    category: 'WebUI',
    type: 'llm',
    kind: 'webui',
    runtime: {
      runtime: 'docker',
      image: 'ghcr.io/open-webui/open-webui:main',
      options: ['-p', '8092:8080', '--add-host', 'host.docker.internal:host-gateway']
    },
    labels: ['local', 'chat', 'webui', 'docker', 'open-webui'],
    requirements: {
      platform: 'any',
      cpu: 'x64',
      memory: '4GB RAM',
      storage: '5GB',
      gpu: 'Not required'
    },
    packages: [marketFile('open-webui.json')]
  },
  {
    id: 'app-008',
    name: 'GitHub MCP Server',
    org: 'Model Context Protocol',
    url: 'https://github.com/modelcontextprotocol/servers',
    version: 'latest',
    description: 'MCP server exposing GitHub tools (issues, pull requests, code search) so workspace agents can operate on repositories.',
    category: 'MCP Server',
    type: 'tool',
    kind: 'mcp',
    runtime: {
      runtime: 'native',
      args: ['-y', '@modelcontextprotocol/server-github']
    },
    labels: ['mcp', 'tools', 'github'],
    requirements: { ...appRequirements },
    component: {
      server: {
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        tools: [
          { name: 'get_issue', description: 'Get details of a GitHub issue' },
          { name: 'create_issue', description: 'Create a new issue in a GitHub repository' },
          { name: 'list_pull_requests', description: 'List open pull requests of a repository' }
        ]
      }
    },
    packages: [marketFile('mcp-github.json')]
  },
  {
    id: 'app-009',
    name: 'Web Search Skill',
    org: 'AiSphere Skills',
    version: '1.0.0',
    description: 'Agent skill following the SKILL.md convention: teaches agents to plan web searches and merge results before answering.',
    category: 'Skills',
    type: 'tool',
    kind: 'skill',
    runtime: { runtime: 'native' },
    labels: ['skill', 'research', 'web'],
    requirements: { ...appRequirements },
    component: {
      skill: {
        instructions: 'Before answering factual questions, outline the search queries required, request the Fetch MCP tools, and merge the results into the answer with source links.'
      }
    },
    packages: [marketFile('skill-web-search.json')]
  },
  {
    id: 'app-010',
    name: 'Deep Researcher Agent',
    org: 'AiSphere Agents',
    version: '1.0.0',
    description: 'Market agent that decomposes a question, gathers evidence with GitHub tools and the Web Search skill, then writes a cited report.',
    category: 'Agents',
    type: 'agent',
    kind: 'agent',
    runtime: { runtime: 'native' },
    labels: ['agent', 'research', 'citation'],
    requirements: { ...appRequirements },
    component: {
      agent: {
        emoji: '🌐',
        instructions: 'You are a deep research agent. Break the question into sub-questions, use web fetch and GitHub tools to gather evidence, then synthesize a cited report in Markdown.',
        skillIds: ['mkt-app-009'],
        toolIds: ['mkt-app-008:mkt-app-008-tool-1', 'mkt-app-008:mkt-app-008-tool-3']
      }
    },
    packages: [marketFile('agent-deep-research.json')]
  },
  {
    id: 'app-011',
    name: 'Chat Hooks Pack',
    org: 'AiSphere Automation',
    version: '1.0.0',
    description: 'Lifecycle hooks (Claude Code hooks convention) attached to the workspace: message-send, assistant-reply and tool-call events.',
    category: 'Hooks',
    type: 'tool',
    kind: 'hook',
    runtime: { runtime: 'native' },
    labels: ['hooks', 'automation'],
    requirements: { ...appRequirements },
    component: {
      hooks: [
        { event: 'message-send', name: 'Context Guard', description: 'Sanitizes the outgoing message before it reaches the model.' },
        { event: 'assistant-reply', name: 'Follow-up Suggester', description: 'Generates suggested follow-up questions after each reply.' },
        { event: 'tool-call', name: 'Tool Audit Log', description: 'Writes every tool invocation to the local audit log.' }
      ]
    },
    packages: [marketFile('hooks-pack.json')]
  },
  {
    id: 'app-012',
    name: 'Engineering Instructions',
    org: 'AiSphere Instructions',
    version: '1.0.0',
    description: 'AGENTS.md-style global instruction pack applied to every workspace chat: local-first, cite sources, no silent remote calls.',
    category: 'Instructions',
    type: 'other',
    kind: 'instructions',
    runtime: { runtime: 'native' },
    labels: ['agents.md', 'instructions', 'policy'],
    requirements: { ...appRequirements },
    component: {
      instructions: {
        content: '- Prefer local, privacy-preserving execution.\n- Keep answers concise and cite sources when tools are used.\n- Never send user content to remote services without confirmation.'
      }
    },
    packages: [marketFile('instructions-engineering.json')]
  },
  {
    id: 'app-013',
    name: 'Workspace Tools Pack',
    org: 'AiSphere Tools',
    version: '1.0.0',
    description: 'Local tool pack that appears directly in the workspace tools menu: note search, outline builder and Markdown export.',
    category: 'Tools',
    type: 'tool',
    kind: 'tool',
    runtime: { runtime: 'native' },
    labels: ['tools', 'local', 'productivity'],
    requirements: { ...appRequirements },
    component: {
      server: {
        transport: 'local',
        tools: [
          { name: 'note_search', description: 'Search saved notes in the current workspace' },
          { name: 'outline_builder', description: 'Build a Markdown outline from a set of notes' },
          { name: 'export_md', description: 'Export chat or notes to a Markdown file' }
        ]
      }
    },
    packages: [marketFile('tools-pack.json')]
  },
  {
    id: 'app-014',
    name: 'File Browser NAS',
    org: 'File Browser',
    url: 'https://github.com/filebrowser/filebrowser',
    version: 'latest',
    description: 'Run a browser-based file manager on your local network. Upload, download, and organize files stored in AiSphere app data.',
    category: 'File Sharing',
    type: 'other',
    kind: 'app',
    runtime: fileBrowserNasSpec.runtime,
    postInstallActions: fileBrowserNasSpec.lifecycle?.postInstall,
    postStopActions: fileBrowserNasSpec.lifecycle?.postStop,
    postUnInstallActions: fileBrowserNasSpec.lifecycle?.postUninstall,
    labels: fileBrowserNasSpec.labels,
    requirements: {
      platform: 'any',
      cpu: 'Any',
      memory: 'Minimal',
      storage: 'User files',
      gpu: 'Not required',
    },
    packages: [marketFile('filebrowser-nas.json')],
  }
];