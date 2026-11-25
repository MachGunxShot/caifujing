import React from 'react';
import { Upload } from 'lucide-react';
import { PresetCase } from '../utils/presetCases';
import { FullMatchData, BatchMatchItem } from '../types/fortuneActuary';

interface HeaderProps {
  onSelectPreset: (preset: PresetCase) => void;
  activeTab: 'report' | 'calculator' | 'models' | 'batch' | 'review';
  setActiveTab: (tab: 'report' | 'calculator' | 'models' | 'batch' | 'review') => void;
  onReset: () => void;
  isAiAnalyzing: boolean;
  onOpenUploadModal: () => void;
  batchCount: number;
  batchQueue?: BatchMatchItem[];
  currentMatch?: FullMatchData;
  onSelectMatch?: (match: FullMatchData) => void;
}

const NAV_ITEMS: Array<{ id: HeaderProps['activeTab']; label: string }> = [
  { id: 'report', label: '三维测谎' },
  { id: 'batch', label: '批量矩阵' },
  { id: 'calculator', label: '精算盘口' },
  { id: 'models', label: '五大模型' },
  { id: 'review', label: '复盘进化' },
];

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onOpenUploadModal,
  batchCount,
}) => {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/90 bg-slate-950/90 backdrop-blur-xl">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="h-14 flex items-center justify-between gap-6 sm:gap-8">
          {/* Zone 1: Minimalist Brand Wordmark (single line, no badges or taglines) */}
          <button
            type="button"
            onClick={() => setActiveTab('report')}
            className="flex items-center gap-2.5 text-left whitespace-nowrap shrink-0 cursor-pointer group"
          >
            <span
              aria-hidden="true"
              className="w-7 h-7 rounded-md bg-slate-900 border border-slate-700/80 flex items-center justify-center text-emerald-400 font-mono text-xs font-bold tracking-tighter group-hover:border-emerald-500/50 transition-colors"
            >
              财
            </span>
            <span className="text-[15px] font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0">
              财富经精算
            </span>
          </button>

          {/* Zone 2: Clean Typographic Navigation Links */}
          <nav
            aria-label="主导航"
            className="flex items-center gap-1 sm:gap-6 overflow-x-auto h-full"
          >
            {NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`relative h-full px-2 sm:px-0.5 inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap shrink-0 cursor-pointer transition-colors duration-150 ${
                    isActive
                      ? 'text-slate-50 font-semibold'
                      : 'text-slate-400 hover:text-slate-200 font-medium'
                  }`}
                >
                  <span>{item.label}</span>
                  {item.id === 'batch' && batchCount > 0 && (
                    <span
                      className={`font-mono text-[11px] tabular-nums ${
                        isActive ? 'text-emerald-400' : 'text-slate-500'
                      }`}
                    >
                      {batchCount}
                    </span>
                  )}
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute bottom-0 left-0 right-0 h-[2px] bg-emerald-400"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={onOpenUploadModal}
              className="h-9 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-all duration-150 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>导入盘赔</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
