/**
 * Workspace intelligence types: MCP servers, skills and agents.
 *
 * The design follows VS Code's agent application pattern (a chat surface with
 * a selectable agent, attached MCP tools and reusable skills) and modern AI
 * workstation products like Cursor or LM Studio.
 */

// --- MCP ---
export type McpTransport = 'stdio' | 'http' | 'sse' | 'local';
export type McpStatus = 'connecting' | 'running' | 'stopped' | 'error';

export interface McpTool {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

export interface McpServer {
  id: string;
  name: string;
  description: string;
  transport: McpTransport;
  /** stdio transport */
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  /** http / sse transport */
  url?: string;
  enabled: boolean;
  autoStart: boolean;
  status: McpStatus;
  tools: McpTool[];
  /** Catalog app id this server was installed from (Explore market), if any. */
  appId?: string;
}

// --- Skills ---
export type SkillSource = 'builtin' | 'local' | 'custom';

export interface Skill {
  id: string;
  name: string;
  description: string;
  /** Short instruction the model receives when the skill is active. */
  instructions: string;
  enabled: boolean;
  source: SkillSource;
  /** Catalog app id this skill was installed from (Explore market), if any. */
  appId?: string;
}

// --- Agents ---
export interface Agent {
  id: string;
  name: string;
  emoji: string;
  description: string;
  /** System-prompt style instruction. */
  instructions: string;
  /** Local model id (`app:id:file`) from the detected model list, or null for default. */
  model: string | null;
  skillIds: string[];
  /** Tool ids of the form `${serverId}:${toolId}` coming from MCP servers. */
  toolIds: string[];
  enabled: boolean;
  builtin: boolean;
  /** Catalog app id this agent was installed from (Explore market), if any. */
  appId?: string;
}

// --- Hooks (workspace lifecycle automation, Claude Code hooks style) ---
import type { HookEvent } from '@/types/api';

export interface Hook {
  id: string;
  name: string;
  description: string;
  event: HookEvent;
  enabled: boolean;
  /** Catalog app id this hook was installed from (Explore market), if any. */
  appId?: string;
}

// --- Global instruction packs (AGENTS.md convention) ---
export interface InstructionPack {
  id: string;
  name: string;
  description: string;
  content: string;
  enabled: boolean;
  /** Catalog app id this pack was installed from (Explore market), if any. */
  appId?: string;
}

export const toolKey = (serverId: string, toolId: string) => `${serverId}:${toolId}`;
export const splitToolKey = (key: string): { serverId: string; toolId: string } => {
  const [serverId, ...rest] = key.split(':');
  return { serverId, toolId: rest.join(':') };
};
