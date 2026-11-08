// MCP tab: only the servers attached to the current workspace are listed.
// The Browse dialog exposes every installed/registered server and attaching
// one enables it for the workspace (and starts its simulated connection).

import { useState } from 'react';
import { Plus, ChevronDown, Server, Link2, Terminal, X, Wrench } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { McpServer, McpTransport } from '@/types/workspace';
import ComponentPickerDialog from './ComponentPickerDialog';
import PanelEmptyState from './PanelEmptyState';

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
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const setWorkspaceServer = useWorkspaceStore((s) => s.setWorkspaceServer);
  const setServerEnabled = useWorkspaceStore((s) => s.setServerEnabled);
  const setToolEnabled = useWorkspaceStore((s) => s.setToolEnabled);

  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId);
  const attachedIds = activeWorkspace?.serverIds ?? [];
  const attachedServers = servers.filter((server) => attachedIds.includes(server.id));

  const [expanded, setExpanded] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const attach = (id: string, next: boolean) => {
    setWorkspaceServer(activeWorkspaceId, id, next);
    // Attaching a server means "use it here": enable + connect it so its tools
    // show up in the chat tools menu immediately.
    if (next) {
      const server = servers.find((item) => item.id === id);
      if (server && !server.enabled) setServerEnabled(id, true);
    }
  };

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <p className="text-xs text-light-subtle dark:text-dark-subtle">
          {t('workspace.panels.attached_count', { count: attachedServers.length })}
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowForm(true)}
            title={t('workspace.mcp.new')}
            aria-label={t('workspace.mcp.new')}
            className="rounded-lg border border-light-border p-1.5 text-light-subtle transition-colors hover:bg-light-muted hover:text-light-text dark:border-dark-border dark:text-dark-subtle dark:hover:bg-dark-muted dark:hover:text-dark-text"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
          >
            <Wrench className="h-3.5 w-3.5" /> {t('workspace.panels.browse')}
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-4">
        {attachedServers.length === 0 ? (
          <PanelEmptyState
            icon={<Server className="h-5 w-5 text-blue-600" />}
            title={t('workspace.mcp.empty_title')}
            hint={t('workspace.mcp.empty_hint')}
            actionLabel={t('workspace.mcp.browse')}
            onAction={() => setPickerOpen(true)}
          />
        ) : (
          attachedServers.map((server) => {
            const tone = statusTone(server.status);
            const open = expanded === server.id;
            const enabledTools = server.tools.filter((tool) => tool.enabled).length;
            return (
              <div
                key={server.id}
                className={`rounded-xl border bg-light-bg transition-colors dark:bg-dark-bg ${tone.tone}`}
              >
                <div className="p-3">
                  <div className="flex items-start gap-2.5">
                    <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-light-border bg-light-surface dark:border-dark-border dark:bg-dark-surface">
                      <Server className="h-4 w-4 text-light-subtle dark:text-dark-subtle" />
                      <span className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-light-surface dark:ring-dark-surface ${tone.dot}`} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h4 className="truncate text-sm font-semibold">{server.name}</h4>
                        <span className="shrink-0 rounded-full bg-light-muted px-1.5 py-px text-[9px] font-semibold uppercase text-light-subtle dark:bg-dark-muted dark:text-dark-subtle">
                          {server.transport}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-light-subtle dark:text-dark-subtle">
                        {server.description}
                      </p>
                    </div>
                    <button
                      type="button"
                      title={t('workspace.panels.detach')}
                      onClick={() => setWorkspaceServer(activeWorkspaceId, server.id, false)}
                      className="shrink-0 rounded-md p-1.5 text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : server.id)}
                      className="inline-flex min-w-0 items-center gap-1 text-[10px] text-light-subtle transition-colors hover:text-blue-600 dark:text-dark-subtle"
                    >
                      <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                      <span className="truncate">
                        {t('workspace.mcp.tools_count', { count: enabledTools, total: server.tools.length })}
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase ${tone.text} ${tone.tone}`}>
                        {t(`workspace.mcp.status.${server.status}`)}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={server.enabled}
                        aria-label={t('workspace.mcp.toggle', { name: server.name })}
                        onClick={() => setServerEnabled(server.id, !server.enabled)}
                        className={`relative h-5 w-9 rounded-full transition-colors ${server.enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-dark-muted'}`}
                      >
                        <span
                          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${server.enabled ? 'left-5' : 'left-0.5'}`}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                {open && (
                  <div className="space-y-1 px-3 pb-3">
                    <div className="flex items-center gap-1.5 truncate px-1 py-1 text-[10px] text-light-subtle dark:text-dark-subtle">
                      {server.transport === 'stdio' ? (
                        <Terminal className="h-3 w-3 shrink-0" />
                      ) : (
                        <Link2 className="h-3 w-3 shrink-0" />
                      )}
                      <span className="truncate">
                        {server.transport === 'stdio'
                          ? [server.command, ...(server.args ?? [])].join(' ')
                          : server.url}
                      </span>
                    </div>
                    <div className="border-t border-light-border pt-1.5 dark:border-dark-border">
                      {server.tools.map((tool) => (
                        <label
                          key={tool.id}
                          className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-xs transition-colors hover:bg-light-muted dark:hover:bg-dark-muted"
                        >
                          <input
                            type="checkbox"
                            checked={tool.enabled}
                            onChange={(event) => setToolEnabled(server.id, tool.id, event.target.checked)}
                            className="accent-blue-600"
                          />
                          <span className="shrink-0 font-medium">{tool.name}</span>
                          <span className="truncate text-[10px] text-light-subtle dark:text-dark-subtle">{tool.description}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {pickerOpen && (
        <ComponentPickerDialog
          kind="mcp"
          selectedIds={attachedIds}
          onToggle={(id) => attach(id, !attachedIds.includes(id))}
          onClose={() => setPickerOpen(false)}
          items={servers.map((server) => {
            const tone = statusTone(server.status);
            return {
              id: server.id,
              title: server.name,
              description: server.description,
              leading: (
                <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-light-border bg-light-surface dark:border-dark-border dark:bg-dark-surface">
                  <Server className="h-4 w-4 text-light-subtle dark:text-dark-subtle" />
                  <span className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-light-surface dark:ring-dark-surface ${tone.dot}`} />
                </span>
              ),
              badge: (
                <span className="shrink-0 rounded-full bg-light-muted px-1.5 py-px text-[9px] font-semibold uppercase text-light-subtle dark:bg-dark-muted dark:text-dark-subtle">
                  {server.transport}
                </span>
              ),
              meta: `${t(`workspace.mcp.status.${server.status}`)} · ${t('workspace.mcp.tools_count', {
                count: server.tools.length,
                total: server.tools.length,
              })}`,
            };
          })}
        />
      )}

      {showForm && <AddServerDialog onClose={() => setShowForm(false)} />}
    </div>
  );
}

function AddServerDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const addServer = useWorkspaceStore((s) => s.addServer);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const setWorkspaceServer = useWorkspaceStore((s) => s.setWorkspaceServer);

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
    const id = addServer(payload);
    setWorkspaceServer(activeWorkspaceId, id, true);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-light-border bg-light-surface shadow-2xl dark:border-dark-border dark:bg-dark-surface"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-light-border px-5 pb-3 pt-4 dark:border-dark-border">
          <h3 className="font-bold">{t('workspace.mcp.new_title')}</h3>
          <button type="button" onClick={onClose} className="rounded p-1 transition-colors hover:bg-light-muted dark:hover:bg-dark-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('workspace.mcp.field_name')}
            className="w-full rounded-lg border border-light-border bg-light-bg px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-dark-border dark:bg-dark-bg"
          />
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t('workspace.mcp.field_description')}
            className="w-full rounded-lg border border-light-border bg-light-bg px-3 py-2 text-xs outline-none focus:border-blue-500 dark:border-dark-border dark:bg-dark-bg"
          />
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-light-subtle dark:text-dark-subtle">
              {t('workspace.mcp.field_transport')}
            </label>
            <select
              value={transport}
              onChange={(event) => setTransport(event.target.value as McpTransport)}
              className="w-full rounded-lg border border-light-border bg-light-bg px-2 py-1.5 text-xs outline-none focus:border-blue-500 dark:border-dark-border dark:bg-dark-bg"
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
                onChange={(event) => setCommand(event.target.value)}
                placeholder={t('workspace.mcp.field_command')}
                className="w-full rounded-lg border border-light-border bg-light-bg px-3 py-2 text-xs outline-none focus:border-blue-500 dark:border-dark-border dark:bg-dark-bg"
              />
              <input
                value={args}
                onChange={(event) => setArgs(event.target.value)}
                placeholder={t('workspace.mcp.field_args')}
                className="w-full rounded-lg border border-light-border bg-light-bg px-3 py-2 text-xs outline-none focus:border-blue-500 dark:border-dark-border dark:bg-dark-bg"
              />
            </>
          ) : (
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/mcp"
              className="w-full rounded-lg border border-light-border bg-light-bg px-3 py-2 text-xs outline-none focus:border-blue-500 dark:border-dark-border dark:bg-dark-bg"
            />
          )}
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="accent-blue-600" />
            {t('workspace.mcp.enable_now')}
          </label>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-light-border px-5 py-4 dark:border-dark-border">
          <button type="button" onClick={onClose} className="rounded-lg border border-light-border px-4 py-2 text-sm transition-colors hover:bg-light-muted dark:border-dark-border dark:hover:bg-dark-muted">
            {t('workspace.mcp.cancel')}
          </button>
          <button
            type="button"
            onClick={submit}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700"
          >
            {t('workspace.mcp.create')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default McpPanel;
