import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { FullMatchData } from '../types/fortuneActuary';
import { parseHandicapValue } from '../utils/actuaryEngine';
import { BarChart3, LineChart, Info, Sparkles, Filter, Layers } from 'lucide-react';

interface HandicapOddsDistributionChartProps {
  matches: FullMatchData[];
  currentMatch?: FullMatchData;
}

interface HandicapBucketData {
  key: string;
  label: string;
  handicapNum: number;
  winProb: number;
  drawProb: number;
  lossProb: number;
  avgReturnRate: number;
  matchCount: number;
  matchNames: string[];
  insight: string;
}

// Baseline market actuarial reference distribution across standard handicap lines
const BASELINE_BRACKETS: { label: string; handicapNum: number; baseWin: number; baseDraw: number; baseLoss: number; insight: string }[] = [
  { label: '深盘 (≤ -1.75)', handicapNum: -1.75, baseWin: 82.5, baseDraw: 12.0, baseLoss: 5.5, insight: '大庄正向控赔极限区，胜赔普遍低于1.25' },
  { label: '球半 (-1.5)', handicapNum: -1.5, baseWin: 72.0, baseDraw: 18.5, baseLoss: 9.5, insight: '穿盘阻力线，大庄压水控赔 vs 高息诱上分水岭' },
  { label: '一球/球半 (-1.25)', handicapNum: -1.25, baseWin: 65.0, baseDraw: 21.5, baseLoss: 13.5, insight: '赢半博全舒适区，谨防升盘挂满水诱上' },
  { label: '一球 (-1.0)', handicapNum: -1.0, baseWin: 58.0, baseDraw: 24.0, baseLoss: 18.0, insight: '整数盘口走盘保护，平赔开始出现暗流' },
  { label: '半一 (-0.75)', handicapNum: -0.75, baseWin: 52.0, baseDraw: 26.5, baseLoss: 21.5, insight: '博弈焦点盘，欧降亚升或退盘示弱频发' },
  { label: '半球 (-0.5)', handicapNum: -0.5, baseWin: 45.5, baseDraw: 28.0, baseLoss: 26.5, insight: '生死盘，无退路博弈，主胜客胜针锋相对' },
  { label: '平半 (-0.25)', handicapNum: -0.25, baseWin: 38.0, baseDraw: 31.5, baseLoss: 30.5, insight: '平赔低洼集中营，平赔死压3.00以下防范高发' },
  { label: '平手 (0)', handicapNum: 0, baseWin: 33.5, baseDraw: 33.0, baseLoss: 33.5, insight: '均势对冲盘，大小球联动成为核心破局关键' },
  { label: '受让平半 (+0.25)', handicapNum: 0.25, baseWin: 29.5, baseDraw: 31.0, baseLoss: 39.5, insight: '客让浅盘，客队名气过热往往为浅盘满水陷阱' },
  { label: '受让半球 (+0.5)', handicapNum: 0.5, baseWin: 25.0, baseDraw: 28.0, baseLoss: 47.0, insight: '客让生死盘，主队受让下盘胜率激增' },
  { label: '受让深盘 (≥ +0.75)', handicapNum: 0.75, baseWin: 16.0, baseDraw: 22.0, baseLoss: 62.0, insight: '客胜深让控赔区，客胜低洼设防' },
];

