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
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3">
          {/* Logo & Identity (Optimized to prevent text wrapping on left) */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 via-teal-600 to-cyan-700 flex items-center justify-center shadow-lg shadow-emerald-500/20 ring-1 ring-emerald-400/40 shrink-0">
              <ShieldAlert className="w-6 h-6 text-slate-950 font-bold" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base sm:text-lg tracking-tight font-mono whitespace-nowrap">
                  <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent font-black">
                    《财富经》
                  </span>
                  <span className="text-white font-black ml-1">足彩盘赔精算系统</span>
                </span>
                <span className="hidden lg:inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 whitespace-nowrap shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-1" />
                  风控博弈论 V3.8
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block whitespace-nowrap truncate max-w-[260px] md:max-w-none">
                剥离球队虚火 · 早晚变轨测谎 · 直击大庄真实底牌
              </p>
            </div>
          </div>

          {/* Actions & Tabs */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {/* Upload Attachment Button */}
            <button
              onClick={onOpenUploadModal}
              className="h-9 flex items-center gap-1.5 px-3.5 rounded-lg text-xs font-bold bg-gradient-to-r from-emerald-500/15 via-teal-500/15 to-cyan-500/15 hover:from-emerald-500/25 hover:to-cyan-500/25 text-emerald-300 border border-emerald-500/40 hover:border-emerald-400 shadow-sm transition-all cursor-pointer whitespace-nowrap active:scale-[0.98]"
            >
              <Upload className="w-3.5 h-3.5 text-emerald-400" />
              <span>上传附件</span>
            </button>

            {/* Match Switcher Dropdown (Matches imported from Markdown / Queue + Presets) */}
            <div className="relative hidden lg:block">
              <select
                aria-label="选择比赛场次"
                value={selectedValue}
                onChange={handleDropdownChange}
                className="h-9 appearance-none bg-slate-900/90 text-xs font-bold text-slate-100 border border-emerald-500/40 hover:border-emerald-400 rounded-lg pl-3 pr-8 focus:outline-none focus:ring-1 focus:ring-emerald-400 cursor-pointer hover:bg-slate-850 transition-all min-w-[210px] max-w-[340px] truncate shadow-sm"
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
              <ChevronDown className="w-3.5 h-3.5 text-emerald-400/80 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
            </div>

            {/* Navigation Tabs (Ordered: 三维测谎, 批量矩阵, 精算盘口, 五大模型, 复盘进化在最后面) */}
            <div className="h-9 flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
              <button
                onClick={() => setActiveTab('report')}
                className={`h-7 flex items-center gap-1.5 px-2.5 sm:px-3 rounded-md font-bold transition-all cursor-pointer ${
                  activeTab === 'report'
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md shadow-emerald-500/25 font-black'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>三维测谎</span>
              </button>
              <button
                onClick={() => setActiveTab('batch')}
                className={`h-7 flex items-center gap-1.5 px-2.5 sm:px-3 rounded-md font-bold transition-all cursor-pointer ${
                  activeTab === 'batch'
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md shadow-emerald-500/25 font-black'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>批量矩阵</span>
                {batchCount > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-black ${
                      activeTab === 'batch'
                        ? 'bg-slate-950/90 text-emerald-300'
                        : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    }`}
                  >
                    {batchCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('calculator')}
                className={`h-7 hidden md:flex items-center gap-1.5 px-2.5 sm:px-3 rounded-md font-bold transition-all cursor-pointer ${
                  activeTab === 'calculator'
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md shadow-emerald-500/25 font-black'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                <Calculator className="w-3.5 h-3.5" />
                <span>精算盘口</span>
              </button>
              <button
                onClick={() => setActiveTab('models')}
                className={`h-7 hidden sm:flex items-center gap-1.5 px-2.5 sm:px-3 rounded-md font-bold transition-all cursor-pointer ${
                  activeTab === 'models'
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md shadow-emerald-500/25 font-black'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>五大模型</span>
              </button>
              <button
                onClick={() => setActiveTab('review')}
                className={`h-7 flex items-center gap-1.5 px-2.5 sm:px-3 rounded-md font-bold transition-all cursor-pointer ${
                  activeTab === 'review'
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md shadow-emerald-500/25 font-black'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                <Brain className="w-3.5 h-3.5" />
                <span>复盘进化</span>
              </button>
            </div>

            {/* Reset button */}
            <button
              onClick={onReset}
              title="重置当前盘面数据为默认空白"
              className="h-9 w-9 flex items-center justify-center text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 rounded-lg transition-all group cursor-pointer shadow-sm active:scale-95 shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5 group-hover:rotate-180 transition-transform duration-500 text-slate-400 group-hover:text-emerald-400" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
