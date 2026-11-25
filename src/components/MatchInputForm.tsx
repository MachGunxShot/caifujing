import React, { useState } from 'react';
import {
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Minus,
  ClipboardPaste,
  Layers,
  Upload,
  Bookmark,
} from 'lucide-react';
import { FullMatchData } from '../types/fortuneActuary';
import { parseNaturalTextOdds } from '../utils/textParser';
import { PRESET_CASES } from '../utils/presetCases';

interface MatchInputFormProps {
  data: FullMatchData;
  onChange: (newData: FullMatchData) => void;
  onSubmit: () => void;
  onSaveSnapshot: () => string;
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

const INPUT_BASE =
  'w-full h-9 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg px-2.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/70 focus:ring-2 focus:ring-emerald-500/15 transition-colors';

const NUMERIC_INPUT_BASE =
  'w-full h-8 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-md px-2 text-xs text-center font-mono tabular-nums text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/70 focus:ring-2 focus:ring-emerald-500/15 transition-colors';

export const MatchInputForm: React.FC<MatchInputFormProps> = ({
  data,
  onChange,
  onSubmit,
  onSaveSnapshot,
  isLoading,
  onSelectPreset,
  onOpenUploadModal,
  onBatchAnalyzeAll,
  batchCount = 0,
}) => {
  const [pasteText, setPasteText] = useState('');
  const [snapshotMessage, setSnapshotMessage] = useState('');
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
        ...(field === 'homeTeam' ? { homeProfile: undefined } : field === 'awayTeam' ? { awayProfile: undefined } : {}),
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

  const getTrendIcon = (late: number, early: number) => {
    if (late < early) return <TrendingDown className="w-3 h-3 text-emerald-400 inline ml-0.5" />;
    if (late > early) return <TrendingUp className="w-3 h-3 text-rose-400 inline ml-0.5" />;
    return <Minus className="w-3 h-3 text-slate-600 inline ml-0.5" />;
  };

  return (
    <div className="space-y-4">
      {/* Quick Import & Case Presets Strip */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <ClipboardPaste className="w-3.5 h-3.5 text-emerald-400" />
            <span>快捷录入</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            {onOpenUploadModal && (
              <button
                type="button"
                onClick={onOpenUploadModal}
                className="text-emerald-400 hover:text-emerald-300 font-medium inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>截图 / 批量文件</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowPasteBox(!showPasteBox)}
              className="text-slate-300 hover:text-white font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              {showPasteBox ? '收起文本框' : '粘贴单场文本'}
            </button>
          </div>
        </div>

        {showPasteBox && (
          <div className="space-y-2.5 pt-2.5 border-t border-slate-800">
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="粘贴任意盘赔文本，例如：阿森纳 vs 切尔西 初盘半一0.92 临场一球0.82 欧赔 1.65 3.80 5.20 -> 1.48 4.20 7.00 大小球2.5"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/70 focus:ring-2 focus:ring-emerald-500/15 font-mono h-20"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleTextParse}
                className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-md transition-colors cursor-pointer"
              >
                解析并填入
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 text-[11px]">
          <span className="text-slate-500 whitespace-nowrap shrink-0 mr-1">案例速测</span>
          {PRESET_CASES.slice(0, 5).map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onSelectPreset(preset)}
              className="px-2.5 py-1 rounded-md bg-slate-950 hover:bg-slate-850 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
            >
              {preset.tag}
            </button>
          ))}
        </div>
      </section>

      {/* Match Fundamentals */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3.5">
        <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
          <h3 className="text-xs font-semibold text-slate-100">赛事基本面与题材</h3>
          <span className="text-[11px] text-slate-500">早盘看意图 · 晚盘看风控</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">赛事 / 联赛</label>
            <input
              type="text"
              value={data.matchInfo.league}
              onChange={(e) => updateMatchInfo('league', e.target.value)}
              placeholder="如：英超"
              className={INPUT_BASE}
            />
          </div>
          <div>
            <label className="block text-[11px] text-emerald-400/90 font-medium mb-1">主队</label>
            <input
              type="text"
              value={data.matchInfo.homeTeam}
              onChange={(e) => updateMatchInfo('homeTeam', e.target.value)}
              placeholder="如：曼彻斯特城"
              className={`${INPUT_BASE} font-medium`}
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-300 font-medium mb-1">客队</label>
            <input
              type="text"
              value={data.matchInfo.awayTeam}
              onChange={(e) => updateMatchInfo('awayTeam', e.target.value)}
              placeholder="如：埃弗顿"
              className={`${INPUT_BASE} font-medium`}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">开赛时间 (北京时间)</label>
            <input
              type="text"
              placeholder="YYYY-MM-DD HH:mm"
              value={data.matchInfo.matchTime}
              onChange={(event) => {
                setSnapshotMessage('');
                updateMatchInfo('matchTime', event.target.value);
              }}
              className={`${INPUT_BASE} font-mono`}
            />
          </div>
          {(['homeProfile', 'awayProfile'] as const).map((field) => (
            <div key={field}>
              <label className="block text-[11px] text-slate-400 mb-1">
                {field === 'homeProfile' ? '主队定位' : '客队定位'}
              </label>
              <select
                className={INPUT_BASE}
                value={data.matchInfo[field] || ''}
                onChange={(e) => updateMatchInfo(field, e.target.value)}
              >
                <option value="">待核实</option>
                <option value="dominant">统治级强队</option>
                <option value="challenger">新贵 / 黑马</option>
                <option value="ordinary">普通球队</option>
              </select>
            </div>
          ))}
        </div>

        <div>
          <label className="block text-[11px] text-slate-400 mb-1">
            市场题材 / 战意与伤停线索
          </label>
          <input
            type="text"
            value={data.matchInfo.marketStory}
            onChange={(e) => updateMatchInfo('marketStory', e.target.value)}
            placeholder="如：主队名气占优但核心前锋伤缺，近3次交手全胜"
            className={INPUT_BASE}
          />
        </div>
      </section>

      {/* Unified Three-Dimensional Market Odds Matrix (Asian / Euro / Over-Under) */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl divide-y divide-slate-800 overflow-hidden">
        {/* 1. Asian Handicap */}
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-100">亚盘盘口与水位</h3>
            <span className="text-[11px] text-slate-500">初盘意图 / 临场风控</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <div className="text-[11px] text-slate-500 font-medium">早盘初盘</div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-500 mb-1">初盘让步</label>
                  <input
                    type="text"
                    value={data.asianHandicap.earlyHandicap}
                    onChange={(e) => updateAsian('earlyHandicap', e.target.value)}
                    placeholder="-0.75"
                    className={NUMERIC_INPUT_BASE}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-1">主队初水</label>
                  <input
                    type="number"
                    step="0.01"
                    value={data.asianHandicap.earlyHomeOdds || ''}
                    onChange={(e) => updateAsian('earlyHomeOdds', parseFloat(e.target.value))}
                    placeholder="1.92"
                    className={NUMERIC_INPUT_BASE}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-1">客队初水</label>
                  <input
                    type="number"
                    step="0.01"
                    value={data.asianHandicap.earlyAwayOdds || ''}
                    onChange={(e) => updateAsian('earlyAwayOdds', parseFloat(e.target.value))}
                    placeholder="1.90"
                    className={NUMERIC_INPUT_BASE}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2 md:pl-3 md:border-l md:border-slate-800/80">
              <div className="text-[11px] text-emerald-400 font-medium">临场即时</div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">即时让步</label>
                  <input
                    type="text"
                    value={data.asianHandicap.lateHandicap}
                    onChange={(e) => updateAsian('lateHandicap', e.target.value)}
                    placeholder="-1.0"
                    className={`${NUMERIC_INPUT_BASE} border-slate-700 font-semibold text-white`}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">
                    主队即时{getTrendIcon(data.asianHandicap.lateHomeOdds, data.asianHandicap.earlyHomeOdds)}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={data.asianHandicap.lateHomeOdds || ''}
                    onChange={(e) => updateAsian('lateHomeOdds', parseFloat(e.target.value))}
                    placeholder="1.78"
                    className={`${NUMERIC_INPUT_BASE} font-bold ${
                      data.asianHandicap.lateHomeOdds >= 2.0
                        ? 'border-rose-500/60 text-rose-400'
                        : data.asianHandicap.lateHomeOdds <= 1.80
                        ? 'border-emerald-500/60 text-emerald-400'
                        : 'border-slate-700 text-white'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">客队即时</label>
                  <input
                    type="number"
                    step="0.01"
                    value={data.asianHandicap.lateAwayOdds || ''}
                    onChange={(e) => updateAsian('lateAwayOdds', parseFloat(e.target.value))}
                    placeholder="1.82"
                    className={NUMERIC_INPUT_BASE}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pt-1 text-[11px]">
            <span className="text-slate-500 whitespace-nowrap shrink-0 mr-0.5">快选</span>
            {COMMON_HANDICAPS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => updateAsian('lateHandicap', h)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  data.asianHandicap.lateHandicap === h
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-slate-950 hover:bg-slate-850 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {h}
              </button>
            ))}
          </div>
        </div>

        {/* 2. European Odds */}
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-100">欧指胜平负走势</h3>
            <span className="text-[11px] text-slate-500">平赔防线 / 胜赔控水</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <div className="text-[11px] text-slate-500 font-medium">早盘初赔</div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-500 mb-1">主胜</label>
                  <input
                    type="number"
                    step="0.01"
                    value={data.euroOdds.earlyWin || ''}
                    onChange={(e) => updateEuro('earlyWin', parseFloat(e.target.value))}
                    placeholder="1.65"
                    className={NUMERIC_INPUT_BASE}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-1">平局</label>
                  <input
                    type="number"
                    step="0.01"
                    value={data.euroOdds.earlyDraw || ''}
                    onChange={(e) => updateEuro('earlyDraw', parseFloat(e.target.value))}
                    placeholder="3.80"
                    className={NUMERIC_INPUT_BASE}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-1">客胜</label>
                  <input
                    type="number"
                    step="0.01"
                    value={data.euroOdds.earlyLoss || ''}
                    onChange={(e) => updateEuro('earlyLoss', parseFloat(e.target.value))}
                    placeholder="5.20"
                    className={NUMERIC_INPUT_BASE}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2 md:pl-3 md:border-l md:border-slate-800/80">
              <div className="text-[11px] text-slate-300 font-medium">临场即时</div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">
                    主胜{getTrendIcon(data.euroOdds.lateWin, data.euroOdds.earlyWin)}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={data.euroOdds.lateWin || ''}
                    onChange={(e) => updateEuro('lateWin', parseFloat(e.target.value))}
                    placeholder="1.48"
                    className={`${NUMERIC_INPUT_BASE} border-slate-700 font-bold text-white`}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">
                    平局{getTrendIcon(data.euroOdds.lateDraw, data.euroOdds.earlyDraw)}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={data.euroOdds.lateDraw || ''}
                    onChange={(e) => updateEuro('lateDraw', parseFloat(e.target.value))}
                    placeholder="2.90"
                    className={`${NUMERIC_INPUT_BASE} font-bold ${
                      data.euroOdds.lateDraw > 0 && data.euroOdds.lateDraw <= 3.0
                        ? 'border-amber-500/60 text-amber-300'
                        : 'border-slate-700 text-white'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">
                    客胜{getTrendIcon(data.euroOdds.lateLoss, data.euroOdds.earlyLoss)}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={data.euroOdds.lateLoss || ''}
                    onChange={(e) => updateEuro('lateLoss', parseFloat(e.target.value))}
                    placeholder="7.00"
                    className={NUMERIC_INPUT_BASE}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Over / Under */}
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-100">大小球联动</h3>
            <span className="text-[11px] text-slate-500">深浅让步交叉验真</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <div className="text-[11px] text-slate-500 font-medium">早盘初盘</div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-500 mb-1">界线</label>
                  <input
                    type="text"
                    value={data.overUnder.earlyLine}
                    onChange={(e) => updateOU('earlyLine', e.target.value)}
                    placeholder="2.5"
                    className={NUMERIC_INPUT_BASE}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-1">大球水</label>
                  <input
                    type="number"
                    step="0.01"
                    value={data.overUnder.earlyOverOdds || ''}
                    onChange={(e) => updateOU('earlyOverOdds', parseFloat(e.target.value))}
                    placeholder="1.95"
                    className={NUMERIC_INPUT_BASE}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-1">小球水</label>
                  <input
                    type="number"
                    step="0.01"
                    value={data.overUnder.earlyUnderOdds || ''}
                    onChange={(e) => updateOU('earlyUnderOdds', parseFloat(e.target.value))}
                    placeholder="1.85"
                    className={NUMERIC_INPUT_BASE}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2 md:pl-3 md:border-l md:border-slate-800/80">
              <div className="text-[11px] text-amber-400/90 font-medium">临场即时</div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">即时界线</label>
                  <input
                    type="text"
                    value={data.overUnder.lateLine}
                    onChange={(e) => updateOU('lateLine', e.target.value)}
                    placeholder="2.5"
                    className={`${NUMERIC_INPUT_BASE} border-slate-700 font-bold text-white`}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">大球水</label>
                  <input
                    type="number"
                    step="0.01"
                    value={data.overUnder.lateOverOdds || ''}
                    onChange={(e) => updateOU('lateOverOdds', parseFloat(e.target.value))}
                    placeholder="1.82"
                    className={NUMERIC_INPUT_BASE}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">小球水</label>
                  <input
                    type="number"
                    step="0.01"
                    value={data.overUnder.lateUnderOdds || ''}
                    onChange={(e) => updateOU('lateUnderOdds', parseFloat(e.target.value))}
                    placeholder="2.02"
                    className={NUMERIC_INPUT_BASE}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pt-1 text-[11px]">
            <span className="text-slate-500 whitespace-nowrap shrink-0 mr-0.5">快选</span>
            {COMMON_OU_LINES.map((line) => (
              <button
                key={line}
                type="button"
                onClick={() => updateOU('lateLine', line)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  data.overUnder.lateLine === line
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-slate-950 hover:bg-slate-850 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {line}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Primary Action Block */}
      <div className="space-y-2.5">
        <button
          type="button"
          onClick={onSubmit}
          disabled={isLoading}
          className="w-full h-11 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] text-slate-950 font-bold text-sm flex items-center justify-center gap-2 transition-all duration-150 disabled:opacity-50 cursor-pointer"
        >
          {isLoading ? (
            <>
              <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              <span>正在执行三维盘赔精算...</span>
            </>
          ) : (
            <>
              <span>启动三维精算测谎</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>

        <div className={`grid gap-2 ${batchCount > 1 && onBatchAnalyzeAll ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <button
            type="button"
            onClick={() => setSnapshotMessage(onSaveSnapshot())}
            className="h-9 px-3 rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-xs font-medium text-slate-200 inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Bookmark className="w-3.5 h-3.5 text-emerald-400" />
            <span>保存赛前快照</span>
          </button>

          {batchCount > 1 && onBatchAnalyzeAll && (
            <button
              type="button"
              onClick={onBatchAnalyzeAll}
              className="h-9 px-3 rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-xs font-medium text-slate-200 inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              <span>批量测谎 ({batchCount} 场)</span>
            </button>
          )}
        </div>

        {snapshotMessage && (
          <p role="status" className="text-xs text-slate-300 px-1">
            {snapshotMessage}
          </p>
        )}
      </div>
    </div>
  );
};
