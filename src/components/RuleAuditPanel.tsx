import { SimulatedSettlement } from './SimulatedSettlement';
import { useMemo, useState } from 'react';
import { MarketAlgorithmComparison } from './MarketAlgorithmComparison';
import type { PostMatchReview } from '../types/fortuneActuary';
import { RED_LINE_NAMES, type V4RedLine } from '../utils/coreRulesV4';
import { displayRate } from '../utils/euroStatistics';
import { auditRules, MIN_SIGNAL_HISTORY, ODDS_BANDS, type AuditCohort, type PairedStats } from '../utils/ruleAudit';

const statsLine = (stats: PairedStats) => `${displayRate(stats.hits, stats.total)} / ${displayRate(stats.profit, stats.total)}`;

export function RuleAuditPanel({ reviews }: { reviews: PostMatchReview[] }) {
  const [cohort, setCohort] = useState<AuditCohort>('five');
  const [redLine, setRedLine] = useState<V4RedLine>('shallowWater');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [showAlgorithms, setShowAlgorithms] = useState(false);
  const audit = useMemo(() => auditRules(reviews, cohort, redLine, verifiedOnly), [reviews, cohort, redLine, verifiedOnly]);
  const rows = [
    { title: '归档原预测', stats: audit.archived },
    { title: 'v4 回放', stats: audit.baseline },
    { title: '候选回放', stats: audit.candidate },
  ];
  const rolling = audit.rolling;
  const brier = (value: number, count: number) => count ? (value / count).toFixed(4) : '—';

  return (
    <section aria-label="规则回放与市场对照" className="space-y-4 rounded-xl border border-amber-500/25 bg-slate-900 p-4 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-bold text-white">规则回放与市场对照</h4>
          <p className="mt-1 text-slate-400">
            已核验赛前 {audit.verified} / {audit.qualifying} 场有效复盘 · 当前纳入 {audit.priced} 场
            {audit.placeholders > 0 && ` · 排除 ${audit.placeholders} 场占位盘口`}
          </p>
        </div>
        <label className="flex items-center gap-2 text-slate-200">
          <input type="checkbox" checked={verifiedOnly} onChange={event => setVerifiedOnly(event.target.checked)} /> 仅已核验赛前
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-2 text-slate-300">
          比较范围
          <select value={cohort} onChange={event => setCohort(event.target.value as AuditCohort)}
            className="rounded border border-slate-700 bg-slate-950 p-1.5 text-slate-100">
            <option value="five">五星单选</option>
            <option value="core">核心候选单选</option>
            <option value="single">全部单选</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-slate-300">
          候选停用一条红线
          <select value={redLine} onChange={event => setRedLine(event.target.value as V4RedLine)}
            className="rounded border border-slate-700 bg-slate-950 p-1.5 text-slate-100">
            {Object.entries(RED_LINE_NAMES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-right tabular-nums">
          <thead className="border-b border-slate-700 text-slate-400">
            <tr>{['规则版本', '入选场数', '单选命中率', '模拟结算（单位）', '模拟 ROI', '同场最低赔命中率', '同场最低赔 ROI', '与最低赔同向'].map((label, i) =>
              <th key={label} scope="col" className={i === 0 ? 'p-2 text-left' : 'p-2'}>{label}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-200">
            {rows.map(({ title, stats }) => <tr key={title}>
              <th scope="row" className="p-2 text-left">{title}</th>
              <td className="p-2">{stats.total}</td>
              <td className="p-2">{displayRate(stats.hits, stats.total)}</td>
              <td className="p-2"><SimulatedSettlement stake={stats.total} profit={stats.profit} /></td>
              <td className="p-2">{displayRate(stats.profit, stats.total)}</td>
              <td className="p-2">{displayRate(stats.marketHits, stats.total)}</td>
              <td className="p-2">{displayRate(stats.marketProfit, stats.total)}</td>
              <td className="p-2">{stats.agrees} / {stats.total}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <p className="text-slate-400">每行的市场基准使用该行入选的同一批比赛。每场模拟投入 1 单位，命中按记录的晚盘赔率返还，返还含本金。旧档案可用于回放，赛前录入时间可能缺失。</p>

      <div className="space-y-2 border-t border-slate-800 pt-3">
        <h5 className="font-bold text-white">红线影响与赔率分档</h5>
        <p className="text-slate-300">
          触发 {audit.triggered} 场 · 定位待核实 {audit.pending} 场 · 方向或入选有变 {audit.changed} 场 · 新增入选 {audit.added} 场
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-right tabular-nums">
            <thead className="border-b border-slate-700 text-slate-400">
              <tr>{['市场最低赔', 'v4 场数 · 命中 / ROI', '候选场数 · 命中 / ROI', '新增场数 · 命中 / ROI'].map((label, i) =>
                <th key={label} scope="col" className={i === 0 ? 'p-2 text-left' : 'p-2'}>{label}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-200">
              {audit.bands.map(({ baseline, candidate, added }, i) => <tr key={ODDS_BANDS[i]}>
                <th scope="row" className="p-2 text-left">{ODDS_BANDS[i]}</th>
                <td className="p-2">{baseline.total} · {statsLine(baseline)}</td>
                <td className="p-2">{candidate.total} · {statsLine(candidate)}</td>
                <td className="p-2">{added.total} · {statsLine(added)}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <p className="text-slate-400">回放只暂停一条选中的已确认红线。球队定位待核实的记录继续观察。长串规则属于组合管理。</p>
        {audit.daily.length > 0 && <details className="rounded border border-slate-800 p-2">
          <summary className="cursor-pointer font-semibold text-slate-200">按销售日查看红线回放（{audit.daily.length} 天）</summary>
          <div className="mt-2 max-h-80 overflow-auto">
            <table className="w-full min-w-[610px] text-right tabular-nums">
              <thead className="sticky top-0 bg-slate-900 text-slate-400">
                <tr>{['销售日', 'v4 场数 · 命中 / ROI', '候选场数 · 命中 / ROI', '新增场数 · 命中 / ROI'].map((label, i) =>
                  <th key={label} scope="col" className={i ? 'p-2' : 'p-2 text-left'}>{label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-200">
                {audit.daily.map(([day, stats]) => <tr key={day}>
                  <th scope="row" className="p-2 text-left">{day}</th>
                  <td className="p-2">{stats.baseline.total} · {statsLine(stats.baseline)}</td>
                  <td className="p-2">{stats.candidate.total} · {statsLine(stats.candidate)}</td>
                  <td className="p-2">{stats.added.total} · {statsLine(stats.added)}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </details>}
      </div>

      <div className="space-y-2 border-t border-slate-800 pt-3">
        <h5 className="font-bold text-white">概率与销售日滚动验证</h5>
        <p className="text-slate-300">
          市场去水 Brier {brier(audit.marketBrier, audit.priced)}（{audit.priced} 场） · 赛前可核验联动样本 {rolling.available} 场
        </p>
        <p className="text-slate-300">
          同场滚动结果（{rolling.total} 场） · 市场 {brier(rolling.matchedMarket, rolling.total)} · 联动修正 {brier(rolling.candidate, rolling.total)}
        </p>
        <p className="text-slate-400">
          Brier 越低越好。每场只用更早销售日且录比分早于快照的联动样本，至少需 {MIN_SIGNAL_HISTORY} 场，按历史命中与市场概率的偏差做小幅修正。
          {rolling.total === 0 && ' 当前没有足够可用的赛前样本进行滚动对照。'}
        </p>
      </div>
      <div className="space-y-2 border-t border-slate-800 pt-3">
        <button type="button" aria-expanded={showAlgorithms} onClick={() => setShowAlgorithms(value => !value)}
          className="rounded border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-bold text-cyan-200">
          {showAlgorithms ? '收起开源算法对照' : '运行开源算法对照'}
        </button>
        {showAlgorithms && <MarketAlgorithmComparison reviews={reviews} verifiedOnly={verifiedOnly} />}
      </div>
    </section>
  );
}
