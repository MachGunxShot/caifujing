import React, { useState, useEffect } from 'react';
import {
  Calculator,
  Percent,
  TrendingDown,
  TrendingUp,
  Scale,
  ShieldCheck,
  AlertOctagon,
  ArrowRight,
  Flame,
  Layers,
  CheckSquare,
  Square,
  Maximize2,
  Minimize2,
  BarChart3,
  FileSpreadsheet,
  AlertTriangle,
} from 'lucide-react';
import { ActuarialMetrics, FullMatchData, BatchMatchItem } from '../types/fortuneActuary';
import { HandicapOddsDistributionChart } from './HandicapOddsDistributionChart';
import { computeActuarialMetrics, generateActuarialRuleReport } from '../utils/actuaryEngine';

interface DataCalculationsProps {
  metrics: ActuarialMetrics;
  matchData: FullMatchData;
  matches?: FullMatchData[];
  batchQueue?: BatchMatchItem[];
  onSelectMatch?: (match: FullMatchData) => void;
  calcMode?: 'single' | 'batch';
  onCalcModeChange?: (mode: 'single' | 'batch') => void;
  isFullWidth?: boolean;
  onToggleFullWidth?: () => void;
}

export const DataCalculations: React.FC<DataCalculationsProps> = ({
  metrics,
  matchData,
  matches,
  batchQueue = [],
  onSelectMatch,
  calcMode: controlledCalcMode,
  onCalcModeChange,
  isFullWidth = false,
  onToggleFullWidth,
}) => {
  const [internalCalcMode, setInternalCalcMode] = useState<'single' | 'batch'>('single');
  const [selectedMatchIds, setSelectedMatchIds] = useState<string[]>([]);

  const calcMode = controlledCalcMode !== undefined ? controlledCalcMode : internalCalcMode;
  const setCalcMode = (mode: 'single' | 'batch') => {
    setInternalCalcMode(mode);
    onCalcModeChange?.(mode);
  };

  useEffect(() => {
    if (batchQueue && batchQueue.length > 0) {
      setSelectedMatchIds((prev) => (prev.length === 0 ? batchQueue.map((b) => b.id) : prev));
    }
  }, [batchQueue]);

  const toggleMatchSelection = (id: string) => {
    setSelectedMatchIds((prev) =>
      prev.includes(id) ? prev.filter((mId) => mId !== id) : [...prev, id]
    );
  };

  const { earlyWin, earlyDraw, earlyLoss, lateWin, lateDraw, lateLoss } = matchData.euroOdds;
  const earlyMargin = (100 - metrics.earlyReturnRate).toFixed(2);
  const lateMargin = (100 - metrics.lateReturnRate).toFixed(2);

  // Kelly approximations (assuming average payout index ~0.94)
  const homeKelly = ((metrics.lateHomeProb / 100) * lateWin).toFixed(2);
  const drawKelly = ((metrics.lateDrawProb / 100) * lateDraw).toFixed(2);
  const awayKelly = ((metrics.lateAwayProb / 100) * lateLoss).toFixed(2);

  const selectedBatchItems = batchQueue.filter((b) => selectedMatchIds.includes(b.id));

  return (
    <div className="space-y-4">
      {/* Mode Switcher Banner */}
      {batchQueue && batchQueue.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => setCalcMode('single')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                calcMode === 'single'
                  ? 'bg-slate-800 text-slate-50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Calculator className="w-3.5 h-3.5 text-emerald-400" />
              <span>单场精算模型</span>
            </button>
            <button
              type="button"
              onClick={() => setCalcMode('batch')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                calcMode === 'batch'
                  ? 'bg-slate-800 text-slate-50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
              <span>多场横向精算对比 · {selectedMatchIds.length} 场</span>
            </button>
          </div>

          {calcMode === 'batch' ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 hidden md:inline">
                全宽对比视图
              </span>
              <button
                type="button"
                onClick={() => setCalcMode('single')}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-850 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
              >
                <span>返回单场模型</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="text-xs text-slate-400 hidden sm:block truncate max-w-[260px]">
              {matchData.matchInfo.homeTeam} vs {matchData.matchInfo.awayTeam}
            </div>
          )}
        </div>
      )}

      {/* ==================== BATCH MULTI-MATCH COMPARISON MATRIX VIEW ==================== */}
      {calcMode === 'batch' && (
        <div className="space-y-4">
          {/* Multi-Select Filter Toolbar */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-3 shadow-md">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-white text-xs">勾选多场横向精算对比：</span>
                <span className="text-[11px] text-cyan-400 font-mono font-bold">
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
                  className="text-[11px] font-bold text-cyan-400 hover:underline cursor-pointer"
                >
                  {selectedMatchIds.length === batchQueue.length ? '取消全选' : '全选所有场次'}
                </button>
              </div>
            </div>

            {/* Checkbox Chips */}
            <div className="flex flex-wrap gap-2">
              {batchQueue.map((item, idx) => {
                const isChecked = selectedMatchIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleMatchSelection(item.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
                      isChecked
                        ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/50 shadow-sm'
                        : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-300'
                    }`}
                  >
                    {isChecked ? (
                      <CheckSquare className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    )}
                    <span>
                      #{idx + 1} {item.data.matchInfo.homeTeam} vs {item.data.matchInfo.awayTeam}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* D3 Multi-Match Handicap Odds Distribution Chart */}
          <HandicapOddsDistributionChart
            matches={selectedBatchItems.map((b) => b.data)}
            currentMatch={matchData}
          />

          {/* Horizontal Actuarial Metrics Comparison Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
            <div className="p-3 border-b border-slate-800 flex items-center justify-between">
              <h4 className="text-xs font-black text-white flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-cyan-400" />
                <span>多场返还率、抽水比例与凯利指数横向对比矩阵</span>
              </h4>
              <span className="text-[11px] text-slate-400 font-mono">
                红字高亮标出凯利超标(&gt;1.00)风险项
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[950px]">
                <thead className="bg-slate-950 text-slate-400 text-[11px] border-b border-slate-800 font-mono">
                  <tr>
                    <th className="py-2.5 px-3 w-10 text-center">#</th>
                    <th className="py-2.5 px-3">赛事联赛 / 对阵</th>
                    <th className="py-2.5 px-3">晚盘即时盘水</th>
                    <th className="py-2.5 px-3">欧指晚盘胜平负</th>
                    <th className="py-2.5 px-3 text-center">返还率 (早➔晚)</th>
                    <th className="py-2.5 px-3 text-center">机构抽水</th>
                    <th className="py-2.5 px-3 text-center">去水真实概率 (胜/平/负)</th>
                    <th className="py-2.5 px-3 text-center">凯利指数 (主/平/客)</th>
                    <th className="py-2.5 px-3">操盘定性</th>
                    <th className="py-2.5 px-3 text-center">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {selectedBatchItems.map((item, idx) => {
                    const m = item.data;
                    const met = computeActuarialMetrics(m);
                    const rep = item.report || generateActuarialRuleReport(m);

                    const hKelly = ((met.lateHomeProb / 100) * m.euroOdds.lateWin);
                    const dKelly = ((met.lateDrawProb / 100) * m.euroOdds.lateDraw);
                    const aKelly = ((met.lateAwayProb / 100) * m.euroOdds.lateLoss);

                    return (
                      <tr key={item.id} className="hover:bg-slate-850/50 transition-colors">
                        <td className="py-3 px-3 text-center text-slate-500 font-mono">
                          {idx + 1}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-extrabold text-white">
                            {m.matchInfo.homeTeam} <span className="text-slate-500 font-normal">vs</span> {m.matchInfo.awayTeam}
                          </div>
                          <div className="text-[10px] text-cyan-400 font-mono mt-0.5">
                            {m.matchInfo.league || '常规联赛'}
                          </div>
                        </td>
                        <td className="py-3 px-3 font-mono">
                          <span className="font-bold text-white">{m.asianHandicap.lateHandicap}</span>
                          <span className="text-[11px] text-slate-400 block">
                            水 {m.asianHandicap.lateHomeOdds.toFixed(2)} / {m.asianHandicap.lateAwayOdds.toFixed(2)}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono text-cyan-300">
                          {m.euroOdds.lateWin.toFixed(2)} / {m.euroOdds.lateDraw.toFixed(2)} / {m.euroOdds.lateLoss.toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-center font-mono">
                          <span className="text-slate-400">{met.earlyReturnRate.toFixed(1)}%</span>
                          <span className="text-slate-600 mx-1">➔</span>
                          <span className="font-bold text-emerald-400">{met.lateReturnRate.toFixed(1)}%</span>
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-rose-400 font-bold">
                          {(100 - met.lateReturnRate).toFixed(1)}%
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-[11px]">
                          <span className="text-emerald-400">{met.lateHomeProb.toFixed(0)}%</span> /{' '}
                          <span className={met.lateDrawProb > 32 ? 'text-amber-400 font-bold' : 'text-slate-300'}>
                            {met.lateDrawProb.toFixed(0)}%
                          </span> /{' '}
                          <span className="text-cyan-400">{met.lateAwayProb.toFixed(0)}%</span>
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-[11px]">
                          <span className={hKelly >= 0.98 ? 'text-rose-400 font-extrabold bg-rose-950/60 px-1 py-0.5 rounded' : 'text-slate-300'}>
                            {hKelly.toFixed(2)}
                          </span>{' '}
                          <span className={dKelly >= 0.98 ? 'text-amber-400 font-extrabold bg-amber-950/60 px-1 py-0.5 rounded' : 'text-slate-400'}>
                            {dKelly.toFixed(2)}
                          </span>{' '}
                          <span className={aKelly >= 0.98 ? 'text-rose-400 font-extrabold bg-rose-950/60 px-1 py-0.5 rounded' : 'text-slate-300'}>
                            {aKelly.toFixed(2)}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-200 border border-slate-700">
                            {rep.modelTitle}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          {onSelectMatch && (
                            <button
                              type="button"
                              onClick={() => {
                                onSelectMatch(m);
                                setCalcMode('single');
                              }}
                              className="px-2 py-1 text-[11px] font-bold bg-slate-800 hover:bg-cyan-500 hover:text-slate-950 text-slate-300 rounded border border-slate-700 transition-colors inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                            >
                              <span>单场精算</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================== SINGLE MATCH MATH MODELING VIEW ==================== */}
      {calcMode === 'single' && (
        <>
          {/* Quick Match Switcher Banner if multiple matches exist */}
          {batchQueue && batchQueue.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs shadow-md">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                <span className="text-slate-400 font-medium">当前精算盘口：</span>
                <span className="font-extrabold text-white">
                  {matchData.matchInfo.homeTeam} vs {matchData.matchInfo.awayTeam}
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  {matchData.matchInfo.league || '常规联赛'}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-400">切换测算场次：</span>
                <select
                  value={
                    batchQueue.find(
                      (q) =>
                        q.data.matchInfo.homeTeam === matchData.matchInfo.homeTeam &&
                        q.data.matchInfo.awayTeam === matchData.matchInfo.awayTeam
                    )?.id || 'current'
                  }
                  onChange={(e) => {
                    const target = batchQueue.find((q) => q.id === e.target.value);
                    if (target && onSelectMatch) {
                      onSelectMatch(target.data);
                    }
                  }}
                  className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-cyan-400 font-bold focus:outline-none cursor-pointer"
                >
                  {batchQueue.map((item, idx) => (
                    <option key={item.id} value={item.id}>
                      #{idx + 1} 场：{item.data.matchInfo.homeTeam} vs {item.data.matchInfo.awayTeam}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Interactive D3.js Visualization: Handicap Odds Distribution Chart */}
          <HandicapOddsDistributionChart
            matches={matches || [matchData]}
            currentMatch={matchData}
          />

          {/* Return Rate & Margin */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 mb-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                <Percent className="w-4 h-4 text-emerald-400" />
                <span>机构返还率与抽水比例 (Bookmaker Margin)</span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">大庄利润防线</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <div className="text-slate-400 flex justify-between">
                  <span>早盘机构返还率</span>
                  <span className="font-mono text-white">{metrics.earlyReturnRate.toFixed(2)}%</span>
                </div>
                <div className="text-slate-400 flex justify-between mt-1">
                  <span>早盘机构抽水 (Margin)</span>
                  <span className="font-mono text-rose-400">{earlyMargin}%</span>
                </div>
                <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden mt-2">
                  <div
                    className="bg-slate-600 h-full rounded-full"
                    style={{ width: `${metrics.earlyReturnRate}%` }}
                  />
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <div className="text-slate-400 flex justify-between">
                  <span>晚盘即时返还率</span>
                  <span className="font-mono text-emerald-400 font-bold">{metrics.lateReturnRate.toFixed(2)}%</span>
                </div>
                <div className="text-slate-400 flex justify-between mt-1">
                  <span>晚盘机构抽水 (Margin)</span>
                  <span className="font-mono text-rose-400">{lateMargin}%</span>
                </div>
                <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden mt-2">
                  <div
                    className="bg-emerald-500 h-full rounded-full"
                    style={{ width: `${metrics.lateReturnRate}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Implied Probabilities Comparison */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 mb-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                <Scale className="w-4 h-4 text-cyan-400" />
                <span>胜平负去水隐含概率 (早盘 vs 晚盘变轨)</span>
              </div>
              <span className="text-[11px] font-mono text-cyan-400">大庄真实概率底牌</span>
            </div>

            <div className="space-y-3 text-xs">
              {/* Home Win */}
              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span>主胜概率 ({matchData.matchInfo.homeTeam})</span>
                  <span className="font-mono">
                    {metrics.earlyHomeProb.toFixed(1)}% <span className="text-slate-500">→</span>{' '}
                    <strong className="text-emerald-400">{metrics.lateHomeProb.toFixed(1)}%</strong>
                  </span>
                </div>
                <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden flex">
                  <div
                    className="bg-emerald-500 h-full transition-all duration-500"
                    style={{ width: `${metrics.lateHomeProb}%` }}
                  />
                </div>
              </div>

              {/* Draw */}
              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span>平局概率 (Draw)</span>
                  <span className="font-mono">
                    {metrics.earlyDrawProb.toFixed(1)}% <span className="text-slate-500">→</span>{' '}
                    <strong className={metrics.lateDrawProb > 32 ? 'text-amber-400 font-bold' : 'text-slate-200'}>
                      {metrics.lateDrawProb.toFixed(1)}%
                    </strong>
                  </span>
                </div>
                <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden flex">
                  <div
                    className={`h-full transition-all duration-500 ${
                      metrics.lateDrawProb > 32 ? 'bg-amber-400' : 'bg-cyan-500'
                    }`}
                    style={{ width: `${metrics.lateDrawProb}%` }}
                  />
                </div>
              </div>

              {/* Away Win */}
              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span>客胜概率 ({matchData.matchInfo.awayTeam})</span>
                  <span className="font-mono">
                    {metrics.earlyAwayProb.toFixed(1)}% <span className="text-slate-500">→</span>{' '}
                    <strong className="text-cyan-400">{metrics.lateAwayProb.toFixed(1)}%</strong>
                  </span>
                </div>
                <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden flex">
                  <div
                    className="bg-cyan-600 h-full transition-all duration-500"
                    style={{ width: `${metrics.lateAwayProb}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Asian & Euro Discrepancy Analysis */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 mb-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                <Calculator className="w-4 h-4 text-amber-400" />
                <span>欧亚折算偏离度测谎</span>
              </div>
              <span className="text-[11px] font-mono text-amber-400">虚开盘口识别</span>
            </div>

            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs space-y-2">
              <div className="text-slate-300 font-medium">
                {metrics.handicapDiscrepancy}
              </div>
              <div className="text-slate-400 leading-relaxed text-[11px]">
                若欧赔主胜与亚盘让步脱节（例如欧赔已打到1.40但亚指仍死卡半一高水，或欧赔升到1.90亚盘反强开半球满水），均属于机构利用名气与盘位差打信息不对称的收割形态。
              </div>
            </div>
          </div>

          {/* Over/Under Cross Examination */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 mb-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                <Flame className="w-4 h-4 text-rose-400" />
                <span>三维联动：大小球联动测谎准则</span>
              </div>
              <span className="text-[11px] font-mono text-rose-400">比分空间测谎</span>
            </div>

            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs">
              <p className="text-slate-200 leading-relaxed font-mono">
                {metrics.overUnderVerdict}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

