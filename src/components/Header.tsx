import React, { useMemo } from 'react';
import { ShieldAlert, Cpu, Sparkles, BookOpen, Calculator, RefreshCw, Upload, Layers, Brain, ChevronDown } from 'lucide-react';
import { PRESET_CASES, PresetCase } from '../utils/presetCases';
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

export const Header: React.FC<HeaderProps> = ({
  onSelectPreset,
  activeTab,
  setActiveTab,
  onReset,
  isAiAnalyzing,
  onOpenUploadModal,
  batchCount,
  batchQueue,
  currentMatch,
  onSelectMatch,
}) => {
  // Sync selected dropdown value with current active match
  const selectedValue = useMemo(() => {
    if (!currentMatch) return '';
    // Look in batchQueue (imported from markdown / CSV / upload)
    if (batchQueue && batchQueue.length > 0) {
      const foundQueueItem = batchQueue.find(
        (b) =>
          b.data.matchInfo.homeTeam === currentMatch.matchInfo.homeTeam &&
          b.data.matchInfo.awayTeam === currentMatch.matchInfo.awayTeam
      );
      if (foundQueueItem) return `batch-${foundQueueItem.id}`;
    }
    // Look in PRESET_CASES
    const foundPreset = PRESET_CASES.find(
      (p) =>
        p.data.matchInfo.homeTeam === currentMatch.matchInfo.homeTeam &&
        p.data.matchInfo.awayTeam === currentMatch.matchInfo.awayTeam
    );
    if (foundPreset) return `preset-${foundPreset.id}`;
    return '';
  }, [currentMatch, batchQueue]);

  const handleDropdownChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (!val) return;

    if (val.startsWith('batch-')) {
      const matchId = val.replace('batch-', '');
      const item = batchQueue?.find((b) => b.id === matchId);
      if (item && onSelectMatch) {
        onSelectMatch(item.data);
      }
    } else if (val.startsWith('preset-')) {
      const presetId = val.replace('preset-', '');
      const preset = PRESET_CASES.find((p) => p.id === presetId);
      if (preset) {
        onSelectPreset(preset);
      }
    }
  };
  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Identity (Optimized to prevent text wrapping on left) */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 via-teal-600 to-cyan-700 flex items-center justify-center shadow-lg shadow-emerald-500/20 ring-1 ring-emerald-400/30 shrink-0">
              <ShieldAlert className="w-6 h-6 text-slate-950 font-bold" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base sm:text-lg font-bold tracking-tight text-white font-mono whitespace-nowrap">
                  《财富经》足彩盘赔精算系统
                </span>
                <span className="hidden lg:inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 whitespace-nowrap shrink-0">
                  风控博弈论 V3.8
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block whitespace-nowrap truncate max-w-[240px] md:max-w-none">
                剥离球队虚火 · 早晚变轨测谎 · 直击大庄真实底牌
              </p>
            </div>
          </div>

          {/* Actions & Tabs */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Upload Attachment Button */}
            <button
              onClick={onOpenUploadModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-emerald-500/20 via-teal-500/20 to-cyan-500/20 hover:from-emerald-500/30 hover:to-cyan-500/30 text-emerald-300 border border-emerald-500/40 shadow-sm transition-all cursor-pointer whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5 text-emerald-400" />
              <span>上传附件</span>
            </button>

            {/* Match Switcher Dropdown (Matches imported from Markdown / Queue + Presets) */}
            <div className="relative hidden xl:block">
              <select
                aria-label="选择比赛场次"
                value={selectedValue}
                onChange={handleDropdownChange}
                className="bg-slate-800 text-xs font-semibold text-slate-100 border border-emerald-500/40 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer hover:bg-slate-750 transition-colors max-w-[210px] truncate shadow-sm"
              >
                <option value="" disabled>
                  {batchQueue && batchQueue.length > 0
                    ? `📋 切换已导入场次 (${batchQueue.length}场)...`
                    : '📂 经典操盘案例...'}
                </option>

                {/* Priority 1: Imported Markdown / Queue Matches */}
                {batchQueue && batchQueue.length > 0 && (
                  <optgroup label={`📋 已导入比赛队列 (${batchQueue.length} 场)`}>
                    {batchQueue.map((item, idx) => (
                      <option key={item.id} value={`batch-${item.id}`}>
                        #{idx + 1} {item.data.matchInfo.homeTeam} vs {item.data.matchInfo.awayTeam} ({item.data.matchInfo.league || '常规'})
                      </option>
                    ))}
                  </optgroup>
                )}

                {/* Priority 2: Classic Presets */}
                <optgroup label="📂 经典操盘教学预设">
                  {PRESET_CASES.map((c) => (
                    <option key={c.id} value={`preset-${c.id}`}>
                      [{c.tag}] {c.name.split('：')[0]}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            {/* Navigation Tabs (Ordered: 三维测谎, 批量矩阵, 精算盘口, 五大模型, 复盘进化在最后面) */}
            <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
              <button
                onClick={() => setActiveTab('report')}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md font-medium transition-all ${
                  activeTab === 'report'
                    ? 'bg-emerald-500 text-slate-950 shadow font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>三维测谎</span>
              </button>
              <button
                onClick={() => setActiveTab('batch')}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md font-medium transition-all ${
                  activeTab === 'batch'
                    ? 'bg-emerald-500 text-slate-950 shadow font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>批量矩阵</span>
                {batchCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-slate-900 text-emerald-400 border border-emerald-500/30">
                    {batchCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('calculator')}
                className={`hidden md:flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md font-medium transition-all ${
                  activeTab === 'calculator'
                    ? 'bg-emerald-500 text-slate-950 shadow font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Calculator className="w-3.5 h-3.5" />
                <span>精算盘口</span>
              </button>
              <button
                onClick={() => setActiveTab('models')}
                className={`hidden sm:flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md font-medium transition-all ${
                  activeTab === 'models'
                    ? 'bg-emerald-500 text-slate-950 shadow font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>五大模型</span>
              </button>
              <button
                onClick={() => setActiveTab('review')}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md font-medium transition-all ${
                  activeTab === 'review'
                    ? 'bg-emerald-500 text-slate-950 shadow font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Brain className="w-3.5 h-3.5" />
                <span>复盘进化</span>
              </button>
            </div>

            {/* Reset button */}
            <button
              onClick={onReset}
              title="重置全部数据"
              className="p-2 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
