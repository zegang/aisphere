// MCP servers tab: list of Model Context Protocol servers with enable
// toggles, transport badges, status dots, per-tool availability and an
// add-server dialog. Layout follows VS Code's MCP settings page.

import { useState } from 'react';
import { Plus, Trash2, ChevronDown, Server, Link2, Terminal, X } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { McpServer, McpTransport } from '@/types/workspace';

const statusTone = (status: string) => {
  switch (status) {
    case 'running':
      return { dot: 'bg-green-500', text: 'text-green-600 dark:text-green-400', tone: 'border-green-500/40' };
    case 'connecting':
      return { dot: 'bg-blue-500', text: 'text-blue-600 dark:text-blue-400', tone: 'border-blue-500/40' };
    case 'error':
      return { dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400', tone: 'border-red-500/40' };
    default:
      return { dot: 'bg-gray-400 dark:bg-dark-text/60', text: 'text-light-subtle dark:text-dark-subtle', tone: 'border-light-border dark:border-dark-border' };
  }
};

export function McpPanel() {
  const { t } = useTranslation();
  const servers = useWorkspaceStore((s) => s.servers);
  const setServerEnabled = useWorkspaceStore((s) => s.setServerEnabled);
  const setToolEnabled = useWorkspaceStore((s) => s.setToolEnabled);
  const removeServer = useWorkspaceStore((s) => s.removeServer);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="flex flex-col h-full relative">
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <p className="text-xs text-light-subtle dark:text-dark-subtle">
          {t('workspace.mcp.count', { count: servers.length })}
        </p>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> {t('workspace.mcp.new')}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-2">
        {servers.map((server) => {
          const tone = statusTone(server.status);
          const open = expanded === server.id;
          const enabledTools = server.tools.filter((tool) => tool.enabled).length;
          return (
            <div
              key={server.id}
              className={`rounded-xl border bg-light-bg dark:bg-dark-bg transition-colors ${tone.tone}`}
            >
              <div className="p-3 flex items-start gap-2.5">
                <span className="w-8 h-8 shrink-0 rounded-lg bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border flex items-center justify-center relative">
                  <Server className="w-4 h-4 text-light-subtle dark:text-dark-subtle" />
                  <span className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-light-surface dark:ring-dark-surface ${tone.dot}`} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-sm font-semibold truncate">{server.name}</h4>
                    <span className="shrink-0 px-1.5 py-px text-[9px] font-semibold uppercase rounded-full bg-light-muted dark:bg-dark-muted text-light-subtle dark:text-dark-subtle">
                      {server.transport}
                    </span>
                  </div>
                  <p className="text-[11px] text-light-subtle dark:text-dark-subtle line-clamp-2 mt-0.5">
                    {server.description}
                  </p>
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : server.id)}
                    className="mt-1 inline-flex items-center gap-1 text-[10px] text-light-subtle dark:text-dark-subtle hover:text-blue-600 transition-colors"
                  >
                    <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
                    {t('workspace.mcp.tools_count', { count: enabledTools, total: server.tools.length })}
                  </button>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    title={t('workspace.mcp.status.' + server.status)}
                    className={`text-[9px] font-semibold uppercase rounded-full px-2 py-0.5 border ${tone.text} ${tone.tone}`}
                  >
                    {t(`workspace.mcp.status.${server.status}`)}
                  </button>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={server.enabled}
                    aria-label={t('workspace.mcp.toggle', { name: server.name })}
                    onClick={() => {
                      const next = !server.enabled;
                      useWorkspaceStore.setState((state) => ({
                        servers: state.servers.map((s) =>
                          s.id === server.id ? { ...s, enabled: next } : s,
                        ),
                      }));
                      setServerEnabled(server.id, next);
                    }}
                    className={`relative w-9 h-5 rounded-full transition-colors ${server.enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-dark-muted'}`}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${server.enabled ? 'left-5' : 'left-0.5'}`}
                    />
                  </button>
                  <button
                    type="button"
                    title={t('workspace.mcp.delete')}
                    onClick={() => {
                      if (confirm(t('workspace.mcp.delete_confirm', { name: server.name }))) {
                        removeServer(server.id);
                      }
                    }}
                    className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {open && (
                <div className="px-3 pb-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] text-light-subtle dark:text-dark-subtle px-1 py-1 truncate">
                    {server.transport === 'stdio' ? (
                      <Terminal className="w-3 h-3 shrink-0" />
                    ) : (
                      <Link2 className="w-3 h-3 shrink-0" />
                    )}
                    <span className="truncate">
                      {server.transport === 'stdio'
                        ? [server.command, ...(server.args ?? [])].join(' ')
                        : server.url}
                    </span>
                  </div>
                  <div className="border-t border-light-border dark:border-dark-border pt-1.5">
                    {server.tools.map((tool) => (
                      <label
                        key={tool.id}
                        className="flex items-center gap-2 text-xs rounded-lg px-2 py-1 cursor-pointer hover:bg-light-muted dark:hover:bg-dark-muted transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={tool.enabled}
                          onChange={(e) => setToolEnabled(server.id, tool.id, e.target.checked)}
                          className="accent-blue-600"
                        />
                        <span className="font-medium shrink-0">{tool.name}</span>
                        <span className="text-[10px] text-light-subtle dark:text-dark-subtle truncate">{tool.description}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showForm && <AddServerDialog onClose={() => setShowForm(false)} />}
    </div>
  );
}

function AddServerDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const addServer = useWorkspaceStore((s) => s.addServer);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [transport, setTransport] = useState<McpTransport>('stdio');
  const [command, setCommand] = useState('npx');
  const [args, setArgs] = useState('');
  const [url, setUrl] = useState('');
  const [enabled, setEnabled] = useState(true);

  const submit = () => {
    if (!name.trim() || (transport === 'stdio' && !command.trim()) || (transport !== 'stdio' && !url.trim())) return;
    const payload: Omit<McpServer, 'id' | 'status' | 'tools'> = {
      name: name.trim(),
      description: description.trim() || t('workspace.mcp.no_description'),
      transport,
      enabled,
      autoStart: enabled,
      ...(transport === 'stdio'
        ? { command: command.trim(), args: args.split(/\s+/).filter(Boolean) }
        : { url: url.trim() }),
    };
    addServer(payload);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-light-border dark:border-dark-border">
          <h3 className="font-bold">{t('workspace.mcp.new_title')}</h3>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-light-muted dark:hover:bg-dark-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('workspace.mcp.field_name')}
            className="w-full bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('workspace.mcp.field_description')}
            className="w-full bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-lg px-3 py-2 text-xs outline-none focus:border-blue-500"
          />
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-light-subtle dark:text-dark-subtle mb-1">
              {t('workspace.mcp.field_transport')}
            </label>
            <select
              value={transport}
              onChange={(e) => setTransport(e.target.value as McpTransport)}
              className="w-full bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-lg px-2 py-1.5 text-xs outline-none focus:border-blue-500"
            >
              <option value="stdio">stdio</option>
              <option value="http">http</option>
              <option value="sse">sse</option>
            </select>
          </div>
          {transport === 'stdio' ? (
            <>
              <input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder={t('workspace.mcp.field_command')}
                className="w-full bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-lg px-3 py-2 text-xs outline-none focus:border-blue-500"
              />
              <input
                value={args}
                onChange={(e) => setArgs(e.target.value)}
                placeholder={t('workspace.mcp.field_args')}
                className="w-full bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-lg px-3 py-2 text-xs outline-none focus:border-blue-500"
              />
            </>
          ) : (
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/mcp"
              className="w-full bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-lg px-3 py-2 text-xs outline-none focus:border-blue-500"
            />
          )}
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="accent-blue-600" />
            {t('workspace.mcp.enable_now')}
          </label>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-light-border dark:border-dark-border">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-light-border dark:border-dark-border hover:bg-light-muted dark:hover:bg-dark-muted transition-colors">
            {t('workspace.mcp.cancel')}
          </button>
          <button
            type="button"
            onClick={submit}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            {t('workspace.mcp.create')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default McpPanel;
