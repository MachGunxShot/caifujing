import {
  FullMatchData,
  ActuarialMetrics,
  AnalysisReportResult,
  ManipulationModelType,
} from '../types/fortuneActuary';

/**
 * Standardize handicap string to numeric handicap from Home perspective
 * Convention:
 * Negative (< 0): Home gives handicap (e.g. "半球" -> -0.5, "一球" -> -1.0)
 * Positive (> 0): Away gives handicap, Home receives (e.g. "受半球" -> +0.5, "受球半" -> +1.5)
 * Zero (=== 0): Even / Scratch (e.g. "平手" -> 0)
 */
export function parseHandicapValue(line: string): number {
  if (!line) return 0;
  const cleaned = line.trim();

  // Common Chinese football handicap mappings
  const isSuffer = cleaned.includes('受') || cleaned.includes('受让') || cleaned.includes('客让');
  let base = 0;

  if (cleaned.includes('两球半/三球') || cleaned.includes('2.75')) base = 2.75;
  else if (cleaned.includes('两球半') || cleaned.includes('2.5')) base = 2.5;
  else if (cleaned.includes('两球/两球半') || cleaned.includes('2.25')) base = 2.25;
  else if (cleaned.includes('两球') || cleaned.includes('2.0')) base = 2.0;
  else if (cleaned.includes('球半/两球') || cleaned.includes('1.75')) base = 1.75;
  else if (cleaned.includes('球半') || cleaned.includes('1.5')) base = 1.5;
  else if (cleaned.includes('一球/球半') || cleaned.includes('1.25')) base = 1.25;
  else if (cleaned.includes('一球') || cleaned.includes('1.0')) base = 1.0;
  else if (cleaned.includes('半一') || cleaned.includes('0.75')) base = 0.75;
  else if (cleaned.includes('半球') || cleaned.includes('0.5')) base = 0.5;
  else if (cleaned.includes('平半') || cleaned.includes('0.25')) base = 0.25;
  else if (cleaned.includes('平手') || cleaned.includes('0')) base = 0;
  else {
    const parsedNum = parseFloat(cleaned);
    if (!isNaN(parsedNum)) {
      base = Math.abs(parsedNum);
    }
  }

  if (isSuffer) {
    return base;
  }

  // Explicit signed numbers
  if (cleaned.startsWith('+')) {
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : Math.abs(num);
  }
  if (cleaned.startsWith('-')) {
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : -Math.abs(num);
  }

  return -base;
}

export function parseOverUnderValue(line: string): number {
  if (!line) return 2.5;
  const num = parseFloat(line);
  if (!isNaN(num)) return num;

  if (line.includes('3/3.5') || line.includes('3.25')) return 3.25;
  if (line.includes('2.5/3') || line.includes('2.75')) return 2.75;
  if (line.includes('2/2.5') || line.includes('2.25')) return 2.25;
  if (line.includes('3.5')) return 3.5;
  if (line.includes('3')) return 3.0;
  if (line.includes('2.5')) return 2.5;
  if (line.includes('2')) return 2.0;
  return 2.5;
}

export function computeActuarialMetrics(data: FullMatchData): ActuarialMetrics {
  const { earlyWin, earlyDraw, earlyLoss, lateWin, lateDraw, lateLoss } = data.euroOdds;

  // 欧指返还率
  const earlyReturnRate = earlyWin > 0 && earlyDraw > 0 && earlyLoss > 0
    ? (1 / (1 / earlyWin + 1 / earlyDraw + 1 / earlyLoss)) * 100
    : 94;
  const lateReturnRate = lateWin > 0 && lateDraw > 0 && lateLoss > 0
    ? (1 / (1 / lateWin + 1 / lateDraw + 1 / lateLoss)) * 100
    : 94;

  // 隐含概率 (已去除机构抽水)
  const eTotal = (1 / earlyWin) + (1 / earlyDraw) + (1 / earlyLoss);
  const earlyHomeProb = ((1 / earlyWin) / eTotal) * 100;
  const earlyDrawProb = ((1 / earlyDraw) / eTotal) * 100;
  const earlyAwayProb = ((1 / earlyLoss) / eTotal) * 100;

  const lTotal = (1 / lateWin) + (1 / lateDraw) + (1 / lateLoss);
  const lateHomeProb = ((1 / lateWin) / lTotal) * 100;
  const lateDrawProb = ((1 / lateDraw) / lTotal) * 100;
  const lateAwayProb = ((1 / lateLoss) / lTotal) * 100;

  // 趋势判断
  const winDiff = lateWin - earlyWin;
  const winTrend = winDiff <= -0.05 ? 'DROP' : winDiff >= 0.05 ? 'RISE' : 'STABLE';

  const drawDiff = lateDraw - earlyDraw;
  const drawTrend = drawDiff <= -0.05 ? 'DROP' : drawDiff >= 0.05 ? 'RISE' : 'STABLE';

  const lossDiff = lateLoss - earlyLoss;
  const lossTrend = lossDiff <= -0.05 ? 'DROP' : lossDiff >= 0.05 ? 'RISE' : 'STABLE';

  const earlyHandicapNum = parseHandicapValue(data.asianHandicap.earlyHandicap);
  const lateHandicapNum = parseHandicapValue(data.asianHandicap.lateHandicap);

  // Identify favorite (giving handicap) vs underdog (receiving handicap)
  const isHomeFavorite = lateHandicapNum < 0 || (lateHandicapNum === 0 && lateWin <= lateLoss);
  const isAwayFavorite = lateHandicapNum > 0 || (lateHandicapNum === 0 && lateLoss < lateWin);
  const handicapGoals = Math.abs(lateHandicapNum);

  const favoriteOdds = isHomeFavorite ? data.asianHandicap.lateHomeOdds : data.asianHandicap.lateAwayOdds;
  const favoriteEarlyOdds = isHomeFavorite ? data.asianHandicap.earlyHomeOdds : data.asianHandicap.earlyAwayOdds;
  const favoriteEuroLate = isHomeFavorite ? lateWin : lateLoss;
  const favoriteEuroTrend = isHomeFavorite ? winTrend : lossTrend;

  // Favorite handicap movement: UP_LINE (升盘 - giving more), DOWN_LINE (退盘 - giving less), SAME_LINE
  const isFavoriteUpLine = isHomeFavorite
    ? lateHandicapNum < earlyHandicapNum
    : lateHandicapNum > earlyHandicapNum;
  const isFavoriteDownLine = isHomeFavorite
    ? lateHandicapNum > earlyHandicapNum
    : lateHandicapNum < earlyHandicapNum;
  const isFavoriteSameLine = lateHandicapNum === earlyHandicapNum;

  const asianTrend = isFavoriteUpLine ? 'UP_LINE' : isFavoriteDownLine ? 'DOWN_LINE' : 'SAME_LINE';

  const homeWaterDiff = data.asianHandicap.lateHomeOdds - data.asianHandicap.earlyHomeOdds;
  const homeWaterTrend = homeWaterDiff <= -0.05 ? 'DROP' : homeWaterDiff >= 0.05 ? 'RISE' : 'STABLE';

  // 操盘模型匹配检测
  const detectedModels: ActuarialMetrics['detectedModels'] = [];

  // 1. 【极限榨水 / 正向控赔】
  // 欧赔持续下调，亚指维持原盘或升盘，上盘水位砸至 <1.82 极低水 -> 真风控控赔，正路可做稳胆
  if (
    (favoriteEuroTrend === 'DROP' || favoriteEuroLate < 1.68) &&
    (isFavoriteSameLine || isFavoriteUpLine) &&
    favoriteOdds <= 1.82
  ) {
    const favTeamName = isHomeFavorite ? data.matchInfo.homeTeam : data.matchInfo.awayTeam;
    detectedModels.push({
      model: 'POSITIVE_CONTROL',
      title: '【极限榨水 / 正向控赔】',
      confidence: 92,
      description: `欧赔让球方（${favTeamName}）胜赔持续下调压制，亚指将上盘水位极限压缩至 ${favoriteOdds.toFixed(2)} 超低水区域，机构用赔付红利剥削实现真正的防范性控赔，正路可信度极高。`,
      riskLevel: 'LOW_RISK_SOLID',
    });
  }

  // 2. 【高息吸筹 / 杀猪盘诱导 / 欧赔暴涨出货】
  // 核心形态A：让步方欧赔遭遇毁灭性抛售暴涨（如初盘 1.72~1.75 狂飙至 2.00+，涨幅>=0.18），庄家弃守逃离，亚指挂满水或毒药盘诱上
  // 核心形态B：借名气题材强升盘，但水位死卡 1.98~2.15 超高水/满水 -> 大热必死，公开诱上
  const favoriteEuroJump = favoriteEuroLate - (isHomeFavorite ? earlyWin : earlyLoss);
  const isEuroMassiveSurge = favoriteEuroJump >= 0.18 || (favoriteEuroLate >= 1.98 && (isHomeFavorite ? earlyWin : earlyLoss) <= 1.78);
  const isHighWaterTrap = favoriteOdds >= 1.98;

  if (
    (isFavoriteUpLine && isHighWaterTrap) ||
    (isEuroMassiveSurge && (isHighWaterTrap || isFavoriteSameLine || isFavoriteUpLine))
  ) {
    const favTeamName = isHomeFavorite ? data.matchInfo.homeTeam : data.matchInfo.awayTeam;
    const underTeamName = isHomeFavorite ? data.matchInfo.awayTeam : data.matchInfo.homeTeam;
    detectedModels.push({
      model: 'HIGH_INTEREST_TRAP',
      title: isEuroMassiveSurge ? '【欧赔暴涨抛售 / 头号杀猪盘】' : '【高息吸筹 / 名气诱导】',
      confidence: 96,
      description: isEuroMassiveSurge
        ? `让步方（${favTeamName}）欧指胜赔遭遇毁灭性抛售暴涨（跳涨 +${favoriteEuroJump.toFixed(2)} 至 ${favoriteEuroLate.toFixed(2)}），亚指挂 ${favoriteOdds.toFixed(2)} 毒药高水/满水诱导，机构利用名气虚张声势掩护出货，庄家底牌直指客胜/下盘【${underTeamName}】反杀！`
        : `借强队（${favTeamName}）名气或题材强行升盘制造让步坚挺假象，但上盘水位长期高挂 ${favoriteOdds.toFixed(2)} 满水利诱筹码，符合“高息吸筹”典型收割形态，大热必死。`,
      riskLevel: 'HIGH_RISK_TRAP',
    });
  }

  // 3. 【雪崩退盘 / 退热示弱】
  // 临场剧烈退盘升水。常规透明联赛为核心伤停/利空坐实（跟退盘）；豪门无利空反常退盘为暴力洗盘
  if (
    isFavoriteDownLine &&
    (favoriteOdds >= favoriteEarlyOdds || favoriteOdds > 1.90)
  ) {
    const favTeamName = isHomeFavorite ? data.matchInfo.homeTeam : data.matchInfo.awayTeam;
    detectedModels.push({
      model: 'AVALANCHE_RETREAT' as ManipulationModelType,
      title: '【雪崩退盘 / 退热示弱】',
      confidence: 88,
      description: `临场机构主动降低让步方（${favTeamName}）防线（退盘）并配以中高水，在透明联赛多为主力伤停或大庄获悉内幕利空坐实，切忌盲目贪便宜抄底上盘。`,
      riskLevel: 'UPSET_WARNING',
    });
  }

  // 4. 【平赔低洼 / 平赔排雷】
  // 欧平平赔死压至 <3.00（竞彩 <2.75），胜负盘平手/平半 -> 严防平局真实避险，首选胆平
  const isShallowAsian = Math.abs(lateHandicapNum) <= 0.25;
  if (lateDraw <= 3.05 || (isShallowAsian && lateDraw <= 3.15 && drawTrend === 'DROP')) {
    detectedModels.push({
      model: 'LOW_DRAW_DEFENSE',
      title: '【平赔低洼 / 平赔排雷】',
      confidence: 90,
      description: `主流欧指平赔低压至 ${lateDraw.toFixed(2)} 的极端防御区间，亚指死卡在平手/平半浅盘，资金两头分流，庄家底牌直指防平。`,
      riskLevel: 'DRAW_DEFENSE',
    });
  }

  // 5. 【浅盘满水死亡】
  // 强队对中下游仅开平手/平半且长期挂 2.00+ 满水 -> 强队让步无力，大概率丢分，坚决走下盘
  if (
    Math.abs(lateHandicapNum) <= 0.25 &&
    favoriteOdds >= 1.98
  ) {
    const favTeamName = isHomeFavorite ? data.matchInfo.homeTeam : data.matchInfo.awayTeam;
    detectedModels.push({
      model: 'SHALLOW_FULL_WATER',
      title: '【浅盘满水死亡】',
      confidence: 89,
      description: `强队（${favTeamName}）名气占优，却只能开出平手/平半的无力浅盘，且上盘水位长期高挂 ${favoriteOdds.toFixed(2)} 满水，机构毫不惧怕打出，预警冷门爆发。`,
      riskLevel: 'HIGH_RISK_TRAP',
    });
  }

  // 大小球联动测谎
  const lateOUNum = parseOverUnderValue(data.overUnder.lateLine);
  let overUnderVerdict = '大小球与胜负盘基本处于合理区间';

  if (Math.abs(lateHandicapNum) >= 1.25 && lateOUNum <= 2.25) {
    overUnderVerdict = '【深让步 (-1.25+) + 浅大小球 (<=2.25)】：让步深但进球数极浅，机构严防强队控场小胜或破门乏力，强烈指向 1-0、2-0 经济型赛果，测谎判定首选小球！';
  } else if (Math.abs(lateHandicapNum) <= 0.5 && lateOUNum >= 3.25) {
    overUnderVerdict = '【浅让步 (半球/平半) + 巨型大小球 (>=3.25)】：让步无力却深开巨型大小球，全场进入狂轰对攻格局，两队防线形同虚设，强队极易遭遇后防穿透爆大冷（警惕 1-2、2-3、0-1 反杀）；测谎判定胜负警惕下盘爆冷，进球数首选大球！';
  } else if (Math.abs(lateHandicapNum) <= 0.25 && lateOUNum >= 2.75) {
    overUnderVerdict = '【浅让步 (平手/平半) + 深大小球 (>=2.75)】：胜负让步虚无，但大小球被暴力拉深至高位，揭示两队防线形同虚设，战术大开大合，机构真实底牌引导对攻，测谎判定直追大球！';
  } else if (lateOUNum === 2.5 && data.overUnder.lateOverOdds < data.overUnder.earlyOverOdds && data.overUnder.lateOverOdds > 1.85) {
    overUnderVerdict = '【大球题材 + 死卡 2.5 仅降水不升盘】：市场充斥大球热度，但盘口纹丝不动仅做微降水诱惑，典型的假大球双向收割陷阱，建议反向防小！';
  }

  // 欧亚偏离度简述
  const handicapDiscrepancy = `欧亚对齐度：晚盘欧指主胜折合理论盘口约 ${getTheoreticalHandicap(lateWin)}，实际即时盘为 ${data.asianHandicap.lateHandicap}（水位 ${data.asianHandicap.lateHomeOdds.toFixed(2)}）。`;

  return {
    earlyReturnRate,
    lateReturnRate,
    earlyHomeProb,
    earlyDrawProb,
    earlyAwayProb,
    lateHomeProb,
    lateDrawProb,
    lateAwayProb,
    winTrend,
    drawTrend,
    lossTrend,
    asianTrend,
    homeWaterTrend,
    detectedModels,
    overUnderVerdict,
    handicapDiscrepancy,
  };
}

function getTheoreticalHandicap(winOdds: number): string {
  if (winOdds <= 1.18) return '两球半以上';
  if (winOdds <= 1.28) return '两球/两球半';
  if (winOdds <= 1.38) return '球半/两球';
  if (winOdds <= 1.50) return '球半';
  if (winOdds <= 1.65) return '一球/球半';
  if (winOdds <= 1.85) return '半一';
  if (winOdds <= 2.10) return '半球';
  if (winOdds <= 2.40) return '平半';
  return '平手/受让';
}

/**
 * Automatically derives consistent, mathematically sound reference scores
 * aligning with euroPick, handicapPick, and overUnderPick
 */
export function calculateConsistentPredictedScores(
  euroPick: string,
  handicapPick: string,
  overUnderPick: string,
  lateOUNum: number,
  lateHandicapNum: number
): string[] {
  const isDrawFavored =
    euroPick.includes('胆平') ||
    (euroPick.includes('平') && !euroPick.includes('主胜') && !euroPick.includes('客胜'));

  const isAwayFavored =
    euroPick.includes('客胜') ||
    euroPick.includes('客队不败') ||
    euroPick.includes('让球负') ||
    (handicapPick.includes('下盘') && handicapPick.includes('客') && !euroPick.includes('主胜'));

  const isOver = overUnderPick.includes('大球') || lateOUNum >= 2.75;

  if (isDrawFavored) {
    if (isOver) {
      return ['2-2', '1-1', '3-3'];
    }
    return ['1-1', '0-0', '2-2'];
  }

  // Dual-directional hedge: Euro Home Win + Handicap Underdog (protecting against 1-goal margin win)
  if (euroPick.includes('主胜') && handicapPick.includes('下盘')) {
    return isOver ? ['2-1', '3-1', '1-1'] : ['1-0', '2-1', '1-1'];
  }

  // Dual-directional hedge: Euro Away Win + Handicap Underdog (protecting against 1-goal margin win)
  if (euroPick.includes('客胜') && handicapPick.includes('下盘')) {
    return isOver ? ['1-2', '1-3', '1-1'] : ['0-1', '1-2', '1-1'];
  }

  if (isAwayFavored) {
    if (Math.abs(lateHandicapNum) >= 1.25 && lateHandicapNum > 0) {
      // Away deep favorite (e.g. 摩尔多瓦 vs 斯洛伐克)
      return isOver ? ['0-3', '0-4', '1-3'] : ['0-2', '0-3', '1-2'];
    }
    if (isOver) {
      return ['1-2', '0-2', '1-3'];
    }
    return ['0-1', '1-2', '0-2'];
  }

  // Home favored (主胜 / 上盘)
  if (Math.abs(lateHandicapNum) >= 1.25 && lateHandicapNum < 0) {
    // Home deep favorite (e.g. 法国 vs 比利时)
    return isOver ? ['3-1', '4-1', '3-0'] : ['2-0', '3-0', '2-1'];
  }

  if (isOver) {
    return ['2-1', '3-1', '2-0'];
  }
  return ['1-0', '2-0', '2-1'];
}

