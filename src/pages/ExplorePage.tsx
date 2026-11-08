import { useEffect, useMemo, useState } from 'react';
import { Download, AppWindow, Search, X, RefreshCw, Upload, FileJson, FolderOpen, FileArchive, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { useExploreStore } from '../stores/exploreStore';
import { useAiSphereStore } from '../stores/aiSphereStore';
import { useTranslation } from '@/i18n';
import { EXPLORE_EXPORT, EXPLORE_IMPORT } from '@/shared/channel-types';
import type { ExploreExportResult, ExploreImportResult } from '@/shared/channel-types';

export default function ExplorePage() {
  const { t } = useTranslation();
  const setView = useAiSphereStore(s => s.setView);

  const {
    applications,
    loading,
    installingId,
    search,
    selectedKind,
    selectedCategory,
    selectedPlatform,
    selectedRuntime,
    loadApplications,
    setSearch,
    setKind,
    setCategory,
    setPlatform,
    setRuntime,
    clearFilters,
    installApplication,
    setSelectedAppId,
  } = useExploreStore();

  useEffect(() => {
    loadApplications();
  }, []);

  const categories = useMemo(() => ['All', ...new Set(applications.map(app => app.category))], [applications]);
  const platforms = ['All', 'windows', 'linux', 'mac', 'any'];
  const runtimes = ['All', 'apptainer', 'docker', 'podman', 'conda', 'native'];

  // Kind tabs, in industry component order. Legacy entries without a kind are
  // treated as plain runnable apps.
  const kinds = ['All', 'engine', 'webui', 'agent', 'skill', 'tool', 'instructions', 'mcp', 'hook'] as const;

  const kindOf = (app: (typeof applications)[number]) => app.kind ?? 'app';

  const filteredApplications = useMemo(() => {
    return applications.filter(app => {
      const matchesSearch = !search || 
        app.name.toLowerCase().includes(search.toLowerCase()) || 
        app.description.toLowerCase().includes(search.toLowerCase()) ||
        app.labels.some(l => l.toLowerCase().includes(search.toLowerCase()));
      
      const matchesKind = selectedKind === 'All' || kindOf(app) === selectedKind;
      const matchesCategory = selectedCategory === 'All' || app.category === selectedCategory;
      const matchesPlatform = selectedPlatform === 'All' || 
        app.requirements.platform === selectedPlatform || 
        app.requirements.platform === 'any';
      const matchesRuntime = selectedRuntime === 'All' || app.runtime?.runtime === selectedRuntime;

      return matchesSearch && matchesKind && matchesCategory && matchesPlatform && matchesRuntime;
    });
  }, [applications, search, selectedKind, selectedCategory, selectedPlatform, selectedRuntime]);

  const hasActiveFilters = search !== '' || selectedKind !== 'All' || selectedCategory !== 'All' || selectedPlatform !== 'All' || selectedRuntime !== 'All';

  // ---- Export / import of app specs (app说明) ----
  const [exportOpen, setExportOpen] = useState(false);
  const [exportMode, setExportMode] = useState<'single' | 'folder' | 'zip'>('single');
  const [exportScope, setExportScope] = useState<'all' | 'filtered'>('all');
  const [exportBusy, setExportBusy] = useState(false);
  const [exportResult, setExportResult] = useState<ExploreExportResult | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importBusy, setImportBusy] = useState<'file' | 'folder' | null>(null);
  const [importResult, setImportResult] = useState<ExploreImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const openExportDialog = () => {
    setExportMode('single');
    setExportScope(hasActiveFilters ? 'filtered' : 'all');
    setExportResult(null);
    setExportError(null);
    setExportOpen(true);
  };

  const doExport = async () => {
    setExportBusy(true);
    setExportError(null);
    try {
      const appsToExport = exportScope === 'filtered' ? filteredApplications : applications;
      const result = await window.electron.invoke(EXPLORE_EXPORT, { mode: exportMode, apps: appsToExport });
      if (result.success && result.data) setExportResult(result.data);
      else setExportError(result.error ?? t('explore.export.failed'));
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    } finally {
      setExportBusy(false);
    }
  };

  const openImportDialog = () => {
    setImportResult(null);
    setImportError(null);
    setImportOpen(true);
  };

  const doImport = async (source: 'file' | 'folder') => {
    setImportBusy(source);
    setImportError(null);
    try {
      const result = await window.electron.invoke(EXPLORE_IMPORT, { source });
      if (result.success && result.data) {
        setImportResult(result.data);
        await loadApplications();
      } else {
        setImportError(result.error ?? t('explore.import.failed'));
      }
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
    } finally {
      setImportBusy(null);
    }
  };

  return (
    <div className="p-6 flex flex-col h-full overflow-hidden">
      <div className="flex justify-between items-center mb-4 shrink-0">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <AppWindow className="w-6 h-6" /> {t('explore.title')}
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openExportDialog}
            title={t('explore.export.title')}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-surface hover:border-blue-500/50 hover:text-blue-600 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> {t('explore.export.button')}
          </button>
          <button
            type="button"
            onClick={openImportDialog}
            title={t('explore.import.title')}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-surface hover:border-blue-500/50 hover:text-blue-600 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" /> {t('explore.import.button')}
          </button>
        </div>
      </div>

      {/* Kind filter chips: what the entry provides to the workspace */}
      <div className="flex flex-wrap gap-2 mb-4 shrink-0">
        {kinds.map(kind => (
          <button
            key={kind}
            onClick={() => setKind(kind)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
              selectedKind === kind
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-light-surface dark:bg-dark-surface border-light-border dark:border-dark-border text-light-subtle dark:text-dark-subtle hover:border-blue-500/50 hover:text-blue-600'
            }`}
          >
            {kind === 'All' ? t('explore.kinds.all') : t(`explore.kinds.${kind}`)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 mb-6 shrink-0">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-light-subtle dark:text-dark-subtle" />
          <input
            type="text"
            placeholder={t('explore.filter.search_placeholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-lg text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
        
        <select
          value={selectedCategory}
          onChange={(e) => setCategory(e.target.value)}
          className="px-3 py-2 bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-lg text-sm focus:outline-none focus:border-blue-500"
        >
          {categories.map(c => <option key={c} value={c}>{c === 'All' ? t('explore.filter.all_categories') : c}</option>)}
        </select>

        <select
          value={selectedPlatform}
          onChange={(e) => setPlatform(e.target.value)}
          className="px-3 py-2 bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-lg text-sm focus:outline-none focus:border-blue-500"
        >
          {platforms.map(p => <option key={p} value={p}>{p === 'All' ? t('explore.filter.all_platforms') : t(`explore.platforms.${p}`)}</option>)}
        </select>

        <select
          value={selectedRuntime}
          onChange={(e) => setRuntime(e.target.value)}
          className="px-3 py-2 bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-lg text-sm focus:outline-none focus:border-blue-500"
        >
          {runtimes.map(r => <option key={r} value={r}>{r === 'All' ? t('explore.filter.all_runtimes') : t(`explore.runtimes.${r}`)}</option>)}
        </select>

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="px-3 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg flex items-center gap-1 transition-colors"
          >
            <X className="w-4 h-4" /> {t('explore.filter.clear')}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-light-subtle dark:text-dark-subtle">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p>{t('explore.status.loading')}</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-6">
          {filteredApplications.map((app) => (
          <div 
            key={app.id} 
            onClick={() => {
              setSelectedAppId(app.id);
              setView('exploredetail');
            }}
            className="relative bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-xl p-4 flex flex-col cursor-pointer hover:border-blue-500/50 transition-all group"
          >
            {installingId === app.id && (
              <div className="absolute top-4 right-4">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
              </div>
            )}
            <div className="flex items-start gap-3 mb-2">
              <div className="shrink-0">
                {app.icon ? (
                  <img src={app.icon} alt={app.name} className="w-12 h-12 rounded-lg object-contain bg-white dark:bg-transparent p-1 border border-light-border dark:border-dark-border" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-light-muted dark:bg-dark-muted flex items-center justify-center">
                    <AppWindow className="w-6 h-6 text-light-subtle dark:text-dark-subtle" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                {/* Status/metadata badges own the first row; the name is moved
                    to its own full-width line below, so the chips are never
                    squeezed and the name can use the whole card width. */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {app.install?.installed && (
                    <div className="relative group/status shrink-0">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 font-medium shrink-0 cursor-help">
                        {t('explore.status.installed')}
                      </span>
                      <div className="absolute bottom-full right-0 mb-2 hidden group-hover/status:block w-64 p-3 bg-white dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-lg shadow-xl text-[10px] z-50 text-light-text dark:text-dark-text whitespace-normal animate-in fade-in slide-in-from-bottom-1 duration-200">
                        <div className="space-y-1.5">
                          <p className="flex justify-between gap-4"><strong>{t('explore.label.installed_at')}:</strong> <span className="text-light-subtle dark:text-dark-subtle text-right">{new Date(app.install.installed_at).toLocaleString()}</span></p>
                          <p className="flex justify-between gap-4"><strong>{t('explore.label.installed_by')}:</strong> <span className="text-light-subtle dark:text-dark-subtle">{app.install.installed_by}</span></p>
                          <div className="pt-1 mt-1 border-t border-light-border dark:border-dark-border">
                            <p className="font-semibold mb-0.5">{t('explore.label.installed_path')}:</p>
                            <p className="text-light-subtle dark:text-dark-subtle break-all leading-relaxed">{app.install.installed_package}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 max-w-full truncate">
                    {app.category}
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 shrink-0">
                    {t(`explore.kinds.${kindOf(app)}`)}
                  </span>
                </div>
              </div>
            </div>
            <h3 className="font-semibold text-lg leading-snug truncate mb-3">{app.name}</h3>
            <p className="text-sm text-light-subtle dark:text-dark-subtle mb-3 line-clamp-2">
              {app.description}
            </p>

            <div className="flex flex-wrap gap-1 mb-3">
              {app.labels.map((label, idx) => (
                <span key={idx} className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 border border-blue-100 dark:border-blue-800/30">
                  {label}
                </span>
              ))}
            </div>

            {/* What this entry adds to the workspace once installed */}
            {app.install?.installed && (app.kind === 'mcp' || app.kind === 'tool') && app.component?.server?.tools && (
              <p className="text-[10px] text-green-700 dark:text-green-400 mb-3">
                {t('workspace.mcp.providers_tools', { count: app.component.server.tools.length })}
              </p>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation();
                installApplication(app);
              }}
              disabled={!!app.install?.installed}
              className={`mt-auto w-full px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors ${
                app.install?.installed 
                  ? 'bg-green-600/20 text-green-600 dark:text-green-400 cursor-default font-medium' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              <Download className="w-4 h-4" /> {app.install?.installed ? t('explore.status.installed') : t('explore.action.install')}
            </button>
          </div>
        ))}
          </div>
        )}
      </div>

      {!loading && filteredApplications.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center py-20 text-light-subtle dark:text-dark-subtle">
          <p className="text-lg">{t('explore.message.no_apps')}</p>
        </div>
      )}

      {/* ---- Export dialog ---- */}
      {exportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !exportBusy && setExportOpen(false)}>
          <div
            className="w-full max-w-md rounded-2xl bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-light-border dark:border-dark-border">
              <h3 className="font-bold flex items-center gap-2">
                <Download className="w-4 h-4 text-blue-500" /> {t('explore.export.title')}
              </h3>
              {!exportBusy && (
                <button type="button" onClick={() => setExportOpen(false)} className="p-1 rounded hover:bg-light-muted dark:hover:bg-dark-muted transition-colors">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="px-5 py-4 space-y-4">
              {!exportResult && (
                <>
                  {/* Organization of the exported files */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-light-subtle dark:text-dark-subtle">{t('explore.export.layout')}</p>
                    {([
                      { key: 'single', icon: FileJson, label: t('explore.export.mode_single'), desc: t('explore.export.mode_single_desc') },
                      { key: 'folder', icon: FolderOpen, label: t('explore.export.mode_folder'), desc: t('explore.export.mode_folder_desc') },
                      { key: 'zip', icon: FileArchive, label: t('explore.export.mode_zip'), desc: t('explore.export.mode_zip_desc') },
                    ] as const).map(({ key, icon: Icon, label, desc }) => (
                      <label
                        key={key}
                        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                          exportMode === key
                            ? 'border-blue-500/60 bg-blue-50/60 dark:bg-blue-900/10'
                            : 'border-light-border dark:border-dark-border hover:border-blue-500/40'
                        }`}
                      >
                        <input type="radio" name="export-mode" className="mt-1 accent-blue-600" checked={exportMode === key} onChange={() => setExportMode(key)} />
                        <Icon className="w-4 h-4 mt-0.5 text-light-subtle dark:text-dark-subtle shrink-0" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{label}</span>
                          <span className="block text-[11px] text-light-muted dark:text-dark-muted">{desc}</span>
                        </span>
                      </label>
                    ))}
                  </div>

                  {/* Scope: everything or the current filter result */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-light-subtle dark:text-dark-subtle">{t('explore.export.scope')}</p>
                    <div className="flex gap-2">
                      {(['all', 'filtered'] as const).map((key) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setExportScope(key)}
                          className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                            exportScope === key
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'border-light-border dark:border-dark-border text-light-subtle dark:text-dark-subtle hover:border-blue-500/50'
                          }`}
                        >
                          {key === 'all'
                            ? t('explore.export.scope_all', { count: applications.length })
                            : t('explore.export.scope_filtered', { count: filteredApplications.length })}
                        </button>
                      ))}
                    </div>
                  </div>

                  <p className="text-[11px] text-light-muted dark:text-dark-muted">{t('explore.export.timestamp_note')}</p>
                </>
              )}

              {exportResult && (
                <div className="space-y-3">
                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-green-50 dark:bg-green-900/10 border border-green-200/60 dark:border-green-500/20">
                    <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-green-700 dark:text-green-400">
                        {t('explore.export.done', { count: exportResult.count })}
                      </p>
                      <p className="text-[11px] text-light-muted dark:text-dark-muted break-all mt-0.5">{exportResult.path}</p>
                    </div>
                  </div>
                </div>
              )}

              {exportError && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200/60 dark:border-red-500/20">
                  <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-red-600 dark:text-red-400 break-words">{exportError}</p>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-light-border dark:border-dark-border">
              {exportResult ? (
                <button type="button" onClick={() => setExportOpen(false)} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                  {t('explore.export.close')}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={exportBusy}
                    onClick={() => setExportOpen(false)}
                    className="px-4 py-2 text-sm rounded-lg border border-light-border dark:border-dark-border hover:bg-light-muted dark:hover:bg-dark-muted transition-colors disabled:opacity-50"
                  >
                    {t('explore.export.cancel')}
                  </button>
                  <button
                    type="button"
                    disabled={exportBusy}
                    onClick={doExport}
                    className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {exportBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    {exportBusy ? t('explore.export.exporting') : t('explore.export.confirm')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---- Import dialog ---- */}
      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !importBusy && setImportOpen(false)}>
          <div
            className="w-full max-w-md rounded-2xl bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-light-border dark:border-dark-border">
              <h3 className="font-bold flex items-center gap-2">
                <Upload className="w-4 h-4 text-blue-500" /> {t('explore.import.title')}
              </h3>
              {!importBusy && (
                <button type="button" onClick={() => setImportOpen(false)} className="p-1 rounded hover:bg-light-muted dark:hover:bg-dark-muted transition-colors">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="px-5 py-4 space-y-4">
              {!importResult && (
                <>
                  <p className="text-xs text-light-subtle dark:text-dark-subtle">{t('explore.import.hint')}</p>
                  <div className="space-y-2">
                    {([
                      { key: 'file' as const, icon: FileJson, label: t('explore.import.files'), desc: t('explore.import.files_desc') },
                      { key: 'folder' as const, icon: FolderOpen, label: t('explore.import.folder'), desc: t('explore.import.folder_desc') },
                    ]).map(({ key, icon: Icon, label, desc }) => (
                      <button
                        key={key}
                        type="button"
                        disabled={!!importBusy}
                        onClick={() => doImport(key)}
                        className="w-full flex items-start gap-3 p-3 rounded-xl border border-light-border dark:border-dark-border hover:border-blue-500/50 hover:bg-blue-50/40 dark:hover:bg-blue-900/10 transition-colors text-left disabled:opacity-50"
                      >
                        {importBusy === key ? (
                          <Loader2 className="w-4 h-4 mt-0.5 text-blue-500 animate-spin shrink-0" />
                        ) : (
                          <Icon className="w-4 h-4 mt-0.5 text-light-subtle dark:text-dark-subtle shrink-0" />
                        )}
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{label}</span>
                          <span className="block text-[11px] text-light-muted dark:text-dark-muted">{desc}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {importResult && (
                <div className="space-y-3">
                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-green-50 dark:bg-green-900/10 border border-green-200/60 dark:border-green-500/20">
                    <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-green-700 dark:text-green-400">
                        {t('explore.import.done', { imported: importResult.imported.length, skipped: importResult.skipped.length })}
                      </p>
                      {importResult.imported.length > 0 && (
                        <p className="text-[11px] text-light-muted dark:text-dark-muted mt-0.5">
                          {importResult.imported.map((item) => item.name).join('、')}
                        </p>
                      )}
                      {importResult.skipped.length > 0 && (
                        <p className="text-[11px] text-light-muted dark:text-dark-muted mt-0.5">
                          {t('explore.import.skipped_list', { names: importResult.skipped.map((item) => item.name).join('、') })}
                        </p>
                      )}
                    </div>
                  </div>
                  {importResult.imported.length === 0 && importResult.skipped.length > 0 && (
                    <p className="text-[11px] text-light-muted dark:text-dark-muted">{t('explore.import.nothing_new')}</p>
                  )}
                </div>
              )}

              {importError && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200/60 dark:border-red-500/20">
                  <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-red-600 dark:text-red-400 break-words">{importError}</p>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-light-border dark:border-dark-border">
              <button
                type="button"
                disabled={!!importBusy}
                onClick={() => setImportOpen(false)}
                className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {t('explore.import.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}