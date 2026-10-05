import React, { useState, useMemo } from 'react';
import {
  Layers,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Play,
  Trash2,
  Download,
  Flame,
  Plus,
  Sparkles,
  Star,
  Target,
  FileSpreadsheet,
  FileText,
  Eye,
  Check,
  Percent,
  BarChart3,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  SlidersHorizontal,
} from 'lucide-react';
import { BatchMatchItem, FullMatchData } from '../types/fortuneActuary';
import { generateActuarialRuleReport } from '../utils/actuaryEngine';
import { MarkdownView } from './MarkdownView';
import { HandicapOddsDistributionChart } from './HandicapOddsDistributionChart';

interface BatchMatrixDashboardProps {
  queue: BatchMatchItem[];
  onSelectMatch: (match: FullMatchData) => void;
  onClearQueue: () => void;
  onOpenUploadModal: () => void;
  onBatchAnalyzeAll: () => Promise<void>;
  isBatchAnalyzing: boolean;
}

export const BatchMatrixDashboard: React.FC<BatchMatrixDashboardProps> = ({
  queue,
  onSelectMatch,
  onClearQueue,
  onOpenUploadModal,
  onBatchAnalyzeAll,
  isBatchAnalyzing,
}) => {
  const [viewStyle, setViewStyle] = useState<'matrix' | 'cards'>('matrix');
  const [starFilter, setStarFilter] = useState<number | 'ALL'>('ALL');
  const [sortBy, setSortBy] = useState<'stars' | 'time' | 'default'>('stars');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [copiedBatch, setCopiedBatch] = useState(false);
  const [showD3Chart, setShowD3Chart] = useState(true);

  const getBadgeForModel = (model: string) => {
    switch (model) {
      case 'POSITIVE_CONTROL':
        return { text: '极限榨水', cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' };
      case 'HIGH_INTEREST_TRAP':
        return { text: '高息诱上', cls: 'bg-rose-500/20 text-rose-400 border-rose-500/40' };
      case 'AVALANCHE_RETREAT':
        return { text: '雪崩退盘', cls: 'bg-purple-500/20 text-purple-400 border-purple-500/40' };
      case 'LOW_DRAW_DEFENSE':
        return { text: '平赔低洼', cls: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40' };
      case 'SHALLOW_FULL_WATER':
        return { text: '浅盘满水', cls: 'bg-amber-500/20 text-amber-400 border-amber-500/40' };
      default:
        return { text: '博弈调仓', cls: 'bg-slate-800 text-slate-400 border-slate-700' };
    }
  };

  const renderStarRating = (stars: number) => {
    return (
      <div className="flex items-center gap-0.5 text-amber-400">
        {[1, 2, 3, 4, 5].map((s) => (
          <Star
            key={s}
            className={`w-3.5 h-3.5 ${
              s <= stars ? 'fill-amber-400 text-amber-400' : 'text-slate-700 fill-slate-800'
            }`}
          />
        ))}
      </div>
    );
  };

  // Pre-process all items with computed actuarial reports
  const processedItems = useMemo(() => {
    return queue.map((item, originalIndex) => {
      const report = item.report || generateActuarialRuleReport(item.data);
      const dec = report.decision;
      const model = report.identifiedModel;
      const time = item.data.matchInfo.matchTime || '99:99';
      return {
        item,
        originalIndex,
        report,
        dec,
        model,
        time,
        stars: dec.starRating,
      };
    });
  }, [queue]);

  const fiveStarCount = useMemo(() => processedItems.filter((p) => p.stars === 5).length, [processedItems]);
  const fourStarCount = useMemo(() => processedItems.filter((p) => p.stars === 4).length, [processedItems]);
  const threeStarCount = useMemo(() => processedItems.filter((p) => p.stars === 3).length, [processedItems]);

  // Apply star filter
  const filteredItems = useMemo(() => {
    if (starFilter === 'ALL') return processedItems;
    return processedItems.filter((p) => p.stars === starFilter);
  }, [processedItems, starFilter]);

  // Apply sorting (stars, time, default)
  const sortedItems = useMemo(() => {
    const list = [...filteredItems];
    list.sort((a, b) => {
      if (sortBy === 'stars') {
        const starDiff = sortOrder === 'desc' ? b.stars - a.stars : a.stars - b.stars;
        if (starDiff !== 0) return starDiff;

        // Sub-sort by model significance:
        // 5星优先: 极限榨水 (稳胆) -> 平赔低洼 (胆平) -> 高息吸筹 (杀猪盘反选) -> 浅盘满水
        const modelRank = (m: string) => {
          if (m === 'POSITIVE_CONTROL') return 4;
          if (m === 'LOW_DRAW_DEFENSE') return 3;
          if (m === 'HIGH_INTEREST_TRAP') return 2;
          if (m === 'SHALLOW_FULL_WATER') return 1;
          return 0;
        };
        const mDiff = modelRank(b.model) - modelRank(a.model);
        if (mDiff !== 0) return mDiff;

        // Then by kick-off time
        return a.time.localeCompare(b.time);
      }

      if (sortBy === 'time') {
        const tCmp = a.time.localeCompare(b.time);
        return sortOrder === 'desc' ? -tCmp : tCmp;
      }

      // Default: original input order
      return sortOrder === 'desc'
        ? b.originalIndex - a.originalIndex
        : a.originalIndex - b.originalIndex;
    });
    return list;
  }, [filteredItems, sortBy, sortOrder]);

  const toggleSort = (field: 'stars' | 'time' | 'default') => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const handleExportMarkdownSummary = () => {
    if (sortedItems.length === 0) return;
    let md = `# 《财富经》足彩批量决策大盘报告汇总 (${sortedItems.length} 场)\n\n`;
    md += `> **生成时间**：${new Date().toLocaleString()} ｜ **排序**：${
      sortBy === 'stars'
        ? sortOrder === 'desc'
          ? '推荐星级从高到低 (5星稳胆优先)'
          : '推荐星级从低到高'
        : sortBy === 'time'
        ? '开赛时间排序'
        : '原始导入顺序'
    }\n\n`;
    md += `| 推荐星级 | 联赛/对阵 | 胜平负首选 | 让球首选 | 大小球首选 | 参考比分 | 操盘定性 | 避坑风险提示 |\n`;
    md += `| :---: | :--- | :---: | :--- | :---: | :---: | :---: | :--- |\n`;

    sortedItems.forEach(({ item, report, dec }) => {
      const starStr = '★'.repeat(dec.starRating) + '☆'.repeat(5 - dec.starRating);
      md += `| ${starStr} | **${item.data.matchInfo.homeTeam}** vs **${item.data.matchInfo.awayTeam}** (${item.data.matchInfo.league}) | **${dec.euroPick}** | \`${dec.handicapPick}\` | ${dec.overUnderPick} | ${dec.predictedScores.join(', ')} | **${report.modelTitle}** | ${report.finalVerdict.riskWarning} |\n`;
    });

    md += `\n---\n\n## 逐场深度《财富经》三维测谎诊断\n\n`;
    sortedItems.forEach(({ item, report }, idx) => {
      md += `### 【${idx + 1}】${item.data.matchInfo.homeTeam} vs ${item.data.matchInfo.awayTeam} (${item.data.matchInfo.league})\n\n`;
      md += `1. **【盘面第一印象】**\n${report.firstImpression}\n\n`;
      md += `2. **【三维联动测谎】**\n${report.threeDimLieDetection}\n\n`;
      md += `3. **【财富经最终判定】**\n- **推荐方向**：${report.finalVerdict.direction}\n- **比分细化**：${report.finalVerdict.directionDetail}\n- **避坑提示**：${report.finalVerdict.riskWarning}\n\n---\n\n`;
    });

    navigator.clipboard.writeText(md);
    setCopiedBatch(true);
    setTimeout(() => setCopiedBatch(false), 2000);
  };

  if (queue.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-slate-800 text-emerald-400 flex items-center justify-center mx-auto shadow-inner">
          <Layers className="w-7 h-7" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-white">批量决策队列池为空</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
            您可以点击“上传附件”上传赔率截图、导入快照文件或粘贴多场比赛。导入后支持一键批量测谎输出：推荐星级、胜平负首选、让球首选、大小球首选与参考比分！
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenUploadModal}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs rounded-lg shadow-lg inline-flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>立即上传截图或导入批量文件</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* PROMINENT BATCH ANALYZE ACTION BUTTON (Directly addressing user's request) */}
      <div className="bg-slate-900/90 border border-emerald-500/30 rounded-xl p-3.5 shadow-xl">
        <button
          type="button"
          onClick={onBatchAnalyzeAll}
          disabled={isBatchAnalyzing}
          className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:via-teal-400 hover:to-cyan-400 text-slate-950 font-black text-sm shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-2 transform active:scale-[0.99] transition-all disabled:opacity-50 cursor-pointer"
        >
          {isBatchAnalyzing ? (
            <>
              <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              <span>《财富经》全量批处理测谎中... 已处理 {queue.length} 场</span>
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5 text-slate-950" />
              <span>
                ⚡ 批量一键启动《财富经》全量测谎精算 · 批量渲染全部 {queue.length} 场
              </span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </>
          )}
        </button>

        <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 px-1">
          <span className="flex items-center gap-1 text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>自动输出：推荐星级 · 胜平负首选 · 让球首选 · 大小球首选 · 参考比分</span>
          </span>
          <span className="text-cyan-400 font-mono">
            单场上下文隔离 · 0% Token 污染
          </span>
        </div>
      </div>

      {/* Control Bar: View Switcher, Star Filters & Actions */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-md">
        {/* View Mode Toggle */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setViewStyle('matrix')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                viewStyle === 'matrix'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>📊 批量决策大盘表</span>
            </button>
            <button
              type="button"
              onClick={() => setViewStyle('cards')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                viewStyle === 'cards'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>📑 全量卡片流批量渲染</span>
            </button>
          </div>

          {/* D3 Distribution Chart Toggle */}
          <button
            type="button"
            onClick={() => setShowD3Chart(!showD3Chart)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
              showD3Chart
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>{showD3Chart ? '收起 D3 概率趋势图' : '展现 D3 盘口概率趋势图'}</span>
          </button>

          {/* Star Filter Pills */}
          <div className="flex items-center gap-1 text-xs">
            <button
              onClick={() => setStarFilter('ALL')}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                starFilter === 'ALL'
                  ? 'bg-slate-800 text-white border border-slate-600 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              全部 ({queue.length})
            </button>
            <button
              onClick={() => setStarFilter(5)}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                starFilter === 5
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              ★★★★★ 5星 ({fiveStarCount})
            </button>
            <button
              onClick={() => setStarFilter(4)}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                starFilter === 4
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              ★★★★ 4星 ({fourStarCount})
            </button>
          </div>

          {/* Quick Sorting Pills */}
          <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs">
            <span className="text-[10px] text-slate-500 font-bold px-1 flex items-center gap-0.5">
              <SlidersHorizontal className="w-3 h-3 text-cyan-400" />
              <span>排序</span>
            </span>
            <button
              type="button"
              onClick={() => toggleSort('stars')}
              className={`px-2 py-1 rounded text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                sortBy === 'stars'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="按星级高低排序（5星稳胆优先）"
            >
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              <span>星级优先</span>
              {sortBy === 'stars' && (
                sortOrder === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />
              )}
            </button>
            <button
              type="button"
              onClick={() => toggleSort('time')}
              className={`px-2 py-1 rounded text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                sortBy === 'time'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="按开赛时间排序"
            >
              <span>开赛时间</span>
              {sortBy === 'time' && (
                sortOrder === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />
              )}
            </button>
            <button
              type="button"
              onClick={() => toggleSort('default')}
              className={`px-2 py-1 rounded text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                sortBy === 'default'
                  ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="按原始导入序号排序"
            >
              <span>原始序号</span>
              {sortBy === 'default' && (
                sortOrder === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />
              )}
            </button>
          </div>
        </div>

        {/* Export and Clear buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportMarkdownSummary}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-colors cursor-pointer"
          >
            {copiedBatch ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">已复制排序后 Markdown</span>
              </>
            ) : (
              <>
                <FileText className="w-3.5 h-3.5 text-emerald-400" />
                <span>复制批量 Markdown 汇总</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onClearQueue}
            className="p-1.5 text-slate-400 hover:text-rose-400 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors"
            title="清空队列"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Sorting Status Summary Banner */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 text-xs flex items-center justify-between flex-wrap gap-2 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-slate-300">
            {sortBy === 'stars' ? (
              <>
                当前已按 <strong className="text-amber-400 font-bold">{sortOrder === 'desc' ? '星级从高到低 (5星稳胆优先)' : '星级从低到高'}</strong> 自动精选排序
                {sortOrder === 'desc' && (
                  <span className="text-slate-400 ml-1.5">
                    — 前 <strong className="text-amber-300 font-extrabold">{fiveStarCount}</strong> 场为 5 星级核心决策赛事（极限榨水正路稳胆 / 平赔低洼精准胆平），后 <strong className="text-slate-300">{threeStarCount}</strong> 场为 3 星级博弈调仓盘
                  </span>
                )}
              </>
            ) : sortBy === 'time' ? (
              <>
                当前已按 <strong className="text-cyan-400 font-bold">开赛时间 ({sortOrder === 'desc' ? '由晚到早' : '由早到晚'})</strong> 排序
              </>
            ) : (
              <>
                当前按 <strong className="text-slate-200 font-bold">原始导入录入顺序</strong> 呈现
              </>
            )}
          </span>
        </div>
        <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2">
          <span>共 <strong className="text-white">{sortedItems.length}</strong> 场</span>
          <span>｜</span>
          <span className="text-amber-400 font-bold">5星: {fiveStarCount} 场</span>
          <span>｜</span>
          <span className="text-emerald-400">4星: {fourStarCount} 场</span>
          <span>｜</span>
          <span className="text-slate-400">3星: {threeStarCount} 场</span>
        </div>
      </div>

      {/* D3.js Visualization: Handicap Odds Distribution Chart */}
      {showD3Chart && (
        <HandicapOddsDistributionChart
          matches={queue.map((q) => q.data)}
        />
      )}

      {/* VIEW STYLE A: BATCH DECISION TABLE */}
      {viewStyle === 'matrix' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[1020px]">
              <thead className="bg-slate-950/90 text-slate-400 text-[11px] uppercase border-b border-slate-800 sticky top-0">
                <tr>
                  <th
                    onClick={() => toggleSort('default')}
                    className="py-3 px-3 w-14 text-center whitespace-nowrap cursor-pointer hover:text-white select-none"
                    title="点击切换原始序号排序"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>#</span>
                      {sortBy === 'default' && (
                        sortOrder === 'desc' ? <ArrowDown className="w-3 h-3 text-cyan-400" /> : <ArrowUp className="w-3 h-3 text-cyan-400" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => toggleSort('stars')}
                    className="py-3 px-3 w-32 whitespace-nowrap cursor-pointer hover:text-amber-300 select-none"
                    title="点击切换星级从高到低/从低到高"
                  >
                    <div className="flex items-center gap-1 font-bold">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      <span className={sortBy === 'stars' ? 'text-amber-300' : ''}>推荐星级</span>
                      {sortBy === 'stars' ? (
                        sortOrder === 'desc' ? (
                          <span className="text-[10px] text-amber-400 font-mono ml-0.5">↓(高)</span>
                        ) : (
                          <span className="text-[10px] text-amber-400 font-mono ml-0.5">↑(低)</span>
                        )
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-600" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => toggleSort('time')}
                    className="py-3 px-4 min-w-[230px] whitespace-nowrap cursor-pointer hover:text-cyan-300 select-none"
                    title="点击按开赛时间排序"
                  >
                    <div className="flex items-center gap-1">
                      <span className={sortBy === 'time' ? 'text-cyan-300 font-bold' : ''}>赛事 / 对阵</span>
                      {sortBy === 'time' ? (
                        sortOrder === 'desc' ? <ArrowDown className="w-3 h-3 text-cyan-400" /> : <ArrowUp className="w-3 h-3 text-cyan-400" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-600" />
                      )}
                    </div>
                  </th>
                  <th className="py-3 px-3 min-w-[120px] whitespace-nowrap">胜平负首选</th>
                  <th className="py-3 px-3 min-w-[160px] whitespace-nowrap">让球首选</th>
                  <th className="py-3 px-3 min-w-[120px] whitespace-nowrap">大小球首选</th>
                  <th className="py-3 px-3 min-w-[130px] whitespace-nowrap">参考比分</th>
                  <th className="py-3 px-3 min-w-[100px] whitespace-nowrap">操盘定性</th>
                  <th className="py-3 px-3 min-w-[100px] text-right whitespace-nowrap">单场穿透</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 font-sans">
                {sortedItems.map(({ item, report, dec, originalIndex }, idx) => {
                  const badge = getBadgeForModel(report.identifiedModel);
                  const isFiveStar = dec.starRating === 5;
                  const isFourStar = dec.starRating === 4;

                  return (
                    <tr
                      key={item.id}
                      onClick={() => onSelectMatch(item.data)}
                      className={`transition-colors group cursor-pointer ${
                        isFiveStar
                          ? 'border-l-4 border-l-amber-400 bg-gradient-to-r from-amber-500/[0.08] via-amber-500/[0.02] to-transparent hover:bg-amber-500/[0.12]'
                          : isFourStar
                          ? 'border-l-4 border-l-emerald-400 bg-gradient-to-r from-emerald-500/[0.05] via-emerald-500/[0.01] to-transparent hover:bg-emerald-500/[0.08]'
                          : 'border-l-4 border-l-slate-800 hover:bg-slate-850/80'
                      }`}
                    >
                      {/* Number & Original Rank */}
                      <td className="py-3 px-3 font-mono text-center">
                        {isFiveStar ? (
                          <div className="font-extrabold text-amber-400 text-xs">
                            TOP {idx + 1}
                          </div>
                        ) : (
                          <div className="font-bold text-slate-400 text-xs">
                            {idx + 1}
                          </div>
                        )}
                        <div className="text-[9px] text-slate-500 font-mono mt-0.5">
                          原#{originalIndex + 1}
                        </div>
                      </td>

                      {/* 1. 推荐星级 */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {renderStarRating(dec.starRating)}
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className={`text-[10px] font-mono ${isFiveStar ? 'text-amber-400 font-bold' : 'text-slate-400'}`}>
                            {dec.starRating}星置信度
                          </span>
                          {isFiveStar && (
                            <span className="px-1 py-0.2 rounded text-[9px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              {report.identifiedModel === 'POSITIVE_CONTROL'
                                ? '稳胆'
                                : report.identifiedModel === 'LOW_DRAW_DEFENSE'
                                ? '胆平'
                                : '核心'}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 赛事对阵 */}
                      <td className="py-3 px-4 min-w-[230px] whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-bold text-white group-hover:text-emerald-300 transition-colors text-xs sm:text-[13px]">
                          <span className="font-extrabold tracking-wide">{item.data.matchInfo.homeTeam}</span>
                          <span className="text-[10px] font-mono text-slate-400 font-semibold px-1 py-0.2 rounded bg-slate-950 border border-slate-800">
                            VS
                          </span>
                          <span className="font-extrabold tracking-wide">{item.data.matchInfo.awayTeam}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-1 font-mono">
                          <span className="px-1.5 py-0.2 rounded bg-slate-800 text-emerald-400 font-semibold border border-slate-700/70">
                            {item.data.matchInfo.league || '常规赛事'}
                          </span>
                          {item.data.matchInfo.matchTime && (
                            <span className="text-slate-300 font-bold">
                              {item.data.matchInfo.matchTime}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 2. 胜平负首选 */}
                      <td className="py-3 px-3 font-bold whitespace-nowrap">
                        <span
                          className={`px-2 py-1 rounded text-xs border ${
                            dec.euroPick.includes('主胜')
                              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                              : dec.euroPick.includes('平')
                              ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
                              : 'bg-rose-500/15 text-rose-300 border-rose-500/40'
                          }`}
                        >
                          {dec.euroPick}
                        </span>
                      </td>

                      {/* 3. 让球首选 */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="font-mono font-bold text-cyan-300">
                          {dec.handicapPick}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          盘口: {item.data.asianHandicap.lateHandicap || '平手'} ｜ 主水 {item.data.asianHandicap.lateHomeOdds.toFixed(2)}
                        </div>
                      </td>

                      {/* 4. 大小球首选 */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`font-mono text-xs font-semibold ${
                            dec.overUnderPick.includes('大') ? 'text-amber-400' : 'text-cyan-400'
                          }`}
                        >
                          {dec.overUnderPick}
                        </span>
                      </td>

                      {/* 5. 参考比分 */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1 font-mono">
                          {dec.predictedScores.slice(0, 3).map((score) => (
                            <span
                              key={score}
                              className="px-1.5 py-0.5 bg-slate-950 text-slate-200 rounded border border-slate-800 text-[11px] font-semibold"
                            >
                              {score}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* 操盘定性 */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${badge.cls}`}>
                          {badge.text}
                        </span>
                      </td>

                      {/* 单场穿透 */}
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectMatch(item.data);
                          }}
                          className="px-2.5 py-1 bg-slate-800 group-hover:bg-emerald-500 group-hover:text-slate-950 text-slate-300 text-[11px] font-bold rounded border border-slate-700 transition-all inline-flex items-center gap-1 cursor-pointer"
                        >
                          <span>深度研判</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW STYLE B: FULL RENDERED STREAM CARDS (Batch-rendered all matches) */}
      {viewStyle === 'cards' && (
        <div className="space-y-6">
          {sortedItems.map(({ item, report: rep, dec, originalIndex }, idx) => {
            const badge = getBadgeForModel(rep.identifiedModel);
            const isFiveStar = dec.starRating === 5;

            return (
              <div
                key={item.id}
                className={`bg-slate-900 border rounded-xl p-5 shadow-lg space-y-4 hover:border-slate-700 transition-all ${
                  isFiveStar
                    ? 'border-amber-500/50 shadow-amber-500/5 bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/10'
                    : 'border-slate-800'
                }`}
              >
                {/* Match Card Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${isFiveStar ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'text-emerald-400 bg-emerald-500/10'}`}>
                        TOP #{idx + 1} 场（原#{originalIndex + 1}）
                      </span>
                      <span className="text-xs text-slate-400 font-medium">
                        {item.data.matchInfo.league} ｜ {item.data.matchInfo.matchTime || '临场'}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs font-bold border ${badge.cls}`}>
                        {badge.text}
                      </span>
                      <div className="ml-1">{renderStarRating(dec.starRating)}</div>
                    </div>
                    <h3 className="text-base font-black text-white mt-1">
                      {item.data.matchInfo.homeTeam} VS {item.data.matchInfo.awayTeam}
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={() => onSelectMatch(item.data)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-slate-200 text-xs font-bold rounded-lg border border-slate-700 transition-colors inline-flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
                  >
                    <span>载入左侧单场精算台</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Batch 5-Core Decision Grid for this Match */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                  {/* 1. 推荐星级 */}
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                    <div className="text-[10px] text-slate-400">推荐星级</div>
                    <div className="mt-1">{renderStarRating(dec.starRating)}</div>
                    <div className="text-[10px] text-amber-400 font-mono mt-0.5">
                      {dec.starRating} 星置信度
                    </div>
                  </div>

                  {/* 2. 胜平负首选 */}
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                    <div className="text-[10px] text-slate-400">胜平负首选</div>
                    <div className="font-black text-emerald-400 text-sm mt-0.5">
                      {dec.euroPick}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                      {item.data.euroOdds.lateWin}/{item.data.euroOdds.lateDraw}/{item.data.euroOdds.lateLoss}
                    </div>
                  </div>

                  {/* 3. 让球首选 */}
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span>让球首选</span>
                      <span className="text-[10px] text-cyan-400 font-mono font-bold bg-cyan-950/60 px-1.5 py-0.2 rounded border border-cyan-800/40">
                        盘口: {item.data.asianHandicap.lateHandicap || '平手'}
                      </span>
                    </div>
                    <div className="font-bold text-cyan-300 text-xs mt-0.5 truncate" title={dec.handicapPick}>
                      {dec.handicapPick}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                      主水 {item.data.asianHandicap.lateHomeOdds.toFixed(2)} ｜ 客水 {item.data.asianHandicap.lateAwayOdds.toFixed(2)}
                    </div>
                  </div>

                  {/* 4. 大小球首选 */}
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                    <div className="text-[10px] text-slate-400">大小球首选</div>
                    <div className="font-bold text-amber-400 text-xs mt-0.5 truncate">
                      {dec.overUnderPick}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                      盘界 {item.data.overUnder.lateLine}
                    </div>
                  </div>

                  {/* 5. 参考比分 */}
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 col-span-2 sm:col-span-1">
                    <div className="text-[10px] text-slate-400">参考比分</div>
                    <div className="flex items-center gap-1 mt-1 font-mono">
                      {dec.predictedScores.map((s) => (
                        <span key={s} className="px-1 py-0.5 bg-slate-900 rounded text-slate-200 text-[10px] font-bold">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 3 Sections Rendered Directly */}
                <div className="space-y-3 pt-1">
                  {/* Section 1 */}
                  <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/60 text-xs">
                    <div className="font-bold text-emerald-400 mb-1">
                      1. 【盘面第一印象】
                    </div>
                    <MarkdownView content={rep.firstImpression} />
                  </div>

                  {/* Section 2 */}
                  <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/60 text-xs">
                    <div className="font-bold text-cyan-400 mb-1">
                      2. 【三维联动测谎】
                    </div>
                    <MarkdownView content={rep.threeDimLieDetection} />
                  </div>

                  {/* Section 3 */}
                  <div className="bg-gradient-to-r from-emerald-950/30 to-slate-950 p-3 rounded-lg border border-emerald-500/30 text-xs space-y-1.5">
                    <div className="font-bold text-white flex items-center justify-between">
                      <span className="text-emerald-300">3. 【财富经最终判定】</span>
                      <span className="text-amber-400 font-normal text-[11px]">
                        {rep.finalVerdict.direction}
                      </span>
                    </div>
                    <div className="text-slate-300 font-mono text-[11px]">
                      {rep.finalVerdict.directionDetail}
                    </div>
                    <div className="text-rose-300 text-[11px] pt-1 border-t border-slate-800/80">
                      <strong>⚠️ 避坑风险提示：</strong>
                      {rep.finalVerdict.riskWarning}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
