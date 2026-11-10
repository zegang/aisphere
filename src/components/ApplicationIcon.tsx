import { useState } from 'react';
import {
  AppWindow,
  Bot,
  Box,
  Braces,
  Brain,
  Code2,
  Compass,
  Cpu,
  Database,
  FileText,
  Files,
  Globe,
  HardDrive,
  Layers,
  Lightbulb,
  Network,
  Package,
  Search,
  Server,
  Shield,
  Sparkles,
  Terminal,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { ApplicationIcon as ApplicationIconValue } from '@/types/api';

const lucideIcons: Record<string, LucideIcon> = {
  AppWindow,
  Bot,
  Box,
  Braces,
  Brain,
  Code2,
  Compass,
  Cpu,
  Database,
  FileText,
  Files,
  Globe,
  HardDrive,
  Layers,
  Lightbulb,
  Network,
  Package,
  Search,
  Server,
  Shield,
  Sparkles,
  Terminal,
  Wrench,
  Zap,
};

function isImageSource(value: string): boolean {
  return /^(https?:\/\/|data:image\/|\.{0,2}[\\/])/i.test(value)
    || /[\\/]/.test(value)
    || /\.(png|jpe?g|gif|webp|avif|svg|ico)(?:[?#].*)?$/i.test(value);
}

interface Props {
  icon?: ApplicationIconValue;
  name: string;
  className: string;
}

export function ApplicationIcon({ icon, name, className }: Props) {
  const [imageFailed, setImageFailed] = useState(false);

  let imageSource: string | null = null;
  let imageAlt = name;
  let unicode: string | null = null;
  let Icon: LucideIcon = AppWindow;
  if (typeof icon === 'string') {
    const value = icon.trim();
    if (value) {
      if (isImageSource(value)) imageSource = value;
      else unicode = value;
    }
  } else if (icon?.type === 'unicode' || icon?.type === 'emoji') {
    unicode = icon.value;
  } else if (icon?.type === 'image' || icon?.type === 'svg') {
    imageSource = icon.src;
    imageAlt = icon.alt ?? name;
  } else if (icon?.type === 'lucide') {
    Icon = lucideIcons[icon.name] ?? AppWindow;
  }

  const containerClass = `${className} flex items-center justify-center overflow-hidden`;
  if (imageSource && !imageFailed) {
    return (
      <span className={containerClass}>
        <img
          src={imageSource}
          alt={imageAlt}
          className="h-full w-full object-contain"
          onError={() => setImageFailed(true)}
        />
      </span>
    );
  }
  if (unicode) {
    return (
      <span className={`${containerClass} text-3xl leading-none`} role="img" aria-label={name}>
        {unicode}
      </span>
    );
  }
  return (
    <span className={`${containerClass} bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400`}>
      <Icon className="h-1/2 w-1/2" aria-label={name} />
    </span>
  );
}

export default ApplicationIcon;