export const HandicapOddsDistributionChart: React.FC<HandicapOddsDistributionChartProps> = ({
  matches,
  currentMatch,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [chartType, setChartType] = useState<'area' | 'bar'>('area');
  const [showWin, setShowWin] = useState(true);
  const [showDraw, setShowDraw] = useState(true);
  const [showLoss, setShowLoss] = useState(true);
  const [hoveredBucket, setHoveredBucket] = useState<HandicapBucketData | null>(null);

  // Compute aggregated distribution combining analyzed matches + baseline anchors
  const distributionData = useMemo<HandicapBucketData[]>(() => {
    const allDataset = [...(matches || [])];
    if (currentMatch && !allDataset.some(m => m.matchInfo.homeTeam === currentMatch.matchInfo.homeTeam && m.matchInfo.awayTeam === currentMatch.matchInfo.awayTeam)) {
      allDataset.unshift(currentMatch);
    }

    return BASELINE_BRACKETS.map((bracket) => {
      // Find matches falling around this handicap bracket
      const matched = allDataset.filter((m) => {
        const val = parseHandicapValue(m.asianHandicap.lateHandicap);
        if (bracket.handicapNum <= -1.75) return val <= -1.75;
        if (bracket.handicapNum >= 0.75) return val >= 0.75;
        return Math.abs(val - bracket.handicapNum) <= 0.15;
      });

      if (matched.length === 0) {
        return {
          key: bracket.label,
          label: bracket.label,
          handicapNum: bracket.handicapNum,
          winProb: bracket.baseWin,
          drawProb: bracket.baseDraw,
          lossProb: bracket.baseLoss,
          avgReturnRate: 94.2,
          matchCount: 0,
          matchNames: [],
          insight: bracket.insight,
        };
      }

      // Compute averages from actual imported match data
      let sumWinProb = 0;
      let sumDrawProb = 0;
      let sumLossProb = 0;
      let sumReturn = 0;
      const names: string[] = [];

      matched.forEach((m) => {
        const { lateWin, lateDraw, lateLoss } = m.euroOdds;
        const sumInv = (1 / lateWin) + (1 / lateDraw) + (1 / lateLoss);
        const winP = (1 / lateWin / sumInv) * 100;
        const drawP = (1 / lateDraw / sumInv) * 100;
        const lossP = (1 / lateLoss / sumInv) * 100;
        sumWinProb += winP;
        sumDrawProb += drawP;
        sumLossProb += lossP;
        sumReturn += (1 / sumInv) * 100;
        names.push(`${m.matchInfo.homeTeam} vs ${m.matchInfo.awayTeam}`);
      });

      const count = matched.length;
      return {
        key: bracket.label,
        label: bracket.label,
        handicapNum: bracket.handicapNum,
        winProb: parseFloat((sumWinProb / count).toFixed(1)),
        drawProb: parseFloat((sumDrawProb / count).toFixed(1)),
        lossProb: parseFloat((sumLossProb / count).toFixed(1)),
        avgReturnRate: parseFloat((sumReturn / count).toFixed(1)),
        matchCount: count,
        matchNames: names,
        insight: bracket.insight,
      };
    });
  }, [matches, currentMatch]);

  // D3 Rendering Hook
  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = 760;
    const height = 300;
    const margin = { top: 25, right: 35, bottom: 50, left: 45 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // X Scale (Handicap brackets)
    const xScale = d3
      .scalePoint<string>()
      .domain(distributionData.map((d) => d.label))
      .range([0, innerWidth])
      .padding(0.3);

    // Y Scale (0% - 100%)
    const yScale = d3
      .scaleLinear()
      .domain([0, 100])
      .nice()
      .range([innerHeight, 0]);

    // Gridlines
    const yGrid = d3
      .axisLeft(yScale)
      .tickSize(-innerWidth)
      .tickFormat(() => '')
      .ticks(5);

    g.append('g')
      .attr('class', 'grid')
      .call(yGrid)
      .selectAll('line')
      .attr('stroke', '#1e293b')
      .attr('stroke-opacity', 0.8)
      .attr('stroke-dasharray', '2,2');

    g.select('.domain').remove();

    // Defs & Gradients
    const defs = svg.append('defs');

    // Win gradient (Emerald)
    const winGradient = defs
      .append('linearGradient')
      .attr('id', 'win-gradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');
    winGradient.append('stop').attr('offset', '0%').attr('stop-color', '#10b981').attr('stop-opacity', 0.4);
    winGradient.append('stop').attr('offset', '100%').attr('stop-color', '#10b981').attr('stop-opacity', 0.0);

    // Draw gradient (Cyan)
    const drawGradient = defs
      .append('linearGradient')
      .attr('id', 'draw-gradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');
    drawGradient.append('stop').attr('offset', '0%').attr('stop-color', '#06b6d4').attr('stop-opacity', 0.35);
    drawGradient.append('stop').attr('offset', '100%').attr('stop-color', '#06b6d4').attr('stop-opacity', 0.0);

    // Loss gradient (Rose)
    const lossGradient = defs
      .append('linearGradient')
      .attr('id', 'loss-gradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');
    lossGradient.append('stop').attr('offset', '0%').attr('stop-color', '#f43f5e').attr('stop-opacity', 0.35);
    lossGradient.append('stop').attr('offset', '100%').attr('stop-color', '#f43f5e').attr('stop-opacity', 0.0);

    if (chartType === 'area') {
      // Line and Area Generators
      const lineWin = d3
        .line<HandicapBucketData>()
        .curve(d3.curveMonotoneX)
        .x((d) => xScale(d.label) || 0)
        .y((d) => yScale(d.winProb));

      const areaWin = d3
        .area<HandicapBucketData>()
        .curve(d3.curveMonotoneX)
        .x((d) => xScale(d.label) || 0)
        .y0(innerHeight)
        .y1((d) => yScale(d.winProb));

      const lineDraw = d3
        .line<HandicapBucketData>()
        .curve(d3.curveMonotoneX)
        .x((d) => xScale(d.label) || 0)
        .y((d) => yScale(d.drawProb));

      const areaDraw = d3
        .area<HandicapBucketData>()
        .curve(d3.curveMonotoneX)
        .x((d) => xScale(d.label) || 0)
        .y0(innerHeight)
        .y1((d) => yScale(d.drawProb));

      const lineLoss = d3
        .line<HandicapBucketData>()
        .curve(d3.curveMonotoneX)
        .x((d) => xScale(d.label) || 0)
        .y((d) => yScale(d.lossProb));

      const areaLoss = d3
        .area<HandicapBucketData>()
        .curve(d3.curveMonotoneX)
        .x((d) => xScale(d.label) || 0)
        .y0(innerHeight)
        .y1((d) => yScale(d.lossProb));

      // 1. Draw Area & Lines
      if (showWin) {
        g.append('path')
          .datum(distributionData)
          .attr('fill', 'url(#win-gradient)')
          .attr('d', areaWin);

        g.append('path')
          .datum(distributionData)
          .attr('fill', 'none')
          .attr('stroke', '#10b981')
          .attr('stroke-width', 2.5)
          .attr('d', lineWin);
      }

      if (showDraw) {
        g.append('path')
          .datum(distributionData)
          .attr('fill', 'url(#draw-gradient)')
          .attr('d', areaDraw);

        g.append('path')
          .datum(distributionData)
          .attr('fill', 'none')
          .attr('stroke', '#06b6d4')
          .attr('stroke-width', 2.5)
          .attr('stroke-dasharray', '4,2')
          .attr('d', lineDraw);
      }

      if (showLoss) {
        g.append('path')
          .datum(distributionData)
          .attr('fill', 'url(#loss-gradient)')
          .attr('d', areaLoss);

        g.append('path')
          .datum(distributionData)
          .attr('fill', 'none')
          .attr('stroke', '#f43f5e')
          .attr('stroke-width', 2.5)
          .attr('d', lineLoss);
      }

      // Add Dots & Hover triggers
      distributionData.forEach((d) => {
        const x = xScale(d.label) || 0;

        // Hover vertical guide bar
        const guide = g
          .append('rect')
          .attr('x', x - 18)
          .attr('y', 0)
          .attr('width', 36)
          .attr('height', innerHeight)
          .attr('fill', 'transparent')
          .style('cursor', 'pointer');

        guide
          .on('mouseenter', () => setHoveredBucket(d))
          .on('mouseleave', () => setHoveredBucket(null));

        if (showWin) {
          g.append('circle')
            .attr('cx', x)
            .attr('cy', yScale(d.winProb))
            .attr('r', d.matchCount > 0 ? 5 : 3.5)
            .attr('fill', d.matchCount > 0 ? '#34d399' : '#10b981')
            .attr('stroke', '#022c22')
            .attr('stroke-width', 2);
        }

        if (showDraw) {
          g.append('circle')
            .attr('cx', x)
            .attr('cy', yScale(d.drawProb))
            .attr('r', d.matchCount > 0 ? 5 : 3.5)
            .attr('fill', '#06b6d4')
            .attr('stroke', '#083344')
            .attr('stroke-width', 2);
        }

        if (showLoss) {
          g.append('circle')
            .attr('cx', x)
            .attr('cy', yScale(d.lossProb))
            .attr('r', d.matchCount > 0 ? 5 : 3.5)
            .attr('fill', '#f43f5e')
            .attr('stroke', '#4c0519')
            .attr('stroke-width', 2);
        }

        // Highlight badge if real matches exist
        if (d.matchCount > 0) {
          g.append('text')
            .attr('x', x)
            .attr('y', -8)
            .attr('text-anchor', 'middle')
            .attr('fill', '#34d399')
            .attr('font-size', '9px')
            .attr('font-weight', 'bold')
            .attr('font-family', 'monospace')
            .text(`${d.matchCount}场实盘`);
        }
      });
    } else {
      // Stacked Bar representation
      const bandWidth = innerWidth / distributionData.length - 8;

      distributionData.forEach((d, i) => {
        const x = (xScale(d.label) || 0) - bandWidth / 2;

        const hWin = (d.winProb / 100) * innerHeight;
        const hDraw = (d.drawProb / 100) * innerHeight;
        const hLoss = (d.lossProb / 100) * innerHeight;

        // Win rect (bottom)
        g.append('rect')
          .attr('x', x)
          .attr('y', innerHeight - hWin)
          .attr('width', bandWidth)
          .attr('height', hWin)
          .attr('fill', '#10b981')
          .attr('rx', 2);

        // Draw rect (middle)
        g.append('rect')
          .attr('x', x)
          .attr('y', innerHeight - hWin - hDraw)
          .attr('width', bandWidth)
          .attr('height', hDraw)
          .attr('fill', '#06b6d4');

        // Loss rect (top)
        g.append('rect')
          .attr('x', x)
          .attr('y', innerHeight - hWin - hDraw - hLoss)
          .attr('width', bandWidth)
          .attr('height', hLoss)
          .attr('fill', '#f43f5e')
          .attr('rx', 2);

        // Hover overlay
        g.append('rect')
          .attr('x', x - 4)
          .attr('y', 0)
          .attr('width', bandWidth + 8)
          .attr('height', innerHeight)
          .attr('fill', 'transparent')
          .style('cursor', 'pointer')
          .on('mouseenter', () => setHoveredBucket(d))
          .on('mouseleave', () => setHoveredBucket(null));
      });
    }

    // Axes
    const xAxis = d3.axisBottom(xScale);
    const yAxis = d3.axisLeft(yScale).ticks(5).tickFormat((d) => `${d}%`);

    const gx = g
      .append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis);

    gx.selectAll('text')
      .attr('fill', '#94a3b8')
      .attr('font-size', '10px')
      .attr('transform', 'rotate(-18)')
      .attr('text-anchor', 'end')
      .attr('dx', '-0.3em')
      .attr('dy', '0.5em');

    gx.select('.domain').attr('stroke', '#334155');
    gx.selectAll('line').attr('stroke', '#334155');

    const gy = g.append('g').call(yAxis);
    gy.selectAll('text').attr('fill', '#94a3b8').attr('font-size', '10px').attr('font-family', 'monospace');
    gy.select('.domain').attr('stroke', '#334155');
    gy.selectAll('line').attr('stroke', '#334155');

  }, [distributionData, chartType, showWin, showDraw, showLoss]);

  const totalAnalyzedMatches = matches.length + (currentMatch ? 1 : 0);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl space-y-3">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
              D3
            </div>
            <h3 className="text-sm font-extrabold text-white tracking-wide">
              不同盘口胜平负概率分布与机构风控中枢
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-950 text-cyan-400 border border-slate-800">
              已覆盖 {totalAnalyzedMatches} 场实盘
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            基于欧亚精算去水模型 · 呈现让球深浅与主胜/胆平/客胜真实概率的非线性跃迁
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Legend Toggles */}
          <div className="flex items-center gap-1.5 bg-slate-950 px-2 py-1 rounded-lg border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setShowWin(!showWin)}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors ${
                showWin ? 'text-emerald-400 font-bold' : 'text-slate-600 line-through'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>主胜</span>
            </button>
            <button
              type="button"
              onClick={() => setShowDraw(!showDraw)}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors ${
                showDraw ? 'text-cyan-400 font-bold' : 'text-slate-600 line-through'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <span>平局</span>
            </button>
            <button
              type="button"
              onClick={() => setShowLoss(!showLoss)}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors ${
                showLoss ? 'text-rose-400 font-bold' : 'text-slate-600 line-through'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>客胜</span>
            </button>
          </div>

          {/* Chart Type Toggle */}
          <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setChartType('area')}
              className={`p-1.5 rounded transition-all ${
                chartType === 'area'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="平滑概率趋势图"
            >
              <LineChart className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setChartType('bar')}
              className={`p-1.5 rounded transition-all ${
                chartType === 'bar'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="100% 堆叠分布柱状图"
            >
              <BarChart3 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* D3 SVG Canvas */}
      <div ref={containerRef} className="w-full overflow-x-auto relative">
        <svg
          ref={svgRef}
          viewBox="0 0 760 300"
          className="w-full min-w-[700px] h-[270px] select-none"
        />

        {/* Hovered D3 Tooltip */}
        {hoveredBucket && (
          <div className="absolute top-2 right-4 bg-slate-950/95 border border-slate-700/80 rounded-xl p-3 shadow-2xl text-xs space-y-1.5 max-w-xs backdrop-blur-md z-20 pointer-events-none animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1">
              <span className="font-extrabold text-white text-sm">
                【{hoveredBucket.label}】
              </span>
              <span className="text-[10px] text-emerald-400 font-mono">
                {hoveredBucket.matchCount > 0 ? `匹配 ${hoveredBucket.matchCount} 场实盘` : '基准精算中枢'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5 text-center font-mono py-1">
              <div className="bg-emerald-950/40 p-1.5 rounded border border-emerald-500/30">
                <div className="text-[10px] text-slate-400">主胜概率</div>
                <div className="font-black text-emerald-400 text-xs mt-0.5">
                  {hoveredBucket.winProb}%
                </div>
              </div>
              <div className="bg-cyan-950/40 p-1.5 rounded border border-cyan-500/30">
                <div className="text-[10px] text-slate-400">平局概率</div>
                <div className="font-black text-cyan-400 text-xs mt-0.5">
                  {hoveredBucket.drawProb}%
                </div>
              </div>
              <div className="bg-rose-950/40 p-1.5 rounded border border-rose-500/30">
                <div className="text-[10px] text-slate-400">客胜概率</div>
                <div className="font-black text-rose-400 text-xs mt-0.5">
                  {hoveredBucket.lossProb}%
                </div>
              </div>
            </div>

            <div className="text-[11px] text-slate-300 leading-snug">
              <span className="text-amber-400 font-bold">操盘特征：</span>
              {hoveredBucket.insight}
            </div>

            {hoveredBucket.matchNames.length > 0 && (
              <div className="text-[10px] text-slate-400 border-t border-slate-800 pt-1 truncate">
                包含赛事：{hoveredBucket.matchNames.join('、')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Notes */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-400 border-t border-slate-800/80 pt-2 px-1">
        <div className="flex items-center gap-1.5 text-emerald-400">
          <Sparkles className="w-3.5 h-3.5" />
          <span>核心规律：平赔在平手至平半区间达到 31.5% 峰值；让球越过一球后主胜率出现非线性跃升</span>
        </div>
        <div className="text-slate-500 font-mono text-[10px]">
          D3.js MonotoneX 动态平滑精算曲面
        </div>
      </div>
    </div>
  );
};
