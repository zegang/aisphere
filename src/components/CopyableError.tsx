import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useTranslation } from '@/i18n';

interface CopyableErrorProps {
  message: string;
  /** Extra wrapper classes. */
  className?: string;
  /** Render without the colored box, e.g. inside an existing alert panel. */
  inline?: boolean;
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  // Fallback for environments where the async clipboard API is unavailable.
  const area = document.createElement('textarea');
  area.value = value;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  try {
    document.execCommand('copy');
  } finally {
    document.body.removeChild(area);
  }
}

/**
 * Error text with a copy button. Every error surface in AiSphere uses this so
 * users can paste the full message into a bug report or support request.
 */
export function CopyableError({ message, className = '', inline = false }: CopyableErrorProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => {
    if (timer.current !== undefined) window.clearTimeout(timer.current);
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await copyText(message);
      setCopied(true);
      if (timer.current !== undefined) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }, [message]);

  const content = (
    <>
      <p className="text-xs text-red-600 dark:text-red-400 break-words whitespace-pre-wrap">{message}</p>
      <button
        type="button"
        onClick={() => { void handleCopy(); }}
        title={t('common.copy_error')}
        className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-red-700 dark:text-red-300 hover:underline"
      >
        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
        {copied ? t('common.copied') : t('common.copy')}
      </button>
    </>
  );

  if (inline) {
    return <div className={className}>{content}</div>;
  }

  return (
    <div className={`rounded-lg border border-red-200/60 bg-red-50 px-3 py-2 dark:border-red-500/20 dark:bg-red-900/10 ${className}`}>
      {content}
    </div>
  );
}

export default CopyableError;
