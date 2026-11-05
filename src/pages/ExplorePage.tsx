import { useEffect, useMemo } from 'react';
import { Download, AppWindow, Search, X, RefreshCw } from 'lucide-react';
import { useExploreStore } from '../stores/exploreStore';
import { useAiSphereStore } from '../stores/aiSphereStore';
import { useTranslation } from '@/i18n';

export default function ExplorePage() {
  const { t } = useTranslation();
  const setView = useAiSphereStore(s => s.setView);

  const {
    applications,
    loading,
    installingId,
    search,
    selectedCategory,
    selectedType,
    selectedPlatform,
    selectedRuntime,
    loadApplications,
    setSearch,
    setCategory,
    setType,
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
  const types = ['All', 'llm', 'tool', 'agent', 'dataset', 'other'];
  const platforms = ['All', 'windows', 'linux', 'mac', 'any'];
  const runtimes = ['All', 'apptainer', 'docker', 'podman', 'conda', 'native'];

  const filteredApplications = useMemo(() => {
    return applications.filter(app => {
      const matchesSearch = !search || 
        app.name.toLowerCase().includes(search.toLowerCase()) || 
        app.description.toLowerCase().includes(search.toLowerCase()) ||
        app.labels.some(l => l.toLowerCase().includes(search.toLowerCase()));
      
      const matchesCategory = selectedCategory === 'All' || app.category === selectedCategory;
      const matchesType = selectedType === 'All' || app.type === selectedType;
      const matchesPlatform = selectedPlatform === 'All' || 
        app.requirements.platform === selectedPlatform || 
        app.requirements.platform === 'any';
      const matchesRuntime = selectedRuntime === 'All' || app.runtime?.runtime === selectedRuntime;

      return matchesSearch && matchesCategory && matchesType && matchesPlatform && matchesRuntime;
    });
  }, [applications, search, selectedCategory, selectedType, selectedPlatform, selectedRuntime]);

  const hasActiveFilters = search !== '' || selectedCategory !== 'All' || selectedType !== 'All' || selectedPlatform !== 'All' || selectedRuntime !== 'All';

  return (
    <div className="p-6 flex flex-col h-full overflow-hidden">
      <div className="flex justify-between items-center mb-4 shrink-0">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <AppWindow className="w-6 h-6" /> {t('explore.title')}
        </h2>
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
          value={selectedType}
          onChange={(e) => setType(e.target.value)}
          className="px-3 py-2 bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-lg text-sm focus:outline-none focus:border-blue-500"
        >
          {types.map(ty => <option key={ty} value={ty}>{ty === 'All' ? t('explore.filter.all_types') : t(`explore.types.${ty}`)}</option>)}
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
            <div className="flex items-start gap-3 mb-4">
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
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-lg truncate">{app.name}</h3>
                  {app.install?.installed && (
                    <div className="relative group/status">
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
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                  {app.category}
                </span>
              </div>
            </div>
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
    </div>
  );
}