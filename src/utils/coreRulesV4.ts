import type { FullMatchData } from '../types/fortuneActuary';

export const V4_RED_LINES = [
  '让步方胜赔明显下降、亚盘至少升两档，而大小球仍停在 2.5 或以下：非统治级球队列入观察，球队定位不明时先核实。',
  '客队让 1.25 球及以上：客场新贵列入观察，未标注客队定位时先核实。',
  '让步不足或等于一球，盘口未升，早晚盘让步方水位实际下降至 1.80 或以下：警惕浅盘降水，暂停列为核心候选。',
  '五串及以上的单式组合必须全部命中。组合拆分仍可能整体亏损，需逐场记录投入与回报。',
];

export function assessV4(data: FullMatchData, early: number, late: number, earlyGoals: number, lateGoals: number) {
  const home = late < 0;
  const profile = home ? data.matchInfo.homeProfile : data.matchInfo.awayProfile;
  const known = profile === 'dominant' || profile === 'challenger' || profile === 'ordinary';
  const earlyPrice = home ? data.euroOdds.earlyWin : data.euroOdds.earlyLoss;
  const price = home ? data.euroOdds.lateWin : data.euroOdds.lateLoss;
  const earlyWater = home ? data.asianHandicap.earlyHomeOdds : data.asianHandicap.earlyAwayOdds;
  const water = home ? data.asianHandicap.lateHomeOdds : data.asianHandicap.lateAwayOdds;
  const sameSide = early === 0 || Math.sign(early) === Math.sign(late);
  const step = Math.abs(late) - Math.abs(early);
  const notes: string[] = [];
  const complete = [early, late, earlyGoals, lateGoals].every(Number.isFinite)
    && [earlyPrice, price, earlyWater, water].every(n => Number.isFinite(n) && n > 1)
    && !!data.overUnder.earlyLine && !!data.overUnder.lateLine
    && !!data.asianHandicap.earlyHandicap && !!data.asianHandicap.lateHandicap;
  if (!complete) notes.push('早晚盘行情不完整，需补充数据。');
  if (complete && late !== 0 && sameSide && step >= 0.5 && earlyPrice - price >= 0.18 - 1e-9
      && lateGoals === earlyGoals && lateGoals <= 2.5 && profile !== 'dominant') {
    notes.push(known ? '非统治级球队跨档升盘，大小球未同步上调。' : '跨档升盘但大小球未动，请核实让步方是否具备统治级实力。');
  }
  if (late >= 1.25 && (!known || profile === 'challenger')) {
    notes.push(known ? '客场新贵让 1.25 球或更深，深盘列入观察。' : '客队让 1.25 球或更深，需核实客队定位。');
  }
  if (complete && late !== 0 && late === early && Math.abs(late) <= 1 && water <= 1.80 && water < earlyWater) {
    notes.push('一球以内原盘降至低水，盘口未同步升深。');
  }
  const confirmed = complete && late !== 0 && sameSide && earlyPrice > price && lateGoals >= earlyGoals
    && (step > 0 || (step === 0 && water < earlyWater));
  return { notes, confirmed };
}
