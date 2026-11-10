import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';
import type { EngineMcpServer } from '../../src/shared/channel-types';

interface ToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

interface ToolBinding {
  server: EngineMcpServer;
  name: string;
  functionName: string;
  description: string;
  inputSchema: Record<string, unknown>;
  client?: Client;
  directory?: string;
}

interface ConnectedClient {
  client: Client;
}

const imageTools: ToolDefinition[] = [
  {
    name: 'list_files',
    description: 'List entries in a folder under the selected workspace directory.',
    inputSchema: {
      type: 'object',
      properties: { directory: { type: 'string', description: 'Relative folder path; defaults to the selected root.' } },
      additionalProperties: false,
    },
  },
  {
    name: 'read_file',
    description: 'Read a UTF-8 text file under the selected workspace directory.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Relative file path.' } },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'write_file',
    description: 'Create a new UTF-8 text file under the selected workspace directory without overwriting existing files.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'New relative file path.' },
        content: { type: 'string', description: 'UTF-8 text content, up to 1 MB.' },
      },
      required: ['path', 'content'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_directory',
    description: 'List entries in a folder under the selected workspace directory.',
    inputSchema: {
      type: 'object',
      properties: { directory: { type: 'string', description: 'Relative folder path; defaults to the selected root.' } },
      additionalProperties: false,
    },
  },
  {
    name: 'search_files',
    description: 'Find files by matching a case-insensitive substring in their names.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, directory: { type: 'string' } },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'rename_file',
    description: 'Rename or move a file to another relative path within the selected workspace directory.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Existing relative file path.' },
        destination: { type: 'string', description: 'New relative file path; it must not already exist.' },
      },
      required: ['source', 'destination'],
      additionalProperties: false,
    },
  },
  {
    name: 'inspect_image',
    description: 'Read image dimensions, format, color space and metadata.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Relative image file path.' } },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'resize_image',
    description: 'Resize an image and save it to a new relative file path.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative source image path.' },
        output: { type: 'string', description: 'Relative output image path.' },
        width: { type: 'integer', minimum: 1, maximum: 8192 },
        height: { type: 'integer', minimum: 1, maximum: 8192 },
      },
      required: ['path', 'output'],
      additionalProperties: false,
    },
  },
  {
    name: 'convert_image',
    description: 'Convert an image to JPEG, PNG, WebP or AVIF at a new relative path.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative source image path.' },
        output: { type: 'string', description: 'Relative output image path.' },
        format: { type: 'string', enum: ['jpeg', 'png', 'webp', 'avif'] },
      },
      required: ['path', 'output', 'format'],
      additionalProperties: false,
    },
  },
  {
    name: 'rotate_image',
    description: 'Rotate an image by 90, 180 or 270 degrees and save it to a new relative path.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative source image path.' },
        output: { type: 'string', description: 'Relative output image path.' },
        angle: { type: 'integer', enum: [90, 180, 270] },
      },
      required: ['path', 'output', 'angle'],
      additionalProperties: false,
    },
  },
  {
    name: 'crop_image',
    description: 'Crop an image using pixel coordinates and save it to a new relative path.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative source image path.' },
        output: { type: 'string', description: 'Relative output image path.' },
        left: { type: 'integer', minimum: 0 },
        top: { type: 'integer', minimum: 0 },
        width: { type: 'integer', minimum: 1, maximum: 8192 },
        height: { type: 'integer', minimum: 1, maximum: 8192 },
      },
      required: ['path', 'output', 'left', 'top', 'width', 'height'],
      additionalProperties: false,
    },
  },
];

const within = (root: string, target: string): boolean => {
  const relative = path.relative(root, target);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
};

const requireString = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`The ${name} argument must be a non-empty string.`);
  }
  return value;
};

const requireInteger = (value: unknown, name: string, min: number, max: number): number => {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    throw new Error(`The ${name} argument must be an integer from ${min} to ${max}.`);
  }
  return Number(value);
};

