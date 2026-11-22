import React, { useState } from 'react';
import {
  Sparkles,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Minus,
  ClipboardPaste,
  HelpCircle,
  Activity,
  Layers,
  Flame,
  Percent,
  Upload,
} from 'lucide-react';
import { FullMatchData } from '../types/fortuneActuary';
import { parseNaturalTextOdds } from '../utils/textParser';
import { PRESET_CASES } from '../utils/presetCases';

interface MatchInputFormProps {
  data: FullMatchData;
  onChange: (newData: FullMatchData) => void;
  onSubmit: () => void;
  isLoading: boolean;
  onSelectPreset: (preset: typeof PRESET_CASES[0]) => void;
  onOpenUploadModal?: () => void;
  onBatchAnalyzeAll?: () => void;
  batchCount?: number;
}

const COMMON_HANDICAPS = [
  '平手', '平半', '半球', '半一', '一球', '一球/球半', '球半', '球半/两球', '两球'
];

const COMMON_OU_LINES = ['2.0', '2.25', '2.5', '2.75', '3.0', '3.25', '3.5'];

export const MatchInputForm: React.FC<MatchInputFormProps> = ({
  data,
  onChange,
  onSubmit,
  isLoading,
  onSelectPreset,
  onOpenUploadModal,
  onBatchAnalyzeAll,
  batchCount = 0,
}) => {
  const [pasteText, setPasteText] = useState('');
  const [showPasteBox, setShowPasteBox] = useState(false);

  const handleTextParse = () => {
    if (!pasteText.trim()) return;
    const parsed = parseNaturalTextOdds(pasteText, data);
    onChange({
      ...data,
      ...parsed,
      matchInfo: {
        ...data.matchInfo,
        ...(parsed.matchInfo?.homeTeam && parsed.matchInfo.homeTeam !== data.matchInfo.homeTeam ? { homeProfile: undefined } : {}),
        ...(parsed.matchInfo?.awayTeam && parsed.matchInfo.awayTeam !== data.matchInfo.awayTeam ? { awayProfile: undefined } : {}),
        ...(parsed.matchInfo || {}),
      },
      asianHandicap: {
        ...data.asianHandicap,
        ...(parsed.asianHandicap || {}),
      },
      euroOdds: {
        ...data.euroOdds,
        ...(parsed.euroOdds || {}),
      },
      overUnder: {
        ...data.overUnder,
        ...(parsed.overUnder || {}),
      },
    });
    setShowPasteBox(false);
    setPasteText('');
  };

  const updateMatchInfo = (field: keyof FullMatchData['matchInfo'], value: string) => {
    onChange({
      ...data,
      matchInfo: {
        ...data.matchInfo,
        ...(field === 'homeTeam' ? {homeProfile: undefined} : field === 'awayTeam' ? {awayProfile: undefined} : {}),
        [field]: value,
      },
    });
  };

  const updateAsian = (field: keyof FullMatchData['asianHandicap'], value: any) => {
    onChange({
      ...data,
      asianHandicap: {
        ...data.asianHandicap,
        [field]: typeof value === 'number' ? (isNaN(value) ? 0 : value) : value,
      },
    });
  };

  const updateEuro = (field: keyof FullMatchData['euroOdds'], value: number) => {
    onChange({
      ...data,
      euroOdds: {
        ...data.euroOdds,
        [field]: isNaN(value) ? 0 : value,
      },
    });
  };

  const updateOU = (field: keyof FullMatchData['overUnder'], value: any) => {
    onChange({
      ...data,
      overUnder: {
        ...data.overUnder,
        [field]: typeof value === 'number' ? (isNaN(value) ? 0 : value) : value,
      },
    });
  };

  // Helper for trend badge
  const getTrendIcon = (late: number, early: number) => {
    if (late < early) return <TrendingDown className="w-3.5 h-3.5 text-emerald-400 inline" />;
    if (late > early) return <TrendingUp className="w-3.5 h-3.5 text-rose-400 inline" />;
    return <Minus className="w-3.5 h-3.5 text-slate-500 inline" />;
  };

  return (
    <div className="space-y-4">
      {/* Smart Quick Input Bar & Presets chips */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
            <ClipboardPaste className="w-3.5 h-3.5 text-emerald-400" />
            <span>智能盘赔文本快捷录入</span>
          </div>
          <div className="flex items-center gap-3">
            {onOpenUploadModal && (
              <button
                type="button"
                onClick={onOpenUploadModal}
                className="text-xs text-emerald-400 hover:text-emerald-300 font-mono hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Upload className="w-3 h-3" />
                <span>截图识盘 / 批量文件</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowPasteBox(!showPasteBox)}
              className="text-xs text-cyan-400 hover:text-cyan-300 font-mono hover:underline cursor-pointer"
            >
              {showPasteBox ? '收起文本框' : '+ 粘贴赔率'}
            </button>
          </div>
        </div>

        {showPasteBox && (
          <div className="space-y-2 mt-2 pt-2 border-t border-slate-800/80">
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="直接粘贴任意盘赔文本，如：
阿森纳 vs 切尔西 初盘半一0.92 临场一球0.82 欧赔 1.65 3.80 5.20 -> 1.48 4.20 7.00 大小球2.5"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono h-20"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleTextParse}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-semibold text-xs rounded-md shadow"
              >
                一键解析填入各盘
              </button>
            </div>
          </div>
        )}

        {/* Quick preset chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] scrollbar-none">
          <span className="text-slate-500 whitespace-nowrap">经典模型速测:</span>
          {PRESET_CASES.slice(0, 5).map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onSelectPreset(preset)}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700/60 whitespace-nowrap transition-colors"
            >
              {preset.tag}
            </button>
          ))}
        </div>
      </div>

      {/* Basic Match Info */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
            <Activity className="w-4 h-4 text-cyan-400" />
            <span>比赛基本信息与题材热度</span>
          </div>
          <span className="text-[11px] text-slate-400">早盘看意图 · 晚盘看风控</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">赛事/联赛</label>
            <input
              type="text"
              value={data.matchInfo.league}
              onChange={(e) => updateMatchInfo('league', e.target.value)}
              placeholder="如：英格兰超级联赛"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-[11px] text-emerald-400 font-semibold mb-1">主队 (上盘方/主场)</label>
            <input
              type="text"
              value={data.matchInfo.homeTeam}
              onChange={(e) => updateMatchInfo('homeTeam', e.target.value)}
              placeholder="如：曼彻斯特城"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
            />
          </div>
          <div>
            <label className="block text-[11px] text-cyan-400 font-semibold mb-1">客队 (下盘方/客场)</label>
            <input
              type="text"
              value={data.matchInfo.awayTeam}
              onChange={(e) => updateMatchInfo('awayTeam', e.target.value)}
              placeholder="如：埃弗顿"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {(['homeProfile', 'awayProfile'] as const).map(field => (
            <label key={field} className="text-xs text-slate-400">
              {field === 'homeProfile' ? '主队定位' : '客队定位'}
              <select className="mt-1 w-full rounded bg-slate-950 p-1.5 text-slate-200"
                value={data.matchInfo[field] || ''} onChange={e => updateMatchInfo(field, e.target.value)}>
                <option value="">待核实</option><option value="dominant">统治级强队</option>
                <option value="challenger">新贵 / 黑马</option><option value="ordinary">普通球队</option>
              </select>
            </label>
          ))}
        </div>

        <div>
          <label className="block text-[11px] text-slate-400 mb-1">
            市场题材热度 / 豪门名气对比 / 核心伤停情报 (关键证伪依据)
          </label>
          <input
            type="text"
            value={data.matchInfo.marketStory}
            onChange={(e) => updateMatchInfo('marketStory', e.target.value)}
            placeholder="如：主队名气极大但核心前锋伤缺，近3次交手全胜，市场资金一面倒追捧主队"
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Asian Handicap Comparison (早盘 vs 晚盘) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
            <Layers className="w-4 h-4 text-emerald-400" />
            <span>亚指盘口对比 (早盘意图 vs 临场晚盘风控)</span>
          </div>
          <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            榨水/诱盘识别区
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Early Asian */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 space-y-2">
            <div className="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
              <span>早盘 (机构原始意图)</span>
              <span className="text-slate-500 font-mono">初盘</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">初盘让步</label>
                <input
                  type="text"
                  value={data.asianHandicap.earlyHandicap}
                  onChange={(e) => updateAsian('earlyHandicap', e.target.value)}
                  placeholder="-0.75 或 半一"
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-center font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">主队初水</label>
                <input
                  type="number"
                  step="0.01"
                  value={data.asianHandicap.earlyHomeOdds || ''}
                  onChange={(e) => updateAsian('earlyHomeOdds', parseFloat(e.target.value))}
                  placeholder="1.92"
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-center font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">客队初水</label>
                <input
                  type="number"
                  step="0.01"
                  value={data.asianHandicap.earlyAwayOdds || ''}
                  onChange={(e) => updateAsian('earlyAwayOdds', parseFloat(e.target.value))}
                  placeholder="1.90"
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-center font-mono text-white"
                />
              </div>
            </div>
          </div>

          {/* Late Asian */}
          <div className="bg-slate-950/80 border border-emerald-950/60 rounded-lg p-3 space-y-2 ring-1 ring-emerald-500/20">
            <div className="text-[11px] font-semibold text-emerald-400 flex items-center justify-between">
              <span>临场晚盘 (大庄真实风控底牌)</span>
              <span className="text-[10px] text-emerald-500 font-mono">即时变轨</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] text-slate-400 mb-0.5">即时让步</label>
                <input
                  type="text"
                  value={data.asianHandicap.lateHandicap}
                  onChange={(e) => updateAsian('lateHandicap', e.target.value)}
                  placeholder="-1.0 或 一球"
                  className="w-full bg-slate-900 border border-emerald-500/40 rounded px-2 py-1 text-xs text-center font-mono text-white font-semibold"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-0.5">
                  主队即时水 {getTrendIcon(data.asianHandicap.lateHomeOdds, data.asianHandicap.earlyHomeOdds)}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={data.asianHandicap.lateHomeOdds || ''}
                  onChange={(e) => updateAsian('lateHomeOdds', parseFloat(e.target.value))}
                  placeholder="2.06 或 1.76"
                  className={`w-full bg-slate-900 border rounded px-2 py-1 text-xs text-center font-mono font-bold ${
                    data.asianHandicap.lateHomeOdds >= 2.0
                      ? 'border-rose-500/60 text-rose-400'
                      : data.asianHandicap.lateHomeOdds <= 1.80
                      ? 'border-emerald-500/60 text-emerald-400'
                      : 'border-slate-800 text-white'
                  }`}
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-0.5">客队即时水</label>
                <input
                  type="number"
                  step="0.01"
                  value={data.asianHandicap.lateAwayOdds || ''}
                  onChange={(e) => updateAsian('lateAwayOdds', parseFloat(e.target.value))}
                  placeholder="1.82"
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-center font-mono text-white"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Quick handicap shortcuts */}
        <div className="flex items-center gap-1 overflow-x-auto text-[10px] pt-1">
          <span className="text-slate-500 whitespace-nowrap">盘口快选:</span>
          {COMMON_HANDICAPS.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => updateAsian('lateHandicap', h)}
              className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono"
            >
              {h}
            </button>
          ))}
        </div>
      </div>

      {/* European Odds Comparison (欧指走势) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
            <Percent className="w-4 h-4 text-cyan-400" />
            <span>欧指走势 (早盘初赔 vs 临场即时赔率)</span>
          </div>
          <span className="text-[11px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
            平赔排雷 & 胜赔榨水
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Early Euro */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 space-y-2">
            <div className="text-[11px] font-semibold text-slate-400">早盘初赔 (胜 / 平 / 负)</div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">主胜初赔</label>
                <input
                  type="number"
                  step="0.01"
                  value={data.euroOdds.earlyWin || ''}
                  onChange={(e) => updateEuro('earlyWin', parseFloat(e.target.value))}
                  placeholder="1.65"
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-center font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">平局初赔</label>
                <input
                  type="number"
                  step="0.01"
                  value={data.euroOdds.earlyDraw || ''}
                  onChange={(e) => updateEuro('earlyDraw', parseFloat(e.target.value))}
                  placeholder="3.80"
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-center font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">客胜初赔</label>
                <input
                  type="number"
                  step="0.01"
                  value={data.euroOdds.earlyLoss || ''}
                  onChange={(e) => updateEuro('earlyLoss', parseFloat(e.target.value))}
                  placeholder="5.20"
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-center font-mono text-white"
                />
              </div>
            </div>
          </div>

          {/* Late Euro */}
          <div className="bg-slate-950/80 border border-cyan-950/60 rounded-lg p-3 space-y-2 ring-1 ring-cyan-500/20">
            <div className="text-[11px] font-semibold text-cyan-400">临场即时欧赔 (胜 / 平 / 负)</div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] text-slate-400 mb-0.5">
                  主胜即时 {getTrendIcon(data.euroOdds.lateWin, data.euroOdds.earlyWin)}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={data.euroOdds.lateWin || ''}
                  onChange={(e) => updateEuro('lateWin', parseFloat(e.target.value))}
                  placeholder="1.48"
                  className="w-full bg-slate-900 border border-cyan-500/40 rounded px-2 py-1 text-xs text-center font-mono text-white font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-0.5">
                  平局即时 {getTrendIcon(data.euroOdds.lateDraw, data.euroOdds.earlyDraw)}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={data.euroOdds.lateDraw || ''}
                  onChange={(e) => updateEuro('lateDraw', parseFloat(e.target.value))}
                  placeholder="2.90"
                  className={`w-full bg-slate-900 border rounded px-2 py-1 text-xs text-center font-mono font-bold ${
                    data.euroOdds.lateDraw <= 3.0 ? 'border-amber-500/60 text-amber-300' : 'border-slate-800 text-white'
                  }`}
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-0.5">
                  客胜即时 {getTrendIcon(data.euroOdds.lateLoss, data.euroOdds.earlyLoss)}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={data.euroOdds.lateLoss || ''}
                  onChange={(e) => updateEuro('lateLoss', parseFloat(e.target.value))}
                  placeholder="7.00"
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-center font-mono text-white"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Over/Under Comparison (大小球联动) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
            <Flame className="w-4 h-4 text-amber-400" />
            <span>大小球联动 (三维联动测谎关键维度)</span>
          </div>
          <span className="text-[11px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
            深浅让步测谎
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Early OU */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 space-y-2">
            <div className="text-[11px] font-semibold text-slate-400">早盘大小球 (初盘 / 大小水)</div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">初盘界线</label>
                <input
                  type="text"
                  value={data.overUnder.earlyLine}
                  onChange={(e) => updateOU('earlyLine', e.target.value)}
                  placeholder="2.5"
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-center font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">大球初水</label>
                <input
                  type="number"
                  step="0.01"
                  value={data.overUnder.earlyOverOdds || ''}
                  onChange={(e) => updateOU('earlyOverOdds', parseFloat(e.target.value))}
                  placeholder="1.95"
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-center font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">小球初水</label>
                <input
                  type="number"
                  step="0.01"
                  value={data.overUnder.earlyUnderOdds || ''}
                  onChange={(e) => updateOU('earlyUnderOdds', parseFloat(e.target.value))}
                  placeholder="1.85"
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-center font-mono text-white"
                />
              </div>
            </div>
          </div>

          {/* Late OU */}
          <div className="bg-slate-950/80 border border-amber-950/60 rounded-lg p-3 space-y-2 ring-1 ring-amber-500/20">
            <div className="text-[11px] font-semibold text-amber-400">临场晚盘大小球 (即时盘 / 水位)</div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] text-slate-400 mb-0.5">即时界线</label>
                <input
                  type="text"
                  value={data.overUnder.lateLine}
                  onChange={(e) => updateOU('lateLine', e.target.value)}
                  placeholder="2.5"
                  className="w-full bg-slate-900 border border-amber-500/40 rounded px-2 py-1 text-xs text-center font-mono text-white font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-0.5">大球即时水</label>
                <input
                  type="number"
                  step="0.01"
                  value={data.overUnder.lateOverOdds || ''}
                  onChange={(e) => updateOU('lateOverOdds', parseFloat(e.target.value))}
                  placeholder="1.82"
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-center font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-0.5">小球即时水</label>
                <input
                  type="number"
                  step="0.01"
                  value={data.overUnder.lateUnderOdds || ''}
                  onChange={(e) => updateOU('lateUnderOdds', parseFloat(e.target.value))}
                  placeholder="2.02"
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-center font-mono text-white"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Quick OU shortcuts */}
        <div className="flex items-center gap-1 overflow-x-auto text-[10px] pt-1">
          <span className="text-slate-500 whitespace-nowrap">进球数快选:</span>
          {COMMON_OU_LINES.map((line) => (
            <button
              key={line}
              type="button"
              onClick={() => updateOU('lateLine', line)}
              className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono"
            >
              {line}
            </button>
          ))}
        </div>
      </div>

      {/* Main Submit Action */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={onSubmit}
          disabled={isLoading}
          className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:via-teal-400 hover:to-cyan-400 text-slate-950 font-extrabold text-sm shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2 transform active:scale-[0.99] transition-all disabled:opacity-50 cursor-pointer"
        >
          {isLoading ? (
            <>
              <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              <span>精算师博弈论测谎中 (Gemini 大模型 + 财富经五大模型)...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              <span>启动《财富经》三维联动测谎精算 · 直击大庄底牌</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </>
          )}
        </button>

        {batchCount > 1 && onBatchAnalyzeAll && (
          <button
            type="button"
            onClick={onBatchAnalyzeAll}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-850 text-cyan-400 border border-cyan-500/40 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow"
          >
            <Layers className="w-4 h-4 text-cyan-400" />
            <span>
              ⚡ 一键批量测谎并全量渲染当前队列 ({batchCount} 场比赛免反复启动)
            </span>
          </button>
        )}
      </div>
    </div>
  );
};
