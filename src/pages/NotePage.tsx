import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  Plus,
  Mic,
  Send,
  FileText,
  BookOpen,
  Edit3,
  MoreVertical,
  Sparkles,
  ChevronDown,
  Volume2,
  RefreshCw,
  Check,
  Cpu,
} from 'lucide-react';
import { useTranslation } from '@/i18n';
import { useAppStore } from '@/stores/appStore';
import type { Application } from '@/types/api';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface Source {
  id: string;
  name: string;
  type: 'pdf' | 'doc' | 'link';
}

interface LocalModel {
  id: string;
  label: string;
  appName: string;
  path: string;
}

/**
 * Detects usable GGUF models from installed applications. The runtime stores
 * the downloaded model in `install.installed_package`, so no extra scanning
 * service is required.
 */
function detectLocalModels(applications: Application[]): LocalModel[] {
  const seen = new Set<string>();
  const models: LocalModel[] = [];

  for (const app of applications) {
    const installedPackage = app.install?.installed_package;
    if (!installedPackage || !/\.gguf$/i.test(installedPackage)) continue;

    const fileName = installedPackage.split(/[\\/]/).pop() || installedPackage;
    const key = fileName.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    models.push({
      id: `${app.id}:${fileName}`,
      label: fileName.replace(/\.gguf$/i, ''),
      appName: app.name,
      path: installedPackage,
    });
  }

  return models.sort((a, b) => {
    const aDeepSeek = /deepseek/i.test(a.label) ? 1 : 0;
    const bDeepSeek = /deepseek/i.test(b.label) ? 1 : 0;
    return bDeepSeek - aDeepSeek || a.label.localeCompare(b.label);
  });
}

