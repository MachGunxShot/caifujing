import { SimulatedSettlement } from './SimulatedSettlement';
import { useEffect, useState } from 'react';
import type { PostMatchReview } from '../types/fortuneActuary';
import { displayRate } from '../utils/euroStatistics';
import { ALGORITHM_NAMES, MIN_CALIBRATION_MATCHES, MIN_SIMULATED_EDGE } from '../utils/marketAlgorithms';

import type { AlgorithmRequest, AlgorithmResponse } from '../utils/marketAlgorithms.worker';

const average = (value: number, n: number) => n > 0 ? (value / n).toFixed(4) : '—';

export function MarketAlgorithmComparison({ reviews, verifiedOnly }: { reviews: PostMatchReview[]; verifiedOnly: boolean }) {
  const [comparison, setComparison] = useState<AlgorithmResponse>();
  const [error, setError] = useState(false);
  const [recent, setRecent] = useState(false);
  useEffect(() => {
    setComparison(undefined);
    setError(false);
    const worker = new Worker(new URL('../utils/marketAlgorithms.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }: MessageEvent<AlgorithmResponse>) => setComparison(data);
    worker.onerror = () => setError(true);
    worker.postMessage({ reviews, verifiedOnly } satisfies AlgorithmRequest);
    return () => worker.terminate();
  }, [reviews, verifiedOnly]);
  if (error) return <p role="alert" className="text-amber-300">算法对照运行失败，请收起后重新运行。</p>;
  if (!comparison) return <p role="status" className="text-slate-300">正在按销售日计算算法对照…</p>;

  const evaluated = comparison.results.proportional.n > 0;
  const results = !evaluated ? comparison.staticResults : recent ? comparison.recent : comparison.results;
  const algorithms = (Object.keys(ALGORITHM_NAMES) as (keyof typeof ALGORITHM_NAMES)[])
    .filter(key => evaluated || (key !== 'euro' && key !== 'combined'));
  const count = results.proportional.n;
  return (
    <div className="space-y-3 border-t border-slate-800 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-slate-300">
          {verifiedOnly ? '已核验赛前' : '历史探索'} · 同场评估 {count} / {comparison.available} 场
          {evaluated && !recent && ` · ${comparison.evaluatedDays} 个销售日`}
        </p>
        {evaluated && <label className="flex items-center gap-2 text-slate-200">
          <input type="checkbox" checked={recent} onChange={event => setRecent(event.target.checked)} /> 仅最近 10 个销售日
        </label>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-right tabular-nums">
          <thead className="border-b border-slate-700 text-slate-400">
            <tr>{['方法', 'Brier ↓', 'Log Loss ↓', '首选命中', '模拟入选', '入选命中', '模拟结算（单位）', '模拟 ROI', '同场最低赔 ROI'].map((label, i) =>
              <th key={label} scope="col" className={i === 0 ? 'p-2 text-left' : 'p-2'}>{label}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-200">
            {algorithms.map(key => {
              const row = results[key];
              return <tr key={key}>
                <th scope="row" className="p-2 text-left">{ALGORITHM_NAMES[key]}</th>
                <td className="p-2">{average(row.brier, row.n)}</td>
                <td className="p-2">{average(row.logLoss, row.n)}</td>
                <td className="p-2">{displayRate(row.hits, row.n)}</td>
                <td className="p-2">{row.selected}</td>
                <td className="p-2">{displayRate(row.selectedHits, row.selected)}</td>
                <td className="p-2"><SimulatedSettlement stake={row.selected} profit={row.profit} /></td>
                <td className="p-2">{displayRate(row.profit, row.selected)}</td>
                <td className="p-2">{displayRate(row.marketProfit, row.selected)}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      {evaluated && !recent && <p className="text-slate-300">
        同一评估区间内，v4 五星单选 {comparison.v4.selected} 场，命中 {displayRate(comparison.v4.hits, comparison.v4.selected)}，
        <SimulatedSettlement stake={comparison.v4.selected} profit={comparison.v4.profit} /> 单位，模拟 ROI {displayRate(comparison.v4.profit, comparison.v4.selected)}。
      </p>}
      <p className="text-slate-400">
        校准每天用至少 {MIN_CALIBRATION_MATCHES} 场历史比赛重新拟合，中间留出一个完整销售日。
        {verifiedOnly ? '训练还要求比分早于当日最早的预测录入。' : '旧档缺少盘口与结果的真实录入时间，结论需用赛前快照复验。'}
        模拟入选条件为「概率 × 记录赔率 − 1」至少 {displayRate(MIN_SIMULATED_EDGE, 1)}，每场选一项、投入 1 单位。命中按存档赔率返还（含本金），未命中返还 0。
        {!evaluated && ' 当前样本不足以滚动拟合，先显示无需训练的去水算法。'}
      </p>
    </div>
  );
}