const resolveLocalPath = async (root: string, relativePath: unknown, allowMissing: boolean): Promise<string> => {
  const input = requireString(relativePath, 'path');
  if (path.isAbsolute(input)) throw new Error('Only paths relative to the selected workspace directory are allowed.');

  const resolved = path.resolve(root, input);
  if (!within(root, resolved)) throw new Error('The requested path is outside the selected workspace directory.');

  try {
    const realPath = await fs.realpath(resolved);
    if (!within(root, realPath)) throw new Error('The requested path resolves outside the selected workspace directory.');
    return realPath;
  } catch (error) {
    if (!allowMissing || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const parent = await fs.realpath(path.dirname(resolved));
    if (!within(root, parent)) throw new Error('The requested path resolves outside the selected workspace directory.');
    return path.join(parent, path.basename(resolved));
  }
};

const requireNewOutput = async (root: string, value: unknown): Promise<string> => {
  const resolved = await resolveLocalPath(root, value, true);
  try {
    await fs.access(resolved);
    throw new Error('The output file already exists; choose a different path.');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return resolved;
};

const parseArguments = (input: unknown): Record<string, unknown> => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Tool arguments must be a JSON object.');
  }
  return input as Record<string, unknown>;
};

const localToolResult = (text: string) => ({ content: [{ type: 'text' as const, text }] });
const openImage = (image: string) => sharp(image, { limitInputPixels: 40_000_000 });

const withTimeout = async <T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

