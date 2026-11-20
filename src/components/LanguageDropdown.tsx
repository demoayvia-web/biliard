import React from 'react';
import { ChevronDown, Languages } from 'lucide-react';
import type { LanguageCode } from '../game/types.ts';
import { useI18n } from '../i18n/I18nContext.tsx';

interface LanguageDropdownProps {
  id?: string;
  value?: LanguageCode;
  onChangeLanguage?: (lang: LanguageCode) => void;
  className?: string;
}

export const LanguageDropdown: React.FC<LanguageDropdownProps> = ({
  id = 'settings-language-select',
  value,
  onChangeLanguage,
  className = '',
}) => {
  const { language, languages, t, setLanguage } = useI18n();
  const activeValue = value ?? language;

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextLang = e.target.value as LanguageCode;
    setLanguage(nextLang);
    onChangeLanguage?.(nextLang);
  };

  return (
    <div className={`relative w-full ${className}`}>
      <Languages
        className="w-4 h-4 text-emerald-400 pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"
        aria-hidden="true"
      />
      <select
        id={id}
        aria-label={t.languageLabel}
        value={activeValue}
        onChange={handleChange}
        className="w-full appearance-none pl-10 pr-10 py-2.5 rounded-lg bg-[#0E1311] border border-white/15 hover:border-emerald-500/45 focus:outline-none focus:border-emerald-500 text-sm font-medium text-white min-h-[44px] cursor-pointer transition-colors"
      >
        {languages.map((opt) => (
          <option key={opt.code} value={opt.code} className="bg-[#0E1311] text-white">
            {opt.nativeName} ({opt.short})
          </option>
        ))}
      </select>
      <ChevronDown
        className="w-4 h-4 text-zinc-400 pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2"
        aria-hidden="true"
      />
    </div>
  );
};