export default function NotesPage() {
  const { t } = useTranslation();
  const applications = useAppStore((state) => state.applications);
  const fetchApplications = useAppStore((state) => state.fetchApplications);
  const isLoading = useAppStore((state) => state.isLoading);

  const [sources] = useState<Source[]>([
    { id: '1', name: 'AI Safety Guidelines.pdf', type: 'pdf' },
    { id: '2', name: 'Project Roadmap.doc', type: 'doc' },
    { id: '3', name: 'https://docs.aisphere.io', type: 'link' },
  ]);

  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', role: 'assistant', content: '', timestamp: new Date() },
  ]);

  const [input, setInput] = useState('');
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  // Once the user picks a model explicitly we stop applying the default. The
  // app list can arrive in stages (installed first, then the rest), so without
  // this the default would stay stuck on whichever model loaded first.
  const userSelectedRef = useRef(false);

  const models = useMemo(() => detectLocalModels(applications), [applications]);
  const selectedModel = models.find((model) => model.id === selectedModelId) ?? null;
  const selectedModelName = selectedModel?.label ?? t('notes.models.none');

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  useEffect(() => {
    setSelectedModelId((current) => {
      if (userSelectedRef.current && current && models.some((model) => model.id === current)) {
        return current;
      }
      return models.find((model) => /deepseek/i.test(model.label))?.id ?? models[0]?.id ?? null;
    });
  }, [models]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');

    // Simulate AI Response
    setTimeout(() => {
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: t('notes.mock_response', { model: selectedModelName }),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    }, 1000);
  };

  const toggleSpeech = () => {
    setIsSpeaking(!isSpeaking);
    // Implementation for STT would go here
  };

  return (
    <div className="flex h-full bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text overflow-hidden">

      {/* Part 1: Sources (Left) */}
      <div className="w-64 border-r border-light-border dark:border-dark-border flex flex-col bg-light-surface dark:bg-dark-surface">
        <div className="p-4 border-b border-light-border dark:border-dark-border flex items-center justify-between">
          <h2 className="font-bold flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-blue-500" /> {t('notes.sources')}
          </h2>
          <button className="p-1 hover:bg-light-muted dark:hover:bg-dark-muted rounded transition-colors">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="p-3">
          <div className="relative mb-4">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-light-muted dark:text-dark-muted" />
            <input
              type="text"
              placeholder={t('notes.search_sources')}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-md outline-none focus:border-blue-500"
            />
          </div>
          <div className="space-y-1 overflow-y-auto">
            {sources.map(source => (
              <div key={source.id} className="flex items-center gap-2 p-2 rounded-md hover:bg-light-muted dark:hover:bg-dark-muted cursor-pointer group transition-colors">
                <FileText className="w-4 h-4 text-light-muted dark:text-dark-muted" />
                <span className="text-sm truncate flex-1">{source.name}</span>
                <MoreVertical className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Part 2: Chat (Middle) */}
      <div className="flex-1 flex flex-col relative min-w-0 bg-light-bg dark:bg-dark-bg">
        {/* Chat Header */}
        <div className="px-6 py-3 border-b border-light-border dark:border-dark-border flex items-center justify-between bg-light-surface dark:bg-dark-surface">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Sparkles className="w-4 h-4 text-blue-600" />
            </div>
            <div className="relative min-w-0">
              <button
                type="button"
                onClick={() => setModelMenuOpen((open) => !open)}
                aria-expanded={modelMenuOpen}
                className="flex items-center gap-1.5 font-semibold text-sm hover:text-blue-600 transition-colors max-w-[22rem]"
              >
                <span className="truncate">{selectedModelName}</span>
                <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${modelMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {modelMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setModelMenuOpen(false)} />
                  <div className="absolute top-full left-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-lg shadow-xl z-50 overflow-hidden">
                    <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-light-border dark:border-dark-border">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-light-muted dark:text-dark-muted">
                          {t('notes.models.title')}
                        </p>
                        <p className="text-[10px] text-light-muted dark:text-dark-muted">
                          {t('notes.models.count', { count: models.length })}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => fetchApplications()}
                        title={t('notes.models.refresh')}
                        className="p-1.5 rounded-md hover:bg-light-muted dark:hover:bg-dark-muted transition-colors"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                      </button>
                    </div>

                    {models.length === 0 ? (
                      <div className="flex items-start gap-2 px-4 py-4 text-xs text-light-muted dark:text-dark-muted">
                        <Cpu className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{t('notes.models.empty')}</span>
                      </div>
                    ) : (
                      <div className="max-h-72 overflow-y-auto py-1">
                        {models.map((model) => {
                          const selected = model.id === selectedModelId;
                          return (
                            <button
                              key={model.id}
                              type="button"
                              onClick={() => {
                                userSelectedRef.current = true;
                                setSelectedModelId(model.id);
                                setModelMenuOpen(false);
                              }}
                              title={model.path}
                              className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                                selected
                                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                                  : 'hover:bg-light-muted dark:hover:bg-dark-muted'
                              }`}
                            >
                              <Cpu className="w-4 h-4 shrink-0" />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium">{model.label}</span>
                                <span className="block truncate text-[10px] text-light-muted dark:text-dark-muted">
                                  {t('notes.models.app', { app: model.appName })}
                                </span>
                              </span>
                              {selected && <Check className="w-4 h-4 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              title={t('notes.read_aloud')}
              className="p-2 hover:bg-light-muted dark:hover:bg-dark-muted rounded-full transition-colors"
            >
              <Volume2 className="w-4 h-4 text-light-muted dark:text-dark-muted" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-sm ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-tr-none'
                  : 'bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-tl-none'
              }`}>
                <p className="text-sm leading-relaxed">
                  {msg.id === 'welcome' ? t('notes.initial_message') : msg.content}
                </p>
                <span className="text-[10px] opacity-50 mt-1 block">
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-transparent">
          <div className="max-w-3xl mx-auto relative flex items-end gap-2 bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-2xl p-2 shadow-lg focus-within:border-blue-500/50 transition-all">
            <button
              onClick={toggleSpeech}
              className={`p-2 rounded-xl transition-colors ${isSpeaking ? 'bg-red-100 text-red-600 animate-pulse' : 'hover:bg-light-muted dark:hover:bg-dark-muted'}`}
            >
              <Mic className="w-5 h-5" />
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
              placeholder={t('notes.ask_placeholder')}
              className="flex-1 bg-transparent border-none outline-none text-sm py-2 resize-none max-h-32 min-h-[40px]"
              rows={1}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="p-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:bg-gray-400 text-white rounded-xl transition-all"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
          <p className="text-[10px] text-center text-light-muted dark:text-dark-muted mt-2">
            {t('notes.disclaimer')}
          </p>
        </div>
      </div>

      {/* Part 3: Studio (Right) */}
      <div className="w-80 border-l border-light-border dark:border-dark-border flex flex-col bg-light-surface dark:bg-dark-surface">
        <div className="p-4 border-b border-light-border dark:border-dark-border">
          <h2 className="font-bold flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-purple-500" /> {t('notes.studio')}
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="p-4 bg-light-bg dark:bg-dark-bg rounded-xl border border-light-border dark:border-dark-border shadow-sm group hover:border-purple-500/30 transition-all cursor-pointer">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-purple-600 uppercase tracking-tighter">{t('notes.new_note')}</span>
              <span className="text-[10px] text-light-muted dark:text-dark-muted">{t('notes.just_now')}</span>
            </div>
            <h3 className="text-sm font-semibold mb-1">{t('notes.summary_title')}</h3>
            <p className="text-xs text-light-muted dark:text-dark-muted line-clamp-3">
              {t('notes.summary_body')}
            </p>
          </div>

          <div className="p-4 bg-light-bg dark:bg-dark-bg rounded-xl border border-light-border dark:border-dark-border shadow-sm opacity-60">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-light-muted dark:text-dark-muted uppercase tracking-tighter">{t('notes.draft')}</span>
              <span className="text-[10px] text-light-muted dark:text-dark-muted">{t('notes.two_hours_ago')}</span>
            </div>
            <h3 className="text-sm font-semibold mb-1">{t('notes.architecture_title')}</h3>
            <p className="text-xs text-light-muted dark:text-dark-muted line-clamp-3">
              {t('notes.architecture_body')}
            </p>
          </div>

          <button className="w-full py-3 border-2 border-dashed border-light-border dark:border-dark-border rounded-xl text-xs text-light-muted dark:text-dark-muted hover:text-blue-600 hover:border-blue-500/50 transition-all flex flex-col items-center gap-1">
            <Plus className="w-4 h-4" />
            {t('notes.create_note')}
          </button>
        </div>

        {/* Studio Footer */}
        <div className="p-4 border-t border-light-border dark:border-dark-border">
          <button className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors">
            <Sparkles className="w-4 h-4" /> {t('notes.generate_report')}
          </button>
        </div>
      </div>

    </div>
  );
}
