import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Target,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
  Flame,
  Scale,
  Brain,
  Zap,
  TrendingDown,
  Info,
  Code,
  Eye,
  Download,
  FileText,
  ArrowRight,
  Sparkles,
  Layers,
  CheckSquare,
  Square,
  Maximize2,
  Minimize2,
  Filter,
} from 'lucide-react';
import { AnalysisReportResult, FullMatchData, BatchMatchItem } from '../types/fortuneActuary';
import { MarkdownView } from './MarkdownView';
import { generateMatchMarkdown } from '../utils/textParser';
import { generateActuarialRuleReport } from '../utils/actuaryEngine';

interface ActuarialReportProps {
  report: AnalysisReportResult;
  rawAiText?: string;
  matchData: FullMatchData;
  isLoading: boolean;
  onNavigateToReview?: () => void;
  batchQueue?: BatchMatchItem[];
  onSelectMatch?: (match: FullMatchData) => void;
  reportMode?: 'single' | 'batch';
  onReportModeChange?: (mode: 'single' | 'batch') => void;
  isFullWidth?: boolean;
  onToggleFullWidth?: () => void;
}

export const ActuarialReport: React.FC<ActuarialReportProps> = ({
  report,
  rawAiText,
  matchData,
  isLoading,
  onNavigateToReview,
  batchQueue = [],
  onSelectMatch,
  reportMode: controlledReportMode,
  onReportModeChange,
  isFullWidth = false,
  onToggleFullWidth,
}) => {
  const [copied, setCopied] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const [viewMode, setViewMode] = useState<'rendered' | 'markdown'>('rendered');
  const [internalReportMode, setInternalReportMode] = useState<'single' | 'batch'>('single');
  const [selectedMatchIds, setSelectedMatchIds] = useState<string[]>([]);

  const reportMode = controlledReportMode !== undefined ? controlledReportMode : internalReportMode;
  const setReportMode = (mode: 'single' | 'batch') => {
    setInternalReportMode(mode);
    onReportModeChange?.(mode);
  };

  // Initialize selectedMatchIds with all batchQueue matches
  useEffect(() => {
    if (batchQueue && batchQueue.length > 0) {
      setSelectedMatchIds((prev) => (prev.length === 0 ? batchQueue.map((b) => b.id) : prev));
    }
  }, [batchQueue]);

  const fullMarkdownContent = generateMatchMarkdown(matchData, report, rawAiText);

  const handleCopyMarkdown = () => {
    navigator.clipboard.writeText(fullMarkdownContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadMarkdown = () => {
    const blob = new Blob([fullMarkdownContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `财富经研判_${matchData.matchInfo.homeTeam}vs${matchData.matchInfo.awayTeam}_${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleMatchSelection = (id: string) => {
    setSelectedMatchIds((prev) =>
      prev.includes(id) ? prev.filter((mId) => mId !== id) : [...prev, id]
    );
  };

  // Copy Markdown for all selected matches
  const handleCopyAllSelectedMarkdown = () => {
    const selectedItems = batchQueue.filter((b) => selectedMatchIds.includes(b.id));
    if (selectedItems.length === 0) return;

    const allMd = selectedItems
      .map((item, idx) => {
        const rep = item.report || generateActuarialRuleReport(item.data);
        return `## 【第 ${idx + 1} 场】${item.data.matchInfo.homeTeam} vs ${item.data.matchInfo.awayTeam}\n` + generateMatchMarkdown(item.data, rep, item.rawAiText);
      })
      .join('\n\n---\n\n');

    navigator.clipboard.writeText(allMd);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const getModelBadge = (model: string) => {
    switch (model) {
      case 'POSITIVE_CONTROL':
        return {
          label: '【极限榨水 / 正向控赔】',
          bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
          desc: '欧降亚砸极低水，正路稳胆',
        };
      case 'HIGH_INTEREST_TRAP':
        return {
          label: '【高息吸筹 / 名气诱导】',
          bg: 'bg-rose-500/15 text-rose-400 border-rose-500/40',
          desc: '名气拉满升盘满水，大热必死坚决去下盘',
        };
      case 'AVALANCHE_RETREAT':
        return {
          label: '【雪崩退盘 / 退热示弱】',
          bg: 'bg-purple-500/15 text-purple-400 border-purple-500/40',
          desc: '临场退盘升水，核心利空坐实跟退盘',
        };
      case 'LOW_DRAW_DEFENSE':
        return {
          label: '【平赔低洼 / 平赔排雷】',
          bg: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/40',
          desc: '平赔死压<3.00，浅盘绝对防平首选胆平',
        };
      case 'SHALLOW_FULL_WATER':
        return {
          label: '【浅盘满水死亡】',
          bg: 'bg-amber-500/15 text-amber-400 border-amber-500/40',
          desc: '主队无力平半挂满水，买得舒服必丢分走下盘',
        };
      default:
        return {
          label: '【博弈调仓中性盘】',
          bg: 'bg-slate-800 text-slate-300 border-slate-700',
          desc: '临场资金博弈胶着',
        };
    }
  };

  const modelBadge = getModelBadge(report.identifiedModel);

  return (
    <div className="space-y-4">
      {/* Batch Mode Switcher Bar */}
      {batchQueue && batchQueue.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs shadow-md">
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => setReportMode('single')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-extrabold transition-all cursor-pointer ${
                reportMode === 'single'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>📄 单场精修台 (双栏同步)</span>
            </button>
            <button
              type="button"
              onClick={() => setReportMode('batch')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-extrabold transition-all cursor-pointer ${
                reportMode === 'batch'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>📑 批量透视流 (独立全屏页面 · 已选 {selectedMatchIds.length} 场)</span>
            </button>
          </div>

          {reportMode === 'batch' ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-emerald-400 font-mono hidden md:inline">
                ✨ 独立页面模式：已隐藏左侧单场输入台，数据全屏对齐
              </span>
              <button
                type="button"
                onClick={() => setReportMode('single')}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold transition-colors cursor-pointer"
              >
                <span>返回单场精修</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="text-[11px] text-slate-400 font-mono hidden sm:block">
              当前展示：{matchData.matchInfo.homeTeam} vs {matchData.matchInfo.awayTeam}
            </div>
          )}
        </div>
      )}

      {/* ==================== BATCH REPORT STREAM VIEW ==================== */}
      {reportMode === 'batch' && (
        <div className="space-y-4">
          {/* Multi-Select Filter Toolbar */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-3 shadow-md">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-white text-xs">勾选批量展示测谎：</span>
                <span className="text-[11px] text-emerald-400 font-mono font-bold">
                  已勾选 {selectedMatchIds.length} / {batchQueue.length} 场
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (selectedMatchIds.length === batchQueue.length) {
                      setSelectedMatchIds([]);
                    } else {
                      setSelectedMatchIds(batchQueue.map((b) => b.id));
                    }
                  }}
                  className="text-[11px] font-bold text-emerald-400 hover:underline cursor-pointer"
                >
                  {selectedMatchIds.length === batchQueue.length ? '取消全选' : '全选所有场次'}
                </button>
                <button
                  type="button"
                  onClick={handleCopyAllSelectedMarkdown}
                  className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 cursor-pointer"
                >
                  {copiedAll ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">已复制所选合辑</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-emerald-400" />
                      <span>复制所选 Markdown</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Checkbox Chips */}
            <div className="flex flex-wrap gap-2">
              {batchQueue.map((item, idx) => {
                const isChecked = selectedMatchIds.includes(item.id);
                const rep = item.report || generateActuarialRuleReport(item.data);
                const b = getModelBadge(rep.identifiedModel);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleMatchSelection(item.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
                      isChecked
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/50 shadow-sm'
                        : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-300'
                    }`}
                  >
                    {isChecked ? (
                      <CheckSquare className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    )}
                    <span>
                      #{idx + 1} {item.data.matchInfo.homeTeam} vs {item.data.matchInfo.awayTeam}
                    </span>
                    <span className="text-[10px] text-slate-400 font-normal">({b.label.slice(1, 5)})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cards for each selected match */}
          {batchQueue
            .filter((item) => selectedMatchIds.includes(item.id))
            .map((item, idx) => {
              const rep = item.report || generateActuarialRuleReport(item.data);
              const mData = item.data;
              const badge = getModelBadge(rep.identifiedModel);

              return (
                <div
                  key={item.id}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4 relative overflow-hidden"
                >
                  {/* Card Header */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        #{idx + 1} 场
                      </span>
                      <h3 className="text-base font-black text-white">
                        {mData.matchInfo.homeTeam} VS {mData.matchInfo.awayTeam}
                      </h3>
                      <span className="text-xs text-slate-400 font-mono">
                        ({mData.matchInfo.league || '常规联赛'} {mData.matchInfo.matchTime || '临场'})
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold border ${badge.bg}`}>
                        {badge.label}
                      </span>
                      {onSelectMatch && (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectMatch(mData);
                            setReportMode('single');
                          }}
                          className="px-2.5 py-1 text-xs font-bold bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-slate-200 rounded border border-slate-700 transition-colors inline-flex items-center gap-1 cursor-pointer"
                        >
                          <span>设为单场精修</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Decision Summary Strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                      <div className="text-[10px] text-slate-400">胜平负首选</div>
                      <div className="font-extrabold text-emerald-400 mt-0.5 truncate">
                        {rep.decision.euroPick}
                      </div>
                    </div>
                    <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                      <div className="text-[10px] text-slate-400">让球首选</div>
                      <div className="font-extrabold text-cyan-400 mt-0.5 truncate">
                        {rep.decision.handicapPick}
                      </div>
                    </div>
                    <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                      <div className="text-[10px] text-slate-400">大小球首选</div>
                      <div className="font-extrabold text-amber-400 mt-0.5 truncate">
                        {rep.decision.overUnderPick}
                      </div>
                    </div>
                    <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                      <div className="text-[10px] text-slate-400">参考比分</div>
                      <div className="flex items-center gap-1 mt-0.5 font-mono">
                        {rep.decision.predictedScores.slice(0, 3).map((s) => (
                          <span
                            key={s}
                            className="px-1.5 py-0.2 bg-slate-900 border border-slate-700 rounded text-slate-200 text-[10px] font-bold"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 3 Dimension Report Sections */}
                  <div className="space-y-3 pt-1">
                    {/* 1. 【盘面第一印象】 */}
                    <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/80 text-xs">
                      <div className="flex items-center gap-1.5 font-bold text-emerald-400 mb-1">
                        <span className="w-4 h-4 rounded bg-emerald-500/20 flex items-center justify-center text-[10px]">1</span>
                        <span>【盘面第一印象】：操盘定性与早晚盘变轨意图</span>
                      </div>
                      <MarkdownView content={rep.firstImpression} />
                    </div>

                    {/* 2. 【三维联动测谎】 */}
                    <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/80 text-xs">
                      <div className="flex items-center gap-1.5 font-bold text-cyan-400 mb-1">
                        <span className="w-4 h-4 rounded bg-cyan-500/20 flex items-center justify-center text-[10px]">2</span>
                        <span>【三维联动测谎】：交叉验证亚盘水位、欧赔走势与大小球</span>
                      </div>
                      <MarkdownView content={rep.threeDimLieDetection} />
                    </div>

                    {/* 3. 【财富经最终判定】 */}
                    <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-lg p-3 text-xs space-y-2">
                      <div className="flex items-center gap-1.5 font-black text-emerald-300">
                        <span className="w-4 h-4 rounded bg-emerald-500 text-slate-950 flex items-center justify-center text-[10px]">3</span>
                        <span>【财富经最终判定】</span>
                      </div>
                      <div className="text-sm font-black text-emerald-400">
                        <MarkdownView content={rep.finalVerdict.direction} />
                      </div>
                      <div className="text-[11px] text-slate-300 font-mono">
                        {rep.finalVerdict.directionDetail}
                      </div>
                      <div className="bg-rose-950/40 border border-rose-500/30 rounded p-2 text-[11px] text-rose-200 mt-1">
                        <span className="font-bold text-rose-400 mr-1">⚠️ 避坑风险提示：</span>
                        <MarkdownView content={rep.finalVerdict.riskWarning} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* ==================== SINGLE MATCH REPORT VIEW ==================== */}
      {reportMode === 'single' && (
        <>
          {/* Top Banner: Identified Model & Verdict Highlights */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3 mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-mono">
                {matchData.matchInfo.league || '常规联赛'} · 精算解剖报告
              </span>
              <span className={`px-2 py-0.5 rounded text-xs font-bold border ${modelBadge.bg}`}>
                {modelBadge.label}
              </span>
            </div>
            <h2 className="text-lg font-black text-white tracking-wide mt-1">
              {matchData.matchInfo.homeTeam} VS {matchData.matchInfo.awayTeam}
            </h2>
          </div>

          {/* Mode Switcher & Export Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setViewMode('rendered')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
                  viewMode === 'rendered'
                    ? 'bg-slate-800 text-emerald-400 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>精算渲染</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('markdown')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
                  viewMode === 'markdown'
                    ? 'bg-slate-800 text-emerald-400 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Code className="w-3.5 h-3.5" />
                <span>Markdown 源码</span>
              </button>
            </div>

            <button
              onClick={handleCopyMarkdown}
              title="一键复制标准 Markdown 格式"
              className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-colors cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">已复制 MD</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>复制 Markdown</span>
                </>
              )}
            </button>

            <button
              onClick={handleDownloadMarkdown}
              title="下载为 .md 文件"
              className="p-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white text-xs rounded-lg border border-slate-700 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Quick metrics grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
          <div className="bg-slate-950/60 border border-slate-800/70 p-2 rounded-lg">
            <div className="text-slate-400 text-[10px]">即时亚指让步</div>
            <div className="font-bold text-white font-mono mt-0.5">
              {matchData.asianHandicap.lateHandicap} ({matchData.asianHandicap.lateHomeOdds.toFixed(2)})
            </div>
          </div>
          <div className="bg-slate-950/60 border border-slate-800/70 p-2 rounded-lg">
            <div className="text-slate-400 text-[10px]">即时欧指胜平负</div>
            <div className="font-bold text-cyan-400 font-mono mt-0.5">
              {matchData.euroOdds.lateWin.toFixed(2)} / {matchData.euroOdds.lateDraw.toFixed(2)} / {matchData.euroOdds.lateLoss.toFixed(2)}
            </div>
          </div>
          <div className="bg-slate-950/60 border border-slate-800/70 p-2 rounded-lg">
            <div className="text-slate-400 text-[10px]">即时大小球界线</div>
            <div className="font-bold text-amber-400 font-mono mt-0.5">
              {matchData.overUnder.lateLine} 球
            </div>
          </div>
          <div className="bg-slate-950/60 border border-slate-800/70 p-2 rounded-lg">
            <div className="text-slate-400 text-[10px]">操盘模型底牌</div>
            <div className="font-bold text-emerald-400 truncate mt-0.5">
              {modelBadge.desc.split('，')[0]}
            </div>
          </div>
        </div>
      </div>

      {/* RAW MARKDOWN SOURCE VIEW */}
      {viewMode === 'markdown' ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800/80 pb-2">
            <span className="font-mono text-emerald-400 font-bold flex items-center gap-1.5">
              <FileText className="w-4 h-4" />
              <span>标准 Markdown 源码 (.md)</span>
            </span>
            <span className="text-[11px] text-slate-500 font-mono">
              可直接粘贴至 Obsidian / Notion / 微信公众号 / GitHub
            </span>
          </div>
          <textarea
            readOnly
            value={fullMarkdownContent}
            rows={18}
            className="w-full bg-slate-950 text-slate-200 font-mono text-xs p-3.5 rounded-lg border border-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 leading-relaxed selection:bg-emerald-500 selection:text-slate-950"
          />
        </div>
      ) : (
        /* RENDERED MARKDOWN VIEW WITH THE 3 SECTIONS */
        <div className="space-y-4">
          {/* Section 1: 【盘面第一印象】 */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm relative">
            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-800/80">
              <div className="w-6 h-6 rounded-md bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs font-mono">
                1
              </div>
              <h3 className="text-sm font-extrabold text-white tracking-tight">
                【盘面第一印象】：操盘定性与早晚盘变轨意图
              </h3>
            </div>
            <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/60">
              <MarkdownView content={report.firstImpression} />
            </div>
          </div>

          {/* Section 2: 【三维联动测谎】 */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm relative">
            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-800/80">
              <div className="w-6 h-6 rounded-md bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-xs font-mono">
                2
              </div>
              <h3 className="text-sm font-extrabold text-white tracking-tight">
                【三维联动测谎】：交叉验证亚盘水位、欧赔走势与大小球
              </h3>
            </div>
            <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/60">
              <MarkdownView content={report.threeDimLieDetection} />
            </div>
          </div>

          {/* Section 3: 【财富经最终判定】 */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-950 border-2 border-emerald-500/40 rounded-xl p-4 shadow-xl relative ring-1 ring-emerald-500/20">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-800">
              <div className="w-6 h-6 rounded-md bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 flex items-center justify-center font-black text-xs font-mono">
                3
              </div>
              <h3 className="text-sm font-extrabold text-white tracking-tight flex items-center gap-2">
                <span>【财富经最终判定】</span>
                <span className="text-[11px] font-normal text-emerald-400">
                  直击大庄不赔钱底牌
                </span>
              </h3>
            </div>

            <div className="space-y-3">
              {/* Primary Recommended Direction */}
              <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-lg p-3">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1">
                  <Target className="w-4 h-4 text-emerald-400" />
                  <span>核心推荐方向</span>
                </div>
                <div className="text-base sm:text-lg font-black text-emerald-300 tracking-wide">
                  <MarkdownView content={report.finalVerdict.direction} />
                </div>
                <div className="text-xs text-slate-300 mt-1 font-mono">
                  {report.finalVerdict.directionDetail}
                </div>
              </div>

              {/* Risk Warning Box */}
              <div className="bg-rose-950/30 border border-rose-500/30 rounded-lg p-3">
                <div className="flex items-center gap-2 text-xs font-bold text-rose-400 uppercase tracking-wider mb-1">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  <span>《财富经》避坑风险提示</span>
                </div>
                <div className="text-xs sm:text-sm text-rose-200 leading-relaxed">
                  <MarkdownView content={report.finalVerdict.riskWarning} />
                </div>
              </div>
            </div>
          </div>

          {/* AI Raw commentary in Markdown */}
          {rawAiText && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-2">
                <Brain className="w-4 h-4 text-emerald-400" />
                <span>Gemini 3.8 Flash 精算师深度博弈论推演全景 (Markdown 原生渲染)</span>
              </div>
              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800/80">
                <MarkdownView content={rawAiText} />
              </div>
            </div>
          )}

          {/* Quick Post-Match Review Trigger */}
          {onNavigateToReview && (
            <div className="bg-gradient-to-r from-slate-900 to-slate-950 border border-emerald-500/30 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-extrabold text-white flex items-center gap-1.5">
                    <span>比赛已完场？立即开启《财富经》赛后复盘与经验提炼</span>
                    <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-mono">
                      自动升级
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    录入实际完场比分，系统即时核验欧亚大小球预测吻合度，提炼新法则注入知识库！
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onNavigateToReview}
                className="px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs inline-flex items-center gap-1 shadow-md cursor-pointer whitespace-nowrap self-start sm:self-auto"
              >
                <span>立即复盘本场</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
        </>
      )}
    </div>
  );
};