/**
 * Deterministic fallback generator strictly adhering to the 3 output sections required by the user
 */
export function generateActuarialRuleReport(data: FullMatchData): AnalysisReportResult {
  const metrics = computeActuarialMetrics(data);
  // Sort detectedModels by confidence in descending order so the highest conviction model leads
  const sortedModels = [...metrics.detectedModels].sort((a, b) => b.confidence - a.confidence);
  const primaryModel = sortedModels[0] || {
    model: 'UNCLASSIFIED' as ManipulationModelType,
    title: '【复合博弈调仓盘】',
    confidence: 80,
    description: '盘口处于常规资金调和期，需警惕临场最后30分钟的二次变轨。',
    riskLevel: 'LOW_RISK_SOLID',
  };

  const { homeTeam, awayTeam, league } = data.matchInfo;
  const { lateHandicap, lateHomeOdds, lateAwayOdds } = data.asianHandicap;
  const { lateWin, lateDraw, lateLoss } = data.euroOdds;
  const lateHandicapNum = parseHandicapValue(lateHandicap);
  const lateOUNum = parseOverUnderValue(data.overUnder.lateLine);

  const isHomeGiving = lateHandicapNum < 0;
  const isAwayGiving = lateHandicapNum > 0;
  const handicapGoals = Math.abs(lateHandicapNum);

  const givingTeam = isHomeGiving ? homeTeam : isAwayGiving ? awayTeam : (lateWin <= lateLoss ? homeTeam : awayTeam);
  const receivingTeam = isHomeGiving ? awayTeam : isAwayGiving ? homeTeam : (lateWin <= lateLoss ? awayTeam : homeTeam);
  const givingOdds = isHomeGiving ? lateHomeOdds : isAwayGiving ? lateAwayOdds : (lateWin <= lateLoss ? lateHomeOdds : lateAwayOdds);
  const givingEuroLate = isHomeGiving ? lateWin : isAwayGiving ? lateLoss : (lateWin <= lateLoss ? lateWin : lateLoss);

  let firstImpression = '';
  let threeDimLieDetection = '';
  let finalDirection = '';
  let finalDirectionDetail = '';
  let riskWarning = '';

  let starRating = 3;
  let euroPick = '主胜';
  let handicapPick = `上盘 ${homeTeam}`;
  let overUnderPick = `小球 (<=${data.overUnder.lateLine})`;
  let predictedScores: string[] = ['1-0', '2-0', '1-1'];
  let confidenceReason = '常规盘赔调和';

  switch (primaryModel.model) {
    case 'POSITIVE_CONTROL': {
      firstImpression = `【定性：正向控赔稳胆】本场 ${league} ${homeTeam} 对阵 ${awayTeam}，盘面呈现纯粹的“极限榨水 / 正向控赔”特征。机构在早盘确认双方战力与基本面后，晚盘并未借助名气虚晃升盘诱导，而是欧赔让步方（${givingTeam}）胜赔持续下调，同时亚指将 ${givingTeam} 水位强行砸至 ${givingOdds.toFixed(2)} 的极端超低水区域。大庄宁愿剥夺彩民的盈利倍率，也不愿承担高赔付风险，这是机构为了不赔钱而做出的最纯粹的避险调仓。`;
      threeDimLieDetection = `三维联动交叉验证：
1. 亚盘水位维度：${lateHandicap} 盘口搭配 ${givingTeam} ${givingOdds.toFixed(2)} 低水位，完全没有“天上掉馅饼”的暴利空间，彻底断绝投机客贪高水心理。
2. 欧赔走势维度：让步方欧指胜赔持续下调，平赔与负赔同步抬升，欧亚换算严丝合缝，没有出现欧降亚升的虚热背离。
3. 大小球联动维度：${metrics.overUnderVerdict}。盘面整体逻辑自洽，无资金诱导死角，早盘意图与晚盘风控底牌高度一致。`;

      // 梯次星级精算：<=1.76 或 (<=1.80 且欧赔持续大降或低赔 <=1.55) 为5星稳胆；1.77~1.84 为4星次稳优质档
      const isExtremePositive =
        givingOdds <= 1.76 ||
        (givingOdds <= 1.80 && (givingEuroLate <= 1.55 || metrics.winTrend === 'DROP' || metrics.lossTrend === 'DROP'));

      if (isExtremePositive) {
        starRating = 5;
        confidenceReason = `机构真实避险下调 ${givingTeam} 胜赔，水位强砸至 ${givingOdds.toFixed(2)} 冰点低水，5星顶级稳胆。`;
      } else {
        starRating = 4;
        confidenceReason = `机构维持让步方（${givingTeam}）低水控赔区间（${givingOdds.toFixed(2)}），正路避险打出意图明确，4星次稳优质胆。`;
      }

      if (isHomeGiving) {
        euroPick = isExtremePositive ? '主胜 (稳胆)' : '主胜';
        handicapPick = `上盘 ${homeTeam} (${lateHandicap})`;
        finalDirection = `【推荐方向】：主队（上盘 ${homeTeam} ${lateHandicap}）及主胜稳胆`;
        finalDirectionDetail = handicapGoals >= 1.25
          ? `竞彩/盘口：主胜独赢 / 亚指上盘；机构真实避险控赔，首选上盘净胜穿盘大胜。`
          : handicapGoals === 1.0
          ? `竞彩/盘口：主胜独赢 / 亚指上盘；机构真实避险控赔，首选主胜赢球保走争穿。`
          : `竞彩/盘口：主胜独赢 / 亚指上盘；机构真实避险控赔，首选上盘正路赢盘打出。`;
      } else if (isAwayGiving) {
        euroPick = isExtremePositive ? '客胜 (稳胆)' : '客胜';
        handicapPick = `上盘 ${awayTeam} (-${handicapGoals}客让)`;
        finalDirection = `【推荐方向】：客队（上盘 ${awayTeam} 客让${handicapGoals}球）及客胜稳胆`;
        finalDirectionDetail = handicapGoals >= 1.25
          ? `竞彩/盘口：客胜独赢 / 亚指客让上盘；机构真实避险控赔，首选客队净胜穿盘大胜。`
          : handicapGoals === 1.0
          ? `竞彩/盘口：客胜独赢 / 亚指客让上盘；机构真实避险控赔，首选客队赢球保走争穿。`
          : `竞彩/盘口：客胜独赢 / 亚指客让上盘；机构真实避险控赔，首选客队正路赢盘打出。`;
      } else {
        euroPick = lateWin <= lateLoss ? '主胜 (稳胆)' : '客胜 (稳胆)';
        handicapPick = `平手盘 ${givingTeam} (0)`;
        finalDirection = `【推荐方向】：${givingTeam} 平手盘及独赢稳胆`;
        finalDirectionDetail = `竞彩/盘口：平手盘保平争胜；机构压低水位控赔。`;
      }

      overUnderPick = lateOUNum <= 2.25 ? `小球 (<=${data.overUnder.lateLine})` : `大球 (>=${data.overUnder.lateLine})`;
      riskWarning = `避坑风险提示：此类超低水盘面切忌因“赔率过低、回报太少”而盲目博冷去下盘。大庄的底牌已毫无保留地向让步强队倾斜，顺应机构风控是唯一正解。`;
      break;
    }

    case 'HIGH_INTEREST_TRAP': {
      firstImpression = `【定性：高息诱上 / 杀猪盘出货陷阱】本场 ${homeTeam} 对阵 ${awayTeam} 是极其标准的“高息吸筹 / 欧赔暴涨出货”杀猪盘。机构充分利用 ${givingTeam} 的主场名气与抢分题材虚张声势，但在晚盘关键时刻致命死穴暴露无遗：让步方 ${givingTeam} 胜赔在主流欧指与官方遭遇剧烈抛售跳涨（晚盘飙升至 ${givingEuroLate.toFixed(2)}），亚指同时死死卡在 ${givingOdds.toFixed(2)} 毒药满水甚至强开方便之门！《财富经》核心铁律：天上不会掉无缘无故的馅饼，买得太舒服且回报率异常丰厚，必是机构请君入瓮掩护下盘反杀的诱导杀猪陷阱。`;
      threeDimLieDetection = `三维联动交叉验证：
1. 亚盘水位维度：亚指上盘长期悬挂 ${givingOdds.toFixed(2)} 毒药满水（客水被狠砸至低水），若庄家真怕上盘打出，绝不敢长期提供如此高额的暴利筹码供市场白捡。
2. 欧赔走势维度：让步方欧指并未出现深幅夯实，反而遭遇断崖式抛售暴涨，受让方（${receivingTeam}）胜平赔持续压低，欧亚折算呈现明显的“虚张声势掩护出货”，机构在用盘口障眼法为强队吸纳巨量筹码。
3. 大小球与北单去水联动维度：${metrics.overUnderVerdict}。若配合让负去水或受让赔率持续走低，下盘 ${receivingTeam} 爆冷不败甚至客胜独赢形态已彻底确立。`;

      // 梯次星级精算：欧赔断崖跳涨 >=0.22 或 水位 >=2.05 满水毒药盘 或 多模型重合 -> 5星顶级杀猪盘；常规诱上 -> 4星重点防冷档
      const earlyEuroFav = isHomeGiving ? data.euroOdds.earlyWin : data.euroOdds.earlyLoss;
      const favEuroJump = givingEuroLate - earlyEuroFav;
      const isExtremeTrap =
        favEuroJump >= 0.22 ||
        givingOdds >= 2.05 ||
        (givingEuroLate >= 2.02 && earlyEuroFav <= 1.78) ||
        metrics.detectedModels.length >= 2;

      if (isExtremeTrap) {
        starRating = 5;
        confidenceReason = `让步方（${givingTeam}）欧赔断崖暴涨、亚指死卡满水出货，大热必死，反选5星顶级杀猪盘。`;
      } else {
        starRating = 4;
        confidenceReason = `让步方（${givingTeam}）高水利诱筹码，存在明显诱上出货痕迹，反选下盘4星重点防冷。`;
      }

      if (isHomeGiving) {
        euroPick = '让球负 (客队受让胜)';
        handicapPick = `下盘 ${awayTeam} (+${handicapGoals}受让)`;
        finalDirection = `【推荐方向】：客队（下盘 ${awayTeam} +${handicapGoals}受让）坚决反选`;
        finalDirectionDetail = `竞彩/盘口：让球客胜（客队受让赢盘） / 重点防平局客胜爆大冷（0-1、1-2、1-1）；坚决不碰主队上盘毒药满水。`;
      } else if (isAwayGiving) {
        euroPick = '让球胜 (主队受让胜)';
        handicapPick = `下盘 ${homeTeam} (+${handicapGoals}受让)`;
        finalDirection = `【推荐方向】：主队（下盘 ${homeTeam} +${handicapGoals}受让）坚决反选`;
        finalDirectionDetail = `竞彩/盘口：让球主胜（主队受让赢盘） / 重点防主队爆冷不败（1-0、2-1、1-1）；坚决不碰客队上盘毒药满水。`;
      } else {
        euroPick = '平 / 负';
        handicapPick = `下盘 ${receivingTeam} (+0)`;
        finalDirection = `【推荐方向】：${receivingTeam} 受让不败`;
        finalDirectionDetail = `高水诱盘，反选低水受让方。`;
      }

      overUnderPick = lateOUNum >= 2.75 ? `大球 (>=${data.overUnder.lateLine})` : `小球 (<=${data.overUnder.lateLine})`;
      riskWarning = `避坑风险提示：千万警惕名气虚火与主队情怀！凡是“让步方高水出货、欧赔反常狂飙暴涨”的杀猪盘，99% 为机构收割局，坚决不碰上盘，拥抱下盘避风港。`;
      break;
    }

    case 'AVALANCHE_RETREAT': {
      firstImpression = `【定性：雪崩退盘 / 避险退热】盘面特征归属于“雪崩退盘 / 退热示弱”。初盘 ${data.asianHandicap.earlyHandicap} 在晚盘临场资金大举介入时剧烈下调防线至 ${lateHandicap}，让球方 ${givingTeam} 水位反弹至 ${givingOdds.toFixed(2)}。在现代足彩精算体系中，正规透明联赛无端退盘升水，往往是机构核心风控提前捕捉到了未公开的核心利空（如主力伤停、更衣室内讧或更深层的轮换）而做出的紧急避险。`;
      threeDimLieDetection = `三维联动交叉验证：
1. 亚盘水位维度：机构主动示弱退盘，放弃第一道阻击线，将赔付压力向受让方（${receivingTeam}）倾斜。
2. 欧赔走势维度：让步方欧指大幅抬高，平赔低压或受让方胜赔暴跌，欧赔异动彻底证伪了早盘对让步方的信心。
3. 大小球联动维度：${metrics.overUnderVerdict}。进球数防线伴随胜负盘同步收缩，反映出让球方在进攻端存在难以弥补的硬伤。`;

      // 梯次星级精算：深度雪崩（跨两档）或欧赔胜赔飙涨 >=0.25 为5星顶级防冷；常规退盘为4星防冷档
      const earlyHandicapVal = parseHandicapValue(data.asianHandicap.earlyHandicap);
      const isDeepAvalanche = Math.abs(lateHandicapNum - earlyHandicapVal) >= 0.5;

      if (isDeepAvalanche) {
        starRating = 5;
        confidenceReason = `临场让球方防线深度崩溃退盘，机构彻底弃守，反选下盘5星顶级防冷。`;
      } else {
        starRating = 4;
        confidenceReason = `临场让球方退盘升水，核心利空坐实，跟退盘4星重点防冷。`;
      }

      if (isHomeGiving) {
        euroPick = '平 / 负 (客队不败)';
        handicapPick = `下盘 ${awayTeam} (+${handicapGoals}受让)`;
        finalDirection = `【推荐方向】：客队（下盘 ${awayTeam} +${handicapGoals}受让）`;
        finalDirectionDetail = `竞彩/盘口：让球平负 / 客队不败；主力利空坐实，跟退盘走向下盘。`;
      } else {
        euroPick = '胜 / 平 (主队不败)';
        handicapPick = `下盘 ${homeTeam} (+${handicapGoals}受让)`;
        finalDirection = `【推荐方向】：主队（下盘 ${homeTeam} +${handicapGoals}受让）`;
        finalDirectionDetail = `竞彩/盘口：让球胜平 / 主队不败；客让退盘示弱，跟退盘走主队。`;
      }

      overUnderPick = `小球 (<=${data.overUnder.lateLine})`;
      riskWarning = `避坑风险提示：切勿抱有“豪门退盘捡便宜上车”的侥幸心理。透明联赛临场剧烈退盘，大庄是在止损避险，跟退盘者存，盲抄底者亡。`;
      break;
    }

    case 'LOW_DRAW_DEFENSE': {
      firstImpression = `【定性：平赔绝对风控】本场呈现极其罕见的“平赔低洼 / 严防平局”操盘图景。主流欧指平赔已一路被机构死死压制在 ${lateDraw.toFixed(2)} 的极端低洼水位（竞彩甚至低于2.70区间），亚指则胶着在 ${lateHandicap} 的极浅区间。两端胜负水位上下摇摆作为幌子，实际上庄家真实风控底牌已全部押注在“防范平局穿透”之上。`;
      threeDimLieDetection = `三维联动交叉验证：
1. 亚盘水位维度：亚指在平手与平半之间来回横跳拉扯，两端筹码高度对冲，机构刻意淡化胜负两头的倾向性。
2. 欧赔走势维度：平赔 ${lateDraw.toFixed(2)} 异常低企，凯利指数在平局上形成牢不可破的安全垫，主胜与客胜均缺乏绝对防范价值。
3. 大小球联动维度：${metrics.overUnderVerdict}。与平局模型最契合的比分多为小球对峙。`;

      // 梯次星级精算：平赔 <= 2.90 为5星绝对胆平；2.91~3.10 为4星防冷防平档
      if (lateDraw <= 2.90) {
        starRating = 5;
        confidenceReason = `主流欧指平赔死压至 ${lateDraw.toFixed(2)} 极度防御区，两端分流打掩护，5星绝对胆平。`;
      } else {
        starRating = 4;
        confidenceReason = `平赔压制在 ${lateDraw.toFixed(2)} 低位防御带，两端胶着严防平局，4星防冷防平。`;
      }

      euroPick = starRating === 5 ? '平局 (首选胆平)' : '平局 / 让球胜平';
      handicapPick = `下盘 ${receivingTeam} (+${handicapGoals || 0.25}/平手)`;
      finalDirection = `【推荐方向】：首选平局（胆平 / 下盘受让平局），次选小球`;
      finalDirectionDetail = `竞彩/盘口：直接博平局 (Draw) / 双选平+让平；比分参考 1-1、0-0`;
      riskWarning = `避坑风险提示：不要试图在主客胜两头寻找所谓的价值，平赔压至3.00以下是机构最明确的预警红线，两头下注极易被精准绝杀。`;
      overUnderPick = `小球 (<=${data.overUnder.lateLine})`;
      break;
    }

    case 'SHALLOW_FULL_WATER': {
      firstImpression = `【定性：浅盘满水死亡陷阱】本场盘面触发《财富经》经典杀招“浅盘满水死亡”。${givingTeam} 面对排名或实力处于下风的 ${receivingTeam}，盘口仅仅开出 ${lateHandicap} 的无力浅盘，且水位长期高挂 ${givingOdds.toFixed(2)} 满水状态。优势被机构完全无视，阻力几乎为零，这是机构对强队完全不设防的典型态度。`;
      threeDimLieDetection = `三维联动交叉验证：
1. 亚盘水位维度：平手/平半盘挂 2.00+ 满水，给市场制造“强队不败、赢半博全、高赔暴利”的虚假舒适感，实则是机构大门敞开收割上盘筹码。
2. 欧赔走势维度：让步方欧赔居高不下，与两队真实战力严重脱节，受让方不败概率被严重低估。
3. 大小球联动维度：${metrics.overUnderVerdict}。`;

      // 梯次星级精算：浅盘满水天然为“4星重点防冷档”；当水位达到 >=2.08 或多模型叠加时晋级为5星顶级冷门
      if (givingOdds >= 2.08 || metrics.detectedModels.length >= 2) {
        starRating = 5;
        confidenceReason = `强队（${givingTeam}）浅盘死卡 ${givingOdds.toFixed(2)} 毒药超高水，机构大门敞开收割，5星必杀冷门下盘。`;
      } else {
        starRating = 4;
        confidenceReason = `强队（${givingTeam}）浅盘挂 ${givingOdds.toFixed(2)} 满水，阻力不足买得舒服必有诈，4星重点防冷坚决走下盘。`;
      }

      if (isHomeGiving) {
        euroPick = '让球负 (客胜/平)';
        handicapPick = `下盘 ${awayTeam} (+0.25/0)`;
        finalDirection = `【推荐方向】：坚决走下盘（${awayTeam} 不败）`;
        finalDirectionDetail = `竞彩/盘口：让球负（客队受让胜） / 博客队爆冷独赢；比分参考 0-1、1-2、1-1`;
      } else {
        euroPick = '让球胜 (主胜/平)';
        handicapPick = `下盘 ${homeTeam} (+0.25/0)`;
        finalDirection = `【推荐方向】：坚决走下盘（${homeTeam} 不败）`;
        finalDirectionDetail = `竞彩/盘口：让球胜（主队受让胜） / 博主队爆冷独赢；比分参考 1-0、2-1、1-1`;
      }
      overUnderPick = lateOUNum >= 2.75 ? `大球 (>=${data.overUnder.lateLine})` : `小球 (<=${data.overUnder.lateLine})`;
      riskWarning = `避坑风险提示：强队浅盘满水是足彩最大的温床陷阱。凡是买得太舒服的盘，99% 是送命题，果断舍弃强队情怀。`;
      break;
    }

    default: {
      firstImpression = `【定性：博弈调仓中性盘】本场 ${league} ${homeTeam} vs ${awayTeam} 晚盘处于机构资金的微调平衡期。即时盘口 ${lateHandicap} 配套主客水 ${lateHomeOdds.toFixed(2)} / ${lateAwayOdds.toFixed(2)}，欧指 ${lateWin.toFixed(2)} / ${lateDraw.toFixed(2)} / ${lateLoss.toFixed(2)}。需用晚盘最后阶段的急剧变水去证伪早盘的市场预期。`;
      threeDimLieDetection = `三维联动交叉验证：
1. 亚盘水位：即时水位未见极端两极分化，但需注意资金在临场前1小时的单向倾斜。
2. 欧赔走势：返还率 ${metrics.lateReturnRate.toFixed(1)}%，平局赔率 ${lateDraw.toFixed(2)}，三项分布处于博弈均衡线。
3. 大小球联动：${metrics.overUnderVerdict}。`;

      // 梯次星级精算：未分类盘口若出现极端大小球测谎偏离，可归为4星大小球联动精选；否则为3星常规博弈
      if (
        (Math.abs(lateHandicapNum) >= 1.25 && lateOUNum <= 2.0) ||
        (Math.abs(lateHandicapNum) <= 0.25 && lateOUNum >= 3.5)
      ) {
        starRating = 4;
        confidenceReason = '盘口虽处调仓期，但大小球与胜负盘呈现强烈异动测谎，4星大小球联动精选。';
      } else {
        starRating = 3;
        confidenceReason = '平手/常规博弈盘型，多空资金均衡博弈，3星常规博弈档。';
      }

      if (lateHandicapNum === 0) {
        // 平手均势盘
        if (lateWin <= lateLoss) {
          euroPick = '主胜 / 平';
          handicapPick = `平手盘 ${homeTeam} (0 / 保平争胜)`;
          finalDirection = `【推荐方向】：主队（平手盘 ${homeTeam} 0）及独赢保平争胜`;
          finalDirectionDetail = `竞彩/盘口：均势平手盘，欧赔主胜相对占优，首选主队保平争胜。`;
        } else {
          euroPick = '客队不败 (平/负)';
          handicapPick = `平手盘 ${awayTeam} (0 / 保平争胜)`;
          finalDirection = `【推荐方向】：客队（平手盘 ${awayTeam} 0）及客队不败`;
          finalDirectionDetail = `竞彩/盘口：均势平手盘，欧赔客队稍占上风，首选客队保平争胜。`;
        }
        confidenceReason = '平手均势盘型，结合欧指倾向首选低赔保平争胜。';
      } else if (lateHandicapNum < 0) {
        // 主队让球 (Home gives handicap)
        const goalCount = Math.abs(lateHandicapNum);

        if (goalCount <= 0.75) {
          // 浅盘区间 (0.25, 0.5, 0.75): 胜负与让球方向必须绝对一致，杜绝“主胜+受让下盘”荒谬倒挂
          if (lateWin <= lateLoss && lateHomeOdds <= 1.95) {
            euroPick = '主胜 / 平';
            handicapPick = `上盘 ${homeTeam} (-${goalCount}让球)`;
            finalDirection = `【推荐方向】：主队（上盘 ${homeTeam} -${goalCount}）及主胜保平争胜`;
            finalDirectionDetail = `浅让区间（-${goalCount}），主队胜面占优且让步门槛合理，首选主队上盘顺势打出。`;
            confidenceReason = `主让浅盘（-${goalCount}），欧亚顺路支持主队，首选上盘。`;
          } else {
            euroPick = '平 / 负 (客队受让不败)';
            handicapPick = `下盘 ${awayTeam} (+${goalCount}受让)`;
            finalDirection = `【推荐方向】：客队（下盘 ${awayTeam} +${goalCount}受让）`;
            finalDirectionDetail = `主让浅盘（-${goalCount}）水位阻力偏高或欧赔离散，防范冷平或客胜爆冷，首选客队下盘受让不败。`;
            confidenceReason = `主让浅盘水位承压，受让方 (+${goalCount}) 具备安全垫。`;
          }
        } else {
          // 深盘区间 (>= 1.0): 存在净胜1球但输盘/走盘的可能，支持合理对冲精算
          if (lateHomeOdds <= 1.85) {
            euroPick = '主胜 (稳选)';
            handicapPick = `上盘 ${homeTeam} (-${goalCount}让球)`;
            finalDirection = `【推荐方向】：主队（上盘 ${homeTeam} -${goalCount}让球）`;
            finalDirectionDetail = `主让深盘（-${goalCount}）配以低水控赔，主队实力占优，首选上盘穿盘大胜。`;
            confidenceReason = `深盘低水机构有效控水，看好主队穿盘。`;
          } else {
            euroPick = '主胜独赢 (防1球小胜)';
            handicapPick = `下盘 ${awayTeam} (+${goalCount}受让)`;
            finalDirection = `【推荐方向】：双向对冲（竞彩主胜独赢 + 亚指下盘 ${awayTeam} +${goalCount}受让）`;
            if (goalCount === 1.0) {
              finalDirectionDetail = `【操盘精算对冲】：胜平负维度主队赢面极大（首选主胜独赢）；但亚盘主让1球门槛偏高（需净胜2球赢全盘，净胜1球仅走盘退款）。实战重点防范主队 1-0 或 2-1 经济型1球小胜走盘，因此让球端首选受让方 (+1.0) 构建双重安全垫！`;
            } else if (goalCount === 1.25) {
              finalDirectionDetail = `【操盘精算对冲】：胜平负维度主队实力稳健（首选主胜独赢）；但亚盘主让1.25球门槛极高（需净胜2球赢全盘，净胜1球上盘输半/下盘赢半）。实战重点防范主队 1-0 或 2-1 经济型小胜赢球输半，因此让球端首选下盘受让方 (+1.25)！`;
            } else {
              finalDirectionDetail = `【操盘精算对冲】：胜平负维度主队实力更强（首选主胜独赢）；但亚盘主让${goalCount}球门槛过深（净胜1球上盘全输）。实战严防主队控场经济型小胜，因此让球端首选下盘受让方 (+${goalCount}) 赢盘对冲！`;
            }
            confidenceReason = `深让步存在小胜赢球输盘风险，采用主胜独赢+受让下盘对冲精算。`;
          }
        }
      } else {
        // 客队让球 (Away gives handicap)
        const goalCount = Math.abs(lateHandicapNum);

        if (goalCount <= 0.75) {
          // 客让浅盘区间 (0.25, 0.5, 0.75)
          if (lateLoss <= lateWin && lateAwayOdds <= 1.95) {
            euroPick = '客胜 / 平 (客队不败)';
            handicapPick = `上盘 ${awayTeam} (-${goalCount}客让)`;
            finalDirection = `【推荐方向】：客队（上盘 ${awayTeam} -${goalCount}客让）`;
            finalDirectionDetail = `客让浅盘（-${goalCount}）门槛合理，客队战力占优，首选客队上盘打出。`;
            confidenceReason = `客让浅盘欧亚顺向支持客队，首选客让上盘。`;
          } else {
            euroPick = '胜 / 平 (主队不败)';
            handicapPick = `下盘 ${homeTeam} (+${goalCount}受让)`;
            finalDirection = `【推荐方向】：主队（下盘 ${homeTeam} +${goalCount}受让）`;
            finalDirectionDetail = `客队浅让阻力不足且水位承压，主场优势凸显，首选主队受让不败。`;
            confidenceReason = `客让浅盘水位不稳，主队受让具备不败安全垫。`;
          }
        } else {
          // 客让深盘区间 (>= 1.0)
          if (lateAwayOdds <= 1.85) {
            euroPick = '客胜 (稳选)';
            handicapPick = `上盘 ${awayTeam} (-${goalCount}客让)`;
            finalDirection = `【推荐方向】：客队（上盘 ${awayTeam} -${goalCount}客让）`;
            finalDirectionDetail = `客让深盘（-${goalCount}）低水控赔，客队战力碾压，首选客队穿盘大胜。`;
            confidenceReason = `客让深盘低水控赔，看好客队穿盘。`;
          } else {
            euroPick = '客胜独赢 (防1球小胜)';
            handicapPick = `下盘 ${homeTeam} (+${goalCount}受让)`;
            finalDirection = `【推荐方向】：双向对冲（竞彩客胜独赢 + 亚指下盘 ${homeTeam} +${goalCount}受让）`;
            if (goalCount === 1.0) {
              finalDirectionDetail = `【操盘精算对冲】：胜平负维度客队赢面大（首选客胜独赢）；但客让1球门槛偏高（需净胜2球赢全盘，净胜1球仅走盘退款）。实战防范客队 0-1 或 1-2 经济型小胜走盘，让球端首选主队受让 (+1.0)！`;
            } else if (goalCount === 1.25) {
              finalDirectionDetail = `【操盘精算对冲】：胜平负维度客队实力占优（首选客胜独赢）；但客让1.25球门槛高（需净胜2球赢全盘，净胜1球客让输半/主队赢半）。实战防范客队 0-1 小胜赢球输半，让球端首选主队受让 (+1.25)！`;
            } else {
              finalDirectionDetail = `【操盘精算对冲】：胜平负维度客队赢面大（首选客胜独赢）；但客让${goalCount}球门槛过深（净胜1球客让全输）。实战严防客队控场1球小胜赢球输盘，让球端首选主队受让 (+${goalCount})！`;
            }
            confidenceReason = `客让深盘存在小胜赢球输盘风险，采用客胜独赢+主队受让下盘对冲精算。`;
          }
        }
      }

      overUnderPick =
        lateOUNum >= 2.75
          ? `大球 (>=${data.overUnder.lateLine})`
          : `小球 (<=${data.overUnder.lateLine})`;

      riskWarning = `避坑风险提示：注意临场前45分钟是否有反常升水或退盘现象，严格遵循“晚盘看真实风控”原则。`;
      break;
    }
  }

  predictedScores = calculateConsistentPredictedScores(
    euroPick,
    handicapPick,
    overUnderPick,
    lateOUNum,
    lateHandicapNum
  );

  return {
    firstImpression,
    threeDimLieDetection,
    finalVerdict: {
      direction: finalDirection,
      directionDetail: finalDirectionDetail,
      riskWarning,
    },
    decision: {
      starRating,
      euroPick,
      handicapPick,
      overUnderPick,
      predictedScores:
        predictedScores && predictedScores.length > 0
          ? predictedScores
          : calculateConsistentPredictedScores(euroPick, handicapPick, overUnderPick, lateOUNum, lateHandicapNum),
      confidenceReason,
    },
    identifiedModel: primaryModel.model,
    modelTitle: primaryModel.title,
    source: 'ACTUARIAL_RULE_ENGINE',
    metrics,
  };
}