async function callLocalTool(directory: string, name: string, input: unknown): Promise<unknown> {
  const args = parseArguments(input);
  const root = await fs.realpath(directory);
  const base = (value: unknown, label: string) =>
    resolveLocalPath(root, value, false).then(async (resolved) => {
      const stat = await fs.stat(resolved);
      if (stat.size > 100 * 1024 * 1024) throw new Error(`${label} exceeds the 100 MB size limit.`);
      return resolved;
    });
  const output = (value: unknown) => resolveLocalPath(root, value, true);

  switch (name) {
    case 'list_files':
    case 'list_directory': {
      const folder = args.directory === undefined ? root : await base(args.directory, 'Directory');
      const handle = await fs.opendir(folder);
      const entries = [];
      for await (const entry of handle) {
        entries.push(entry);
        if (entries.length > 1000) break;
      }
      return localToolResult(JSON.stringify({
        entries: entries.slice(0, 1000).map((entry) => ({
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
        })),
        truncated: entries.length > 1000,
      }));
    }
    case 'read_file': {
      const file = await base(args.path, 'File');
      const stat = await fs.stat(file);
      if (!stat.isFile()) throw new Error('The requested path is not a regular file.');
      if (stat.size > 1024 * 1024) throw new Error('Text files larger than 1 MB are not returned to the model.');
      return localToolResult(await fs.readFile(file, 'utf8'));
    }
    case 'write_file': {
      const destination = await requireNewOutput(root, args.path);
      if (typeof args.content !== 'string') throw new Error('The content argument must be a string.');
      if (Buffer.byteLength(args.content, 'utf8') > 1024 * 1024) throw new Error('Text files are limited to 1 MB.');
      await fs.writeFile(destination, args.content, { encoding: 'utf8', flag: 'wx' });
      return localToolResult(JSON.stringify({ created: path.relative(root, destination) }));
    }
    case 'search_files': {
      const query = requireString(args.query, 'query').toLocaleLowerCase();
      const start = args.directory === undefined ? root : await base(args.directory, 'Directory');
      const matches: string[] = [];
      let visited = 0;
      let truncated = false;
      const visit = async (folder: string, depth: number): Promise<void> => {
        if (matches.length >= 500 || visited >= 10_000 || depth >= 64) {
          truncated = true;
          return;
        }
        const entries = await fs.readdir(folder, { withFileTypes: true });
        for (const entry of entries) {
          visited += 1;
          const item = path.join(folder, entry.name);
          if (entry.isSymbolicLink()) continue;
          if (entry.name.toLocaleLowerCase().includes(query)) matches.push(path.relative(root, item));
          if (entry.isDirectory()) await visit(item, depth + 1);
          if (matches.length >= 500 || visited >= 10_000) return;
        }
      };
      await visit(start, 0);
      return localToolResult(JSON.stringify({ matches, truncated: truncated || matches.length >= 500 || visited >= 10_000 }));
    }
    case 'rename_file': {
      const source = await base(args.source, 'Source file');
      if (!(await fs.stat(source)).isFile()) throw new Error('Only regular files can be renamed.');
      const destination = await output(args.destination);
      if (source === destination) throw new Error('The source and destination must be different paths.');
      try {
        await fs.access(destination);
        throw new Error('The destination already exists; choose a different path.');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      await fs.rename(source, destination);
      return localToolResult(JSON.stringify({ renamed: path.relative(root, source), to: path.relative(root, destination) }));
    }
    case 'inspect_image': {
      const image = await base(args.path, 'Image');
      const metadata = await openImage(image).metadata();
      return localToolResult(JSON.stringify({
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        space: metadata.space,
        hasAlpha: metadata.hasAlpha,
        orientation: metadata.orientation,
      }));
    }
    case 'resize_image': {
      const image = await base(args.path, 'Image');
      const destination = await requireNewOutput(root, args.output);
      if (image === destination) throw new Error('Choose a different output path so the original image is preserved.');
      const width = args.width === undefined ? undefined : requireInteger(args.width, 'width', 1, 8192);
      const height = args.height === undefined ? undefined : requireInteger(args.height, 'height', 1, 8192);
      if (width === undefined && height === undefined) throw new Error('Provide at least one of width or height.');
      const info = await openImage(image).resize({ width, height, fit: 'inside' }).toFile(destination);
      return localToolResult(JSON.stringify({ output: path.relative(root, destination), width: info.width, height: info.height }));
    }
    case 'convert_image': {
      const image = await base(args.path, 'Image');
      const destination = await requireNewOutput(root, args.output);
      if (image === destination) throw new Error('Choose a different output path so the original image is preserved.');
      const format = requireString(args.format, 'format');
      if (!['jpeg', 'png', 'webp', 'avif'].includes(format)) throw new Error('Supported image formats are jpeg, png, webp and avif.');
      await openImage(image).toFormat(format as 'jpeg' | 'png' | 'webp' | 'avif').toFile(destination);
      return localToolResult(JSON.stringify({ output: path.relative(root, destination), format }));
    }
    case 'rotate_image': {
      const image = await base(args.path, 'Image');
      const destination = await requireNewOutput(root, args.output);
      if (image === destination) throw new Error('Choose a different output path so the original image is preserved.');
      const angle = requireInteger(args.angle, 'angle', 90, 270);
      if (![90, 180, 270].includes(angle)) throw new Error('Angle must be 90, 180 or 270 degrees.');
      const info = await openImage(image).rotate(angle).toFile(destination);
      return localToolResult(JSON.stringify({ output: path.relative(root, destination), width: info.width, height: info.height }));
    }
    case 'crop_image': {
      const image = await base(args.path, 'Image');
      const destination = await requireNewOutput(root, args.output);
      if (image === destination) throw new Error('Choose a different output path so the original image is preserved.');
      const left = requireInteger(args.left, 'left', 0, 8192);
      const top = requireInteger(args.top, 'top', 0, 8192);
      const width = requireInteger(args.width, 'width', 1, 8192);
      const height = requireInteger(args.height, 'height', 1, 8192);
      const metadata = await openImage(image).metadata();
      if (metadata.width === undefined || metadata.height === undefined || left + width > metadata.width || top + height > metadata.height) {
        throw new Error('The crop rectangle must fit within the image dimensions.');
      }
      const info = await openImage(image).extract({ left, top, width, height }).toFile(destination);
      return localToolResult(JSON.stringify({ output: path.relative(root, destination), width: info.width, height: info.height }));
    }
    default:
      throw new Error(`Unsupported local MCP tool: ${name}`);
  }
}

const functionName = (serverId: string, toolName: string, index: number): string => {
  const suffix = `_${index}`;
  const limit = 64 - 'mcp_'.length - suffix.length;
  return `mcp_${`${serverId}_${toolName}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, limit)}${suffix}`;
};

export class McpToolBridge {
  private readonly clients: ConnectedClient[] = [];
  private readonly bindings = new Map<string, ToolBinding>();
  private readonly discoveredTools: Array<{ serverId: string; name: string; description: string }> = [];

  async connect(
    servers: EngineMcpServer[],
    workspaceDirectories: Record<string, string>,
    selectedToolIds?: string[],
  ): Promise<void> {
    try {
      for (const server of servers) {
        if (!server.enabled) continue;

        let client: Client | undefined;
        let definitions: ToolDefinition[];
        let directory: string | undefined;
        if (server.transport === 'local' && server.provider === 'filesystem-image') {
          directory = workspaceDirectories[server.id];
          if (!directory) throw new Error(`Choose a folder for ${server.name} in this workspace before using its tools.`);
          const realDirectory = await fs.realpath(directory);
          if (!(await fs.stat(realDirectory)).isDirectory()) {
            throw new Error(`The selected folder for ${server.name} is not a directory.`);
          }
          directory = realDirectory;
          definitions = imageTools;
        } else {
          client = await this.connectClient(server);
          const result = await withTimeout(
            client.listTools(),
            60_000,
            `MCP server ${server.name} did not list its tools within 60 seconds.`,
          );
          definitions = result.tools as ToolDefinition[];
        }

        for (const definition of definitions) {
          this.discoveredTools.push({
            serverId: server.id,
            name: definition.name,
            description: definition.description ?? `${definition.name} tool`,
          });
          const configured = server.tools.find((tool) => tool.name === definition.name);
          if (configured && !configured.enabled) continue;
          if (selectedToolIds?.length && (!configured || !selectedToolIds.includes(`${server.id}:${configured.id}`))) continue;

          const openAiName = functionName(server.id, definition.name, this.bindings.size);
          this.bindings.set(openAiName, {
            server,
            name: definition.name,
            functionName: openAiName,
            description: (definition.description ?? `${definition.name} tool from ${server.name}`).slice(0, 1000),
            inputSchema: definition.inputSchema,
            client,
            directory,
          });
        }
      }
    } catch (error) {
      try {
        await this.close();
      } catch (closeError) {
        throw new AggregateError([error, closeError], 'MCP connection failed and its clients could not all be closed.');
      }
      throw error;
    }
  }

  get tools(): Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }> {
    return [...this.bindings.values()].map((binding) => ({
      type: 'function',
      function: {
        name: binding.functionName,
        description: binding.description,
        parameters: binding.inputSchema,
      },
    }));
  }

  get discovered(): Array<{ serverId: string; name: string; description: string }> {
    return this.discoveredTools;
  }

  async call(name: string, args: unknown): Promise<string> {
    const binding = this.bindings.get(name);
    if (!binding) throw new Error(`The model requested an unavailable MCP tool: ${name}`);
    const parsed = parseArguments(args);
    if (binding.directory) {
      const result = await callLocalTool(binding.directory, binding.name, parsed) as { content?: Array<{ type?: string; text?: string }> };
      return (result.content ?? [])
        .map((item) => item.type === 'text' ? item.text ?? '' : '[Non-text MCP result omitted]')
        .join('\n')
        .slice(0, 20_000);
    }
    if (!binding.client) throw new Error(`No MCP connection exists for ${binding.server.name}.`);
    let result: {
      isError?: boolean;
      content?: Array<{ type?: string; text?: string }>;
    };
    result = await withTimeout(
      binding.client.callTool({ name: binding.name, arguments: parsed }),
      30_000,
      `MCP tool ${binding.name} timed out after 30 seconds.`,
    ) as typeof result;
    const text = (result.content ?? [])
      .map((item) => item.type === 'text' ? item.text ?? '' : '[Non-text MCP result omitted]')
      .join('\n')
      .slice(0, 20_000);
    return result.isError ? `MCP tool reported an error: ${text}` : text;
  }

  async close(): Promise<void> {
    const clients = this.clients.splice(0);
    const results = await Promise.allSettled(clients.map(({ client }) => client.close()));
    const failed = results.find((result) => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
  }

  private async connectClient(server: EngineMcpServer): Promise<Client> {
    const client = new Client({ name: 'aisphere-workspace', version: '0.0.1' });
    try {
      if (server.transport === 'stdio') {
        if (!server.command) throw new Error(`The MCP server ${server.name} has no command configured.`);
        const env = Object.fromEntries(
          Object.entries({ ...process.env, ...(server.env ?? {}) }).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
        );
        await withTimeout(
          client.connect(new StdioClientTransport({ command: server.command, args: server.args ?? [], env })),
          60_000,
          `MCP server ${server.name} did not connect within 60 seconds.`,
        );
      } else if (server.transport === 'http') {
        if (!server.url) throw new Error(`The MCP server ${server.name} has no URL configured.`);
        await withTimeout(
          client.connect(new StreamableHTTPClientTransport(new URL(server.url))),
          60_000,
          `MCP server ${server.name} did not connect within 60 seconds.`,
        );
      } else if (server.transport === 'sse') {
        if (!server.url) throw new Error(`The MCP server ${server.name} has no URL configured.`);
        await withTimeout(
          client.connect(new SSEClientTransport(new URL(server.url))),
          60_000,
          `MCP server ${server.name} did not connect within 60 seconds.`,
        );
      } else {
        throw new Error(`Unsupported MCP transport for ${server.name}.`);
      }
      this.clients.push({ client });
      return client;
    } catch (error) {
      await client.close().catch(() => undefined);
      throw new Error(`Could not connect to MCP server ${server.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
