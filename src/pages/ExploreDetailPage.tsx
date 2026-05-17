import { useExploreStore } from '../stores/exploreStore';
import { useAiSphereStore } from '../stores/aiSphereStore';
import { ArrowLeft, Download, AppWindow, Calendar, Shield, Cpu, Layout, Tag, Folder, Info, Globe, RefreshCw } from 'lucide-react';
import { useTranslation } from '@/i18n';

export default function ExploreDetailPage() {
  const { t } = useTranslation();
  const { applications, selectedAppId, installApplication, installingId } = useExploreStore();
  const setView = useAiSphereStore(s => s.setView);

  const app = applications.find(a => a.id === selectedAppId);

  if (!app) {
    return (
      <div className="p-6">
        <button onClick={() => setView('explore')} className="flex items-center gap-2 text-blue-600 mb-4 hover:underline">
          <ArrowLeft className="w-4 h-4" /> Back to Explore
        </button>
        <div className="bg-light-surface dark:bg-dark-surface rounded-xl p-8 border border-light-border dark:border-dark-border text-center">
          <p className="text-light-subtle dark:text-dark-subtle">Application not found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto h-full overflow-y-auto">
      <button onClick={() => setView('explore')} className="flex items-center gap-2 text-light-subtle dark:text-dark-subtle mb-6 hover:text-light-text dark:hover:text-dark-text transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Explore
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-8">
          <div className="flex items-start gap-6">
            {app.icon ? (
              <img src={app.icon} alt="" className="w-24 h-24 rounded-2xl object-contain bg-white shadow-sm border border-light-border dark:border-dark-border p-2" />
            ) : (
              <div className="w-24 h-24 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600">
                <AppWindow className="w-12 h-12" />
              </div>
            )}
            <div className="flex-1 pt-2">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-3xl font-bold">{app.name}</h2>
                <span className="text-xs px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-bold uppercase">
                  {app.category}
                </span>
              </div>
              <p className="text-light-subtle dark:text-dark-subtle">{app.description}</p>
            </div>
          </div>

          <section className="bg-light-surface dark:bg-dark-surface rounded-xl p-6 border border-light-border dark:border-dark-border shadow-sm">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Layout className="w-5 h-5 text-blue-500" /> About</h3>
            <div className="text-sm text-light-subtle dark:text-dark-subtle leading-relaxed whitespace-pre-wrap space-y-4">
              <p><strong>{t('explore.label.type')}:</strong> {t(`explore.types.${app.type}`)}</p>
              <p><strong>{t('explore.label.version')}:</strong> {app.version}</p>
              <p><strong>{t('explore.label.url')}:</strong> <a href={app.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{app.url}</a></p>
            </div>
          </section>

          <section className="bg-light-surface dark:bg-dark-surface rounded-xl p-6 border border-light-border dark:border-dark-border shadow-sm">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Shield className="w-5 h-5 text-green-500" /> Specifications</h3>
            <div className="grid grid-cols-2 gap-6 text-sm">
              <div>
                <p className="text-xs font-bold text-light-subtle dark:text-dark-subtle uppercase mb-1">Architecture</p>
                <p>{app.requirements.cpu}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-light-subtle dark:text-dark-subtle uppercase mb-1">Platform</p>
                <p className="capitalize">{app.requirements.platform}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-light-subtle dark:text-dark-subtle uppercase mb-1">Runtime</p>
                <p className="capitalize">{app.runtime.runtime}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-light-subtle dark:text-dark-subtle uppercase mb-1">Storage</p>
                <p>{app.requirements.storage}</p>
              </div>
            </div>
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <button
            onClick={() => installApplication(app)}
            disabled={!!app.install?.installed || installingId === app.id}
            className={`w-full py-4 rounded-xl flex items-center justify-center gap-2 font-bold transition-all shadow-lg ${
              app.install?.installed 
                ? 'bg-green-600/20 text-green-600 dark:text-green-400 cursor-default' 
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20'
            }`}
          >
            {installingId === app.id ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
            {app.install?.installed ? t('explore.status.installed') : t('explore.action.install')}
          </button>

          <section className="bg-light-surface dark:bg-dark-surface rounded-xl p-6 border border-light-border dark:border-dark-border shadow-sm">
            <h3 className="text-sm font-bold flex items-center gap-2 mb-4 uppercase tracking-wider text-light-subtle dark:text-dark-subtle">
              <Cpu className="w-4 h-4" /> Requirements
            </h3>
            <div className="space-y-4">
              <div>
                <p className="text-[10px] font-bold uppercase text-light-subtle dark:text-dark-subtle">Memory</p>
                <p className="text-sm font-medium">{app.requirements.memory}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-light-subtle dark:text-dark-subtle">Graphics</p>
                <p className="text-sm font-medium">{app.requirements.gpu}</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}