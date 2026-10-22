import {
  FullMatchData,
  ActuarialMetrics,
  AnalysisReportResult,
  ManipulationModelType,
  ConfidenceComparisonResult,
  ConfidenceShiftType,
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

    // 1. All compound/split slash lines MUST be checked first before substrings
    // (e.g. '球半/两球' must precede '两球', '一球/球半' must precede '球半', '半球/一球' must precede '一球', '平手/半球' must precede '半球')
    if (cleaned.includes('三球半/四球') || cleaned.includes('3.5/4') || cleaned.includes('3.75')) base = 3.75;
    else if (cleaned.includes('三球/三球半') || cleaned.includes('3/3.5') || cleaned.includes('3.25')) base = 3.25;
    else if (cleaned.includes('两球半/三球') || cleaned.includes('2.5/3') || cleaned.includes('2.75')) base = 2.75;
    else if (cleaned.includes('两球/两球半') || cleaned.includes('2/2.5') || cleaned.includes('2.25')) base = 2.25;
    else if (cleaned.includes('球半/两球') || cleaned.includes('1.5/2') || cleaned.includes('1.75')) base = 1.75;
    else if (cleaned.includes('一球/球半') || cleaned.includes('1/1.5') || cleaned.includes('1.25')) base = 1.25;
    else if (cleaned.includes('半球/一球') || cleaned.includes('半一') || cleaned.includes('0.5/1') || cleaned.includes('0.75')) base = 0.75;
    else if (cleaned.includes('平手/半球') || cleaned.includes('平半') || cleaned.includes('0/0.5') || cleaned.includes('0.25')) base = 0.25;

    // 2. Pure single whole/half lines (now completely safe from substring collision)
    else if (cleaned.includes('三球半') || cleaned.includes('3.5')) base = 3.5;
    else if (cleaned.includes('三球') || cleaned.includes('3.0')) base = 3.0;
    else if (cleaned.includes('两球半') || cleaned.includes('2.5')) base = 2.5;
    else if (cleaned.includes('两球') || cleaned.includes('2.0')) base = 2.0;
    else if (cleaned.includes('球半') || cleaned.includes('1.5')) base = 1.5;
    else if (cleaned.includes('一球') || cleaned.includes('1.0')) base = 1.0;
    else if (cleaned.includes('半球') || cleaned.includes('0.5')) base = 0.5;
    else if (cleaned.includes('平手') || cleaned === '0' || cleaned === '-0' || cleaned === '+0') base = 0;
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
    return base;
  }
  if (cleaned.startsWith('-')) {
    return -base;
  }

  return -base;
}

export function parseOverUnderValue(line: string): number {
  if (!line) return 2.5;
  const cleaned = line.trim();

  // Composite and split over/under lines MUST be parsed before naive parseFloat!
  if (cleaned.includes('4/4.5') || cleaned.includes('4.25')) return 4.25;
  if (cleaned.includes('3.5/4') || cleaned.includes('3.75')) return 3.75;
  if (cleaned.includes('3/3.5') || cleaned.includes('3.25')) return 3.25;
  if (cleaned.includes('2.5/3') || cleaned.includes('2.75')) return 2.75;
  if (cleaned.includes('2/2.5') || cleaned.includes('2.25')) return 2.25;
  if (cleaned.includes('1.5/2') || cleaned.includes('1.75')) return 1.75;

  const num = parseFloat(cleaned);
  if (!isNaN(num)) return num;

  if (cleaned.includes('4.5')) return 4.5;
  if (cleaned.includes('4')) return 4.0;
  if (cleaned.includes('3.5')) return 3.5;
  if (cleaned.includes('3')) return 3.0;
  if (cleaned.includes('2.5')) return 2.5;
  if (cleaned.includes('2')) return 2.0;
  return 2.5;
}

export function computeActuarialMetrics(data: FullMatchData): ActuarialMetrics {
  // Callers reach this through the rule-engine fallback, which runs exactly when
  // the AI path failed and may hand over a partial match. Destructuring a
  // missing euroOdds threw and terminated the whole server process.
  const euroOdds = data?.euroOdds ?? {
    earlyWin: 2.5, earlyDraw: 3.2, earlyLoss: 2.6,
    lateWin: 2.5, lateDraw: 3.2, lateLoss: 2.6,
  };
  const { earlyWin, earlyDraw, earlyLoss, lateWin, lateDraw, lateLoss } = euroOdds;

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

  // 1. 【极限榨水 / 正向控赔 / 升盘阻上】
  // 原盘情况：欧赔持续下调或极低，维持原盘，上盘水位压制在 <= 1.85 极低水 -> 正向控赔稳胆
  // 升盘情况（升盘阻上）：盘口连跨升深（拔高赢盘门槛过滤跟风筹码），水位平稳承接在 <= 1.98 健康中水区间，
  // 且欧赔持续下调或极度低企（favoriteEuroLate <= 1.45 或 favoriteEuroTrend === 'DROP'）-> 升盘阻上穿盘稳胆
  const isPositiveUpLine =
    isFavoriteUpLine &&
    (favoriteEuroTrend === 'DROP' || favoriteEuroLate <= 1.45) &&
    favoriteOdds <= 1.98;

  const isPositiveSameLine =
    (favoriteEuroTrend === 'DROP' || favoriteEuroLate < 1.68) &&
    isFavoriteSameLine &&
    favoriteOdds <= 1.85;

  if (isPositiveSameLine || isPositiveUpLine) {
    const favTeamName = isHomeFavorite ? data.matchInfo.homeTeam : data.matchInfo.awayTeam;
    detectedModels.push({
      model: 'POSITIVE_CONTROL',
      title: isPositiveUpLine ? '【升盘阻上 / 正向控赔稳胆】' : '【极限榨水 / 正向控赔】',
      confidence: isPositiveUpLine ? 96 : 92,
      description: isPositiveUpLine
        ? `机构在早盘确认双方实力悬殊后，晚盘果断连跨升盘（提高赢盘门槛过滤跟风筹码），水位平稳重置在 ${favoriteOdds.toFixed(2)} 健康中水区间，欧指胜赔持续深砸至 ${favoriteEuroLate.toFixed(2)}。大庄宁愿主动拔高让步防线也不愿承受低盘口穿盘高额赔付，属于典型的“升盘阻上防大胜”顶级正路格局！`
        : `欧赔让球方（${favTeamName}）胜赔持续下调压制，亚指将上盘水位极限压缩至 ${favoriteOdds.toFixed(2)} 超低水区域，机构用赔付红利剥削实现真正的防范性控赔，正路可信度极高。`,
      riskLevel: 'LOW_RISK_SOLID',
    });
  }

  // 2. 【高息吸筹 / 杀猪盘诱导 / 欧赔暴涨出货】
  // 核心形态A：让步方欧赔遭遇毁灭性抛售暴涨（如初盘 1.72~1.75 狂飙至 2.00+，涨幅>=0.18），庄家弃守逃离，亚指挂满水或毒药盘诱上
  // 核心形态B：升盘诱上——必须同时满足【水位死卡 2.02+ 满水毒药】且【欧赔胜指不降反升或居高不下】，才算真诱盘；若欧赔大幅下调且水位仅为 1.88~1.96 健康中水，绝非诱盘！
  const favoriteEuroJump = favoriteEuroLate - (isHomeFavorite ? earlyWin : earlyLoss);
  const isEuroMassiveSurge = favoriteEuroJump >= 0.18 || (favoriteEuroLate >= 1.98 && (isHomeFavorite ? earlyWin : earlyLoss) <= 1.78);
  const isHighWaterTrap = favoriteOdds >= 2.02;
  const isRealUpLineTrap = isFavoriteUpLine && favoriteOdds >= 2.02 && (favoriteEuroTrend === 'RISE' || favoriteEuroJump >= 0.05 || favoriteEuroLate >= 1.65);

  if (
    isRealUpLineTrap ||
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

      // 梯次星级精算：
      // 5星稳胆必须满足极限真风控：
      // (1) 亚指水位被暴力砸至极限冰点超低水 givingOdds <= 1.74
      // (2) 或 欧赔持续下调至极致低赔 <= 1.45 (givingOdds <= 1.78)
      // (3) 或 临场让步方欧赔剧烈狂跌 >= 0.18
      // (4) 或 升盘阻上局：让步方连跨升盘，欧赔 <= 1.35 极致低赔或下调 >= 0.05，且亚指水位 <= 1.96 健康中水
      const earlyHandicapNum = parseHandicapValue(data.asianHandicap?.earlyHandicap || lateHandicap);
      const isFavoriteUpLine = isHomeGiving ? lateHandicapNum < earlyHandicapNum : lateHandicapNum > earlyHandicapNum;

      const favEuroDrop = isHomeGiving
        ? data.euroOdds.earlyWin - data.euroOdds.lateWin
        : data.euroOdds.earlyLoss - data.euroOdds.lateLoss;
      const isExtremePositive =
        givingOdds <= 1.74 ||
        (givingOdds <= 1.78 && givingEuroLate <= 1.45) ||
        (givingOdds <= 1.80 && favEuroDrop >= 0.18) ||
        (isFavoriteUpLine && (givingEuroLate <= 1.35 || favEuroDrop >= 0.05) && givingOdds <= 1.96);

      if (isExtremePositive) {
        starRating = 5;
        confidenceReason = isFavoriteUpLine
          ? `让步方（${givingTeam}）连跨升盘提高赢盘门槛过滤跟风筹码，欧指持续深砸至 ${givingEuroLate.toFixed(2)}，5星顶级升盘阻上穿盘稳胆。`
          : `机构真实避险下调 ${givingTeam} 胜赔，水位强砸至 ${givingOdds.toFixed(2)} 冰点超低水，5星顶级稳胆。`;
      } else {
        starRating = 4;
        confidenceReason = `机构维持让步方（${givingTeam}）低水控赔区间（${givingOdds.toFixed(2)}），正路避险打出意图明确，4星次稳优质胆。`;
      }

      // 深盘区间对冲保护：深让步 (>=1.25) 且进球数偏浅 (<=2.5) 谨防 1-0/2-0 经济型小胜赢球输半/输盘，采用独赢主胜+受让下盘对冲
      // 若大小球开到 >= 3.0 / 3.5（大球支撑穿盘），或发生升盘阻上，进球数充分支撑大胜穿盘，杜绝保守对冲！
      const isHighGoalEnvironment = lateOUNum >= 3.0 || metrics.overUnderVerdict.includes('大球');
      const needsDeepHedge = handicapGoals >= 1.25 && lateOUNum <= 2.5 && !isFavoriteUpLine && !isHighGoalEnvironment;

      if (isHomeGiving) {
        euroPick = isExtremePositive ? '主胜 (稳胆)' : '主胜';
        handicapPick = needsDeepHedge
          ? `下盘 ${awayTeam} (+${handicapGoals}受让对冲)`
          : `上盘 ${homeTeam} (${lateHandicap})`;
        finalDirection = needsDeepHedge
          ? `【推荐方向】：双向对冲（竞彩主胜独赢稳胆 + 亚指下盘 ${awayTeam} +${handicapGoals}防小胜）`
          : `【推荐方向】：主队（上盘 ${homeTeam} ${lateHandicap}）及主胜稳胆`;
        finalDirectionDetail = needsDeepHedge
          ? `【操盘精算对冲】：让步深（${lateHandicap}）且大小球仅（${lateOUNum}），严防主队控场 1-0 或 2-0 经济型赢球赢盘倒挂。竞彩独赢主胜稳胆，亚指首选下盘对冲保本！`
          : isFavoriteUpLine && isHighGoalEnvironment
          ? `【升盘阻上穿盘】：机构连跨升盘（${lateHandicap}）拔高赢盘门槛过滤跟风筹码，大小球深度加码至 ${lateOUNum}球大盘，欧亚四维同向发力封死小胜空间，首选主队上盘穿盘大胜！`
          : handicapGoals >= 1.0
          ? `竞彩/盘口：主胜独赢 / 亚指上盘；机构真实避险控赔，首选主胜赢球保走争穿。`
          : `竞彩/盘口：主胜独赢 / 亚指上盘；机构真实避险控赔，首选上盘正路赢盘打出。`;
      } else if (isAwayGiving) {
        euroPick = isExtremePositive ? '客胜 (稳胆)' : '客胜';
        handicapPick = needsDeepHedge
          ? `下盘 ${homeTeam} (+${handicapGoals}受让对冲)`
          : `上盘 ${awayTeam} (-${handicapGoals}客让)`;
        finalDirection = needsDeepHedge
          ? `【推荐方向】：双向对冲（竞彩客胜独赢稳胆 + 亚指下盘 ${homeTeam} +${handicapGoals}防小胜）`
          : `【推荐方向】：客队（上盘 ${awayTeam} 客让${handicapGoals}球）及客胜稳胆`;
        finalDirectionDetail = needsDeepHedge
          ? `【操盘精算对冲】：客让深（-${handicapGoals}）且进球数偏浅（${lateOUNum}），防范客队 0-1 经济型小胜。竞彩独赢客胜稳胆，亚指首选主队下盘对冲！`
          : isFavoriteUpLine && isHighGoalEnvironment
          ? `【升盘阻上穿盘】：机构连跨升盘（-${handicapGoals}客让）拔高赢盘门槛过滤筹码，大小球开至 ${lateOUNum}球大盘，首选客队上盘穿盘大胜！`
          : handicapGoals >= 1.0
          ? `竞彩/盘口：客胜独赢 / 亚指客让上盘；机构真实避险控赔，首选客队赢球保走争穿。`
          : `竞彩/盘口：客胜独赢 / 亚指客让上盘；机构真实避险控赔，首选客队正路赢盘打出。`;
      } else {
        euroPick = lateWin <= lateLoss ? '主胜 (稳胆)' : '客胜 (稳胆)';
        handicapPick = `平手盘 ${givingTeam} (0)`;
        finalDirection = `【推荐方向】：${givingTeam} 平手盘及独赢稳胆`;
        finalDirectionDetail = `竞彩/盘口：平手盘保平争胜；机构压低水位控赔。`;
      }

      // 大小球联动：优先遵循 metrics.overUnderVerdict 测谎结论
      if (
        metrics.overUnderVerdict.includes('首选小球') ||
        metrics.overUnderVerdict.includes('反向小球') ||
        metrics.overUnderVerdict.includes('反向防小') ||
        lateOUNum <= 2.25
      ) {
        overUnderPick = `小球 (<=${data.overUnder.lateLine})`;
      } else if (
        metrics.overUnderVerdict.includes('首选大球') ||
        metrics.overUnderVerdict.includes('直追大球') ||
        lateOUNum >= 3.0
      ) {
        overUnderPick = `大球 (>=${data.overUnder.lateLine})`;
      } else {
        overUnderPick = lateOUNum <= 2.5 ? `小球 (<=${data.overUnder.lateLine})` : `大球 (>=${data.overUnder.lateLine})`;
      }
      riskWarning = `避坑风险提示：此类超低水盘面切忌因“赔率过低、回报太少”而盲目博冷去下盘。大庄的底牌已毫无保留地向让步强队倾斜，顺应机构风控是唯一正解。`;
      break;
    }

    case 'HIGH_INTEREST_TRAP': {
      firstImpression = `【定性：高息诱上 / 杀猪盘出货陷阱】本场 ${homeTeam} 对阵 ${awayTeam} 是极其标准的“高息吸筹 / 欧赔暴涨出货”杀猪盘。机构充分利用 ${givingTeam} 的主场名气与抢分题材虚张声势，但在晚盘关键时刻致命死穴暴露无遗：让步方 ${givingTeam} 胜赔在主流欧指与官方遭遇剧烈抛售跳涨（晚盘飙升至 ${givingEuroLate.toFixed(2)}），亚指同时死死卡在 ${givingOdds.toFixed(2)} 毒药满水甚至强开方便之门！《财富经》核心铁律：天上不会掉无缘无故的馅饼，买得太舒服且回报率异常丰厚，必是机构请君入瓮掩护下盘反杀的诱导杀猪陷阱。`;
      threeDimLieDetection = `三维联动交叉验证：
1. 亚盘水位维度：亚指上盘长期悬挂 ${givingOdds.toFixed(2)} 毒药满水（客水被狠砸至低水），若庄家真怕上盘打出，绝不敢长期提供如此高额的暴利筹码供市场白捡。
2. 欧赔走势维度：让步方欧指并未出现深幅夯实，反而遭遇断崖式抛售暴涨，受让方（${receivingTeam}）胜平赔持续压低，欧亚折算呈现明显的“虚张声势掩护出货”，机构在用盘口障眼法为强队吸纳巨量筹码。
3. 大小球与北单去水联动维度：${metrics.overUnderVerdict}。若配合让负去水或受让赔率持续走低，下盘 ${receivingTeam} 爆冷不败甚至客胜独赢形态已彻底确立。`;

      // 梯次星级精算：
      // 梯次星级精算：
      // 杀猪盘属于【高赔逆向防冷】，客观打出率为博冷区间，绝不可滥发“5星稳胆”！
      // 极端高赔杀猪盘（欧指断崖跳涨且高水实锤）定为“4星重点防冷”；常规杀猪盘定为“3星博冷”。
      const earlyEuroFav = isHomeGiving ? data.euroOdds.earlyWin : data.euroOdds.earlyLoss;
      const favEuroJump = givingEuroLate - earlyEuroFav;
      const isExtremeTrap =
        (favEuroJump >= 0.16 && givingOdds >= 2.04) ||
        favEuroJump >= 0.25 ||
        givingOdds >= 2.10 ||
        (givingEuroLate >= 2.05 && earlyEuroFav <= 1.76);

      if (isExtremeTrap) {
        starRating = 4;
        confidenceReason = `让步方（${givingTeam}）欧赔断崖暴涨、亚指死卡满水出货，大热必死，反选4星重点防冷杀猪盘。`;
      } else {
        starRating = 3;
        confidenceReason = `让步方（${givingTeam}）高水利诱筹码，存在明显诱上出货痕迹，反选下盘3星博弈防冷。`;
      }

      if (isHomeGiving) {
        euroPick = '平 / 负 (客胜/平 双重保险)';
        handicapPick = `下盘 ${awayTeam} (+${handicapGoals}受让)`;
        finalDirection = `【推荐方向】：客队（下盘 ${awayTeam} +${handicapGoals}受让）坚决反选`;
        finalDirectionDetail = `竞彩/盘口：让球客胜（客队受让赢盘） / 重点防平局客胜爆大冷（0-1、1-2、1-1）；坚决不碰主队上盘毒药满水。`;
      } else if (isAwayGiving) {
        euroPick = '胜 / 平 (主胜/平 双重保险)';
        handicapPick = `下盘 ${homeTeam} (+${handicapGoals}受让)`;
        finalDirection = `【推荐方向】：主队（下盘 ${homeTeam} +${handicapGoals}受让）坚决反选`;
        finalDirectionDetail = `竞彩/盘口：让球主胜（主队受让赢盘） / 重点防主队爆冷不败（1-0、2-1、1-1）；坚决不碰客队上盘毒药满水。`;
      } else {
        euroPick = '平 / 负 (客队受让不败)';
        handicapPick = `下盘 ${receivingTeam} (+0)`;
        finalDirection = `【推荐方向】：${receivingTeam} 受让不败`;
        finalDirectionDetail = `高水诱盘，反选低水受让方。`;
      }

      if (metrics.overUnderVerdict.includes('首选小球') || metrics.overUnderVerdict.includes('反向小球')) {
        overUnderPick = `小球 (<=${data.overUnder.lateLine})`;
      } else if (metrics.overUnderVerdict.includes('首选大球') || metrics.overUnderVerdict.includes('直追大球') || lateOUNum >= 2.75) {
        overUnderPick = `大球 (>=${data.overUnder.lateLine})`;
      } else {
        overUnderPick = lateOUNum >= 2.75 ? `大球 (>=${data.overUnder.lateLine})` : `小球 (<=${data.overUnder.lateLine})`;
      }
      riskWarning = `避坑风险提示：千万警惕名气虚火与主队情怀！凡是“让步方高水出货、欧赔反常狂飙暴涨”的杀猪盘，99% 为机构收割局，坚决不碰上盘，拥抱下盘避风港。`;
      break;
    }

    case 'AVALANCHE_RETREAT': {
      firstImpression = `【定性：雪崩退盘 / 避险退热】盘面特征归属于“雪崩退盘 / 退热示弱”。初盘 ${data.asianHandicap.earlyHandicap} 在晚盘临场资金大举介入时剧烈下调防线至 ${lateHandicap}，让球方 ${givingTeam} 水位反弹至 ${givingOdds.toFixed(2)}。在现代足彩精算体系中，正规透明联赛无端退盘升水，往往是机构核心风控提前捕捉到了未公开的核心利空（如主力伤停、更衣室内讧或更深层的轮换）而做出的紧急避险。`;
      threeDimLieDetection = `三维联动交叉验证：
1. 亚盘水位维度：机构主动示弱退盘，放弃第一道阻击线，将赔付压力向受让方（${receivingTeam}）倾斜。
2. 欧赔走势维度：让步方欧指大幅抬高，平赔低压或受让方胜赔暴跌，欧赔异动彻底证伪了早盘对让步方的信心。
3. 大小球联动维度：${metrics.overUnderVerdict}。进球数防线伴随胜负盘同步收缩，反映出让球方在进攻端存在难以弥补的硬伤。`;

      // 梯次星级精算：深度雪崩属于防冷保护，定为4星重点防冷；常规退盘定为3星常规博冷
      const earlyHandicapVal = parseHandicapValue(data.asianHandicap.earlyHandicap);
      const favEuroJump = isHomeGiving
        ? data.euroOdds.lateWin - data.euroOdds.earlyWin
        : data.euroOdds.lateLoss - data.euroOdds.earlyLoss;
      const isDeepAvalanche = Math.abs(lateHandicapNum - earlyHandicapVal) >= 0.5 || favEuroJump >= 0.25;

      if (isDeepAvalanche) {
        starRating = 4;
        confidenceReason = `临场让球方防线深度崩溃退盘，机构彻底弃守，反选下盘4星重点防冷。`;
      } else {
        starRating = 3;
        confidenceReason = `临场让球方退盘升水，核心利空坐实，跟退盘3星常规博冷。`;
      }

      if (isHomeGiving) {
        euroPick = '平 / 负 (客队受让不败)';
        handicapPick = `下盘 ${awayTeam} (+${handicapGoals}受让)`;
        finalDirection = `【推荐方向】：客队（下盘 ${awayTeam} +${handicapGoals}受让）`;
        finalDirectionDetail = `竞彩/盘口：让球平负 / 客队不败；主力利空坐实，跟退盘走向下盘。`;
      } else {
        euroPick = '胜 / 平 (主队受让不败)';
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

      // 梯次星级精算：平局属于高赔博弈，单挑平局绝不可打为5星稳胆！
      // 平赔 <= 2.88 定为4星双选防冷；2.89~3.10 为3星博弈平局
      if (lateDraw <= 2.88 && Math.abs(lateHandicapNum) <= 0.25) {
        starRating = 4;
        confidenceReason = `主流欧指平赔死压至 ${lateDraw.toFixed(2)} 极度防御区，两端分流打掩护，4星双选防冷胆平。`;
      } else {
        starRating = 3;
        confidenceReason = `平赔压制在 ${lateDraw.toFixed(2)} 低位防御带，两端胶着严防平局，3星博弈平局。`;
      }

      if (isHomeGiving) {
        euroPick = '主胜 / 平 (防冷首选平，主队保平争胜)';
      } else if (isAwayGiving) {
        euroPick = '平 / 客胜 (防冷首选平，客队保平争胜)';
      } else {
        euroPick = '平局 / 让球双选 (首选胆平 1-1/0-0)';
      }
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

      // 梯次星级精算：浅盘满水为博冷策略，高危盘定为4星重点防冷，常规为3星博冷
      if (givingOdds >= 2.08 && givingEuroLate >= 2.05) {
        starRating = 4;
        confidenceReason = `强队（${givingTeam}）浅盘死卡 ${givingOdds.toFixed(2)} 毒药超高水，欧指毫无支撑，4星必杀冷门下盘。`;
      } else {
        starRating = 3;
        confidenceReason = `强队（${givingTeam}）浅盘挂 ${givingOdds.toFixed(2)} 满水，阻力不足买得舒服必有诈，3星重点防冷走下盘。`;
      }

      if (isHomeGiving) {
        euroPick = '让球负 (客胜/平 杀绝上盘)';
        handicapPick = `下盘 ${awayTeam} (+${handicapGoals || 0.25})`;
        finalDirection = `【推荐方向】：坚决走下盘（${awayTeam} 不败）`;
        finalDirectionDetail = `竞彩/盘口：让球负（客队受让胜） / 博客队爆冷独赢；比分参考 0-1、1-2、1-1`;
      } else {
        euroPick = '让球胜 (主胜/平 杀绝上盘)';
        handicapPick = `下盘 ${homeTeam} (+${handicapGoals || 0.25})`;
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
        starRating = 3;
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
        confidenceReason = '平手均势盘型，结合欧指倾向首选低赔保平争胜，3星常规博弈。';
      } else if (lateHandicapNum < 0) {
        // 主队让球 (Home gives handicap)
        const goalCount = Math.abs(lateHandicapNum);

        if (goalCount <= 0.75) {
          // 浅盘区间 (0.25, 0.5, 0.75)
          if (lateWin <= lateLoss && lateHomeOdds <= 1.95) {
            starRating = lateWin <= 1.85 && lateHomeOdds <= 1.90 ? 4 : 3;
            euroPick = '主胜 / 平';
            handicapPick = `上盘 ${homeTeam} (-${goalCount}让球)`;
            finalDirection = `【推荐方向】：主队（上盘 ${homeTeam} -${goalCount}）及主胜保平争胜`;
            finalDirectionDetail = `浅让区间（-${goalCount}），主队胜面占优且让步门槛合理，首选主队上盘顺势打出。`;
            confidenceReason = starRating === 4
              ? `主让浅盘（-${goalCount}）欧亚顺向支撑，双选主胜保平争胜胜率稳固，4星稳健档。`
              : `主让浅盘（-${goalCount}），欧亚顺路支持主队，首选上盘。`;
          } else {
            starRating = 3;
            euroPick = '平 / 负 (客队受让不败)';
            handicapPick = `下盘 ${awayTeam} (+${goalCount}受让)`;
            finalDirection = `【推荐方向】：客队（下盘 ${awayTeam} +${goalCount}受让）`;
            finalDirectionDetail = `主让浅盘（-${goalCount}）水位阻力偏高或欧赔离散，防范冷平或客胜爆冷，首选客队下盘受让不败。`;
            confidenceReason = `主让浅盘水位承压，受让方 (+${goalCount}) 具备安全垫，3星博弈防冷。`;
          }
        } else {
          // 深盘区间 (>= 1.0): 存在净胜1球但输盘/走盘的可能，支持合理对冲精算
          const earlyHVal = parseHandicapValue(data.asianHandicap?.earlyHandicap || lateHandicap);
          const isHomeUpLine = lateHandicapNum < earlyHVal;
          const isHighGoalDeep = lateOUNum >= 3.0 || metrics.overUnderVerdict.includes('大球');
          const isStrongEuroBlowout = lateWin <= 1.35 && lateHomeOdds <= 1.98;

          if (lateHomeOdds <= 1.85 || isStrongEuroBlowout || (isHomeUpLine && lateHomeOdds <= 1.98) || (isHighGoalDeep && lateWin <= 1.45 && lateHomeOdds <= 1.96)) {
            starRating = lateWin <= 1.35 ? 5 : 4;
            euroPick = '主胜 (稳选)';
            handicapPick = `上盘 ${homeTeam} (-${goalCount}让球)`;
            finalDirection = `【推荐方向】：主队（上盘 ${homeTeam} -${goalCount}让球）`;
            finalDirectionDetail = (isHomeUpLine || isStrongEuroBlowout)
              ? `主让深盘（-${goalCount}）机构通过升盘提高门槛阻上，欧指持续低压砸盘，首选上盘穿盘大胜。`
              : `主让深盘（-${goalCount}）配以低水控赔，主队实力占优，首选上盘穿盘大胜。`;
            confidenceReason = starRating === 5
              ? `豪门深让（欧指${lateWin.toFixed(2)}）穿盘实力突出，正路高胜率穿盘稳胆，5星顶级稳胆。`
              : `深盘低水/欧指深度支撑机构有效控水，看好主队穿盘，4星优质胆。`;
          } else {
            // 深让步对冲模式（主胜独赢 + 亚指下盘受让防 1 球小胜）
            if (lateWin <= 1.30) {
              starRating = 5;
              confidenceReason = `豪门极深让步（欧指${lateWin.toFixed(2)}），独赢胜率极高，结合亚指受让防1球小胜双重保险，5星顶级对冲稳胆。`;
            } else if (lateWin <= 1.48) {
              starRating = 4;
              confidenceReason = `深盘让步主队实力稳健，独赢主胜结合受让下盘防小胜对冲，4星核心对冲稳胆。`;
            } else {
              starRating = 3;
              confidenceReason = `深让步存在小胜赢球输盘风险，采用主胜独赢+受让下盘对冲精算，3星博弈对冲。`;
            }

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
          }
        }
      } else {
        // 客队让球 (Away gives handicap)
        const goalCount = Math.abs(lateHandicapNum);

        if (goalCount <= 0.75) {
          // 客让浅盘区间 (0.25, 0.5, 0.75)
          if (lateLoss <= lateWin && lateAwayOdds <= 1.95) {
            starRating = lateLoss <= 1.85 && lateAwayOdds <= 1.90 ? 4 : 3;
            euroPick = '客胜 / 平 (客队不败)';
            handicapPick = `上盘 ${awayTeam} (-${goalCount}客让)`;
            finalDirection = `【推荐方向】：客队（上盘 ${awayTeam} -${goalCount}客让）`;
            finalDirectionDetail = `客让浅盘（-${goalCount}）门槛合理，客队战力占优，首选客队上盘打出。`;
            confidenceReason = starRating === 4
              ? `客让浅盘欧亚同向支撑，双选客胜保平争胜胜率稳固，4星稳健档。`
              : `客让浅盘欧亚顺向支持客队，首选客让上盘。`;
          } else {
            starRating = 3;
            euroPick = '胜 / 平 (主队不败)';
            handicapPick = `下盘 ${homeTeam} (+${goalCount}受让)`;
            finalDirection = `【推荐方向】：主队（下盘 ${homeTeam} +${goalCount}受让）`;
            finalDirectionDetail = `客队浅让阻力不足且水位承压，主场优势凸显，首选主队受让不败。`;
            confidenceReason = `客让浅盘水位不稳，主队受让具备不败安全垫，3星博弈防冷。`;
          }
        } else {
          // 客让深盘区间 (>= 1.0)
          const earlyHVal = parseHandicapValue(data.asianHandicap?.earlyHandicap || lateHandicap);
          const isAwayUpLine = lateHandicapNum > earlyHVal;
          const isHighGoalDeep = lateOUNum >= 3.0 || metrics.overUnderVerdict.includes('大球');
          const isStrongEuroBlowout = lateLoss <= 1.35 && lateAwayOdds <= 1.98;

          if (lateAwayOdds <= 1.85 || isStrongEuroBlowout || (isAwayUpLine && lateAwayOdds <= 1.98) || (isHighGoalDeep && lateLoss <= 1.45 && lateAwayOdds <= 1.96)) {
            starRating = lateLoss <= 1.35 ? 5 : 4;
            euroPick = '客胜 (稳选)';
            handicapPick = `上盘 ${awayTeam} (-${goalCount}客让)`;
            finalDirection = `【推荐方向】：客队（上盘 ${awayTeam} -${goalCount}客让）`;
            finalDirectionDetail = (isAwayUpLine || isStrongEuroBlowout)
              ? `客让深盘（-${goalCount}）机构通过升盘提高门槛阻上，欧指持续低压砸盘，首选客让上盘穿盘大胜。`
              : `客让深盘（-${goalCount}）低水控赔，客队战力碾压，首选客队穿盘大胜。`;
            confidenceReason = starRating === 5
              ? `客让深盘欧指极低（${lateLoss.toFixed(2)}），正路穿盘稳胆，5星顶级稳胆。`
              : `客让深盘低水/欧指深度支撑机构有效控水，看好客队穿盘，4星优质胆。`;
          } else {
            // 客让深盘对冲
            if (lateLoss <= 1.30) {
              starRating = 5;
              confidenceReason = `客让极深让步（欧指${lateLoss.toFixed(2)}），客胜独赢稳胆结合主队受让防小胜对冲，5星顶级对冲稳胆。`;
            } else if (lateLoss <= 1.48) {
              starRating = 4;
              confidenceReason = `客让深盘客队实力明显占优，客胜独赢结合主队受让防小胜对冲，4星核心对冲稳胆。`;
            } else {
              starRating = 3;
              confidenceReason = `客让深盘存在小胜赢球输盘风险，采用客胜独赢+主队受让下盘对冲精算，3星博弈对冲。`;
            }

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

/**
 * Compares Early Market baseline vs Late Market odds to evaluate confidence trajectory:
 * - INCREASED: 晚盘增加信心 (e.g. 升星、机构暴压水位控赔、欧指大幅下调、正向控赔成立)
 * - DECREASED: 晚盘减少信心 (e.g. 降星、高息诱上陷阱、退盘示弱、平赔下压分流冷平)
 * - STABLE: 晚盘盘面平稳 (早晚盘步调一致，微幅常规调仓)
 */
export function compareEarlyVsLateConfidence(
  data: FullMatchData,
  explicitEarlyReport?: AnalysisReportResult,
  explicitLateReport?: AnalysisReportResult,
  explicitEarlyData?: FullMatchData
): ConfidenceComparisonResult {
  // Late report
  const lateReport = explicitLateReport || generateActuarialRuleReport(data);

  // Synthesize or use early data
  const earlyAH = explicitEarlyData?.asianHandicap || data.asianHandicap;
  const earlyEO = explicitEarlyData?.euroOdds || data.euroOdds;
  const earlyOU = explicitEarlyData?.overUnder || data.overUnder;

  const earlyHandicap = earlyAH.earlyHandicap || earlyAH.lateHandicap || '平手';
  const earlyHomeOdds = earlyAH.earlyHomeOdds > 0 ? earlyAH.earlyHomeOdds : (earlyAH.lateHomeOdds || 1.90);
  const earlyAwayOdds = earlyAH.earlyAwayOdds > 0 ? earlyAH.earlyAwayOdds : (earlyAH.lateAwayOdds || 1.90);
  const earlyWin = earlyEO.earlyWin > 0 ? earlyEO.earlyWin : (earlyEO.lateWin || 2.50);
  const earlyDraw = earlyEO.earlyDraw > 0 ? earlyEO.earlyDraw : (earlyEO.lateDraw || 3.20);
  const earlyLoss = earlyEO.earlyLoss > 0 ? earlyEO.earlyLoss : (earlyEO.lateLoss || 2.60);
  const earlyLine = earlyOU.earlyLine || earlyOU.lateLine || '2.5';
  const earlyOverOdds = earlyOU.earlyOverOdds > 0 ? earlyOU.earlyOverOdds : (earlyOU.lateOverOdds || 1.90);
  const earlyUnderOdds = earlyOU.earlyUnderOdds > 0 ? earlyOU.earlyUnderOdds : (earlyOU.lateUnderOdds || 1.90);

  let earlyReport = explicitEarlyReport;
  if (!earlyReport) {
    const syntheticEarlyMatch: FullMatchData = {
      ...data,
      asianHandicap: {
        ...data.asianHandicap,
        earlyHandicap,
        earlyHomeOdds,
        earlyAwayOdds,
        lateHandicap: earlyHandicap,
        lateHomeOdds: earlyHomeOdds,
        lateAwayOdds: earlyAwayOdds,
      },
      euroOdds: {
        ...data.euroOdds,
        earlyWin,
        earlyDraw,
        earlyLoss,
        lateWin: earlyWin,
        lateDraw: earlyDraw,
        lateLoss: earlyLoss,
      },
      overUnder: {
        ...data.overUnder,
        earlyLine,
        earlyOverOdds,
        earlyUnderOdds,
        lateLine: earlyLine,
        lateOverOdds: earlyOverOdds,
        lateUnderOdds: earlyUnderOdds,
      },
    };
    earlyReport = generateActuarialRuleReport(syntheticEarlyMatch);
  }

  const earlyStars = earlyReport.decision?.starRating || 3;
  const lateStars = lateReport.decision?.starRating || 3;
  const starChange = lateStars - earlyStars;


  const earlyHandicapNum = parseHandicapValue(earlyHandicap);
  const lateHandicapNum = parseHandicapValue(data.asianHandicap?.lateHandicap || '平手');
  const isHomeGiving = lateHandicapNum < 0;
  const isAwayGiving = lateHandicapNum > 0;
  const givingTeam = isHomeGiving
    ? data.matchInfo.homeTeam
    : isAwayGiving
    ? data.matchInfo.awayTeam
    : (data.euroOdds.lateWin <= data.euroOdds.lateLoss ? data.matchInfo.homeTeam : data.matchInfo.awayTeam);

  const homeWaterDiff = Number(((data.asianHandicap?.lateHomeOdds || 1.90) - earlyHomeOdds).toFixed(2));
  const awayWaterDiff = Number(((data.asianHandicap?.lateAwayOdds || 1.90) - earlyAwayOdds).toFixed(2));
  const winDiff = Number(((data.euroOdds?.lateWin || 2.50) - earlyWin).toFixed(2));
  const drawDiff = Number(((data.euroOdds?.lateDraw || 3.20) - earlyDraw).toFixed(2));
  const lossDiff = Number(((data.euroOdds?.lateLoss || 2.60) - earlyLoss).toFixed(2));

  const rawGivingWaterDiff = isHomeGiving
    ? homeWaterDiff
    : isAwayGiving
    ? awayWaterDiff
    : (data.euroOdds.lateWin <= data.euroOdds.lateLoss ? homeWaterDiff : awayWaterDiff);
  const givingEuroDiff = isHomeGiving
    ? winDiff
    : isAwayGiving
    ? lossDiff
    : (data.euroOdds.lateWin <= data.euroOdds.lateLoss ? winDiff : lossDiff);

  const lateGivingOdds = isHomeGiving
    ? (data.asianHandicap?.lateHomeOdds || 1.90)
    : isAwayGiving
    ? (data.asianHandicap?.lateAwayOdds || 1.90)
    : (data.euroOdds.lateWin <= data.euroOdds.lateLoss ? (data.asianHandicap?.lateHomeOdds || 1.90) : (data.asianHandicap?.lateAwayOdds || 1.90));
  const earlyGivingOdds = isHomeGiving
    ? earlyHomeOdds
    : isAwayGiving
    ? earlyAwayOdds
    : (earlyWin <= earlyLoss ? earlyHomeOdds : earlyAwayOdds);

  const lateGivingEuro = isHomeGiving
    ? (data.euroOdds?.lateWin || 2.50)
    : isAwayGiving
    ? (data.euroOdds?.lateLoss || 2.60)
    : (data.euroOdds.lateWin <= data.euroOdds.lateLoss ? data.euroOdds.lateWin : data.euroOdds.lateLoss);
  const earlyGivingEuro = isHomeGiving
    ? earlyWin
    : isAwayGiving
    ? earlyLoss
    : (earlyWin <= earlyLoss ? earlyWin : earlyLoss);

  // 跨盘口水位补偿精算 (Cross-Handicap Water Compensation)
  const earlyGivingGoals = isHomeGiving ? Math.abs(earlyHandicapNum) : (isAwayGiving ? Math.abs(earlyHandicapNum) : 0);
  const lateGivingGoals = isHomeGiving ? Math.abs(lateHandicapNum) : (isAwayGiving ? Math.abs(lateHandicapNum) : 0);
  const lineStepDiff = Number(((lateGivingGoals - earlyGivingGoals) / 0.25).toFixed(1));

  // 正向升盘 (lineStepDiff > 0) 时，每加深1个子盘(0.25球)，允许合理换水 +0.15~0.20 (基准按 0.18 精算)
  const waterCompensation = lineStepDiff > 0 ? Number((lineStepDiff * 0.18).toFixed(2)) : 0;
  // 经跨盘口补偿折算后的“有效让步方水位差”
  const effectiveGivingWaterDiff = Number((rawGivingWaterDiff - waterCompensation).toFixed(2));

  // Implied probabilities difference
  const probDiff = {
    win: Number(((lateReport.metrics?.lateHomeProb || 0) - (earlyReport.metrics?.lateHomeProb || 0)).toFixed(1)),
    draw: Number(((lateReport.metrics?.lateDrawProb || 0) - (earlyReport.metrics?.lateDrawProb || 0)).toFixed(1)),
    loss: Number(((lateReport.metrics?.lateAwayProb || 0) - (earlyReport.metrics?.lateAwayProb || 0)).toFixed(1)),
  };

  // Determine shiftType with strict hierarchical consistency:
  // Level 1: If stars jumped (starChange > 0), confidence is fundamentally INCREASED.
  // Level 2: If stars dropped (starChange < 0), confidence is DECREASED (unless confirmed as positive up-line fortification).
  // Level 3: If stars unchanged (starChange === 0), evaluate micro odds/water/model transitions.
  let shiftType: ConfidenceShiftType = 'STABLE';
  const keyReasons: string[] = [];

  const isConfirmedUpLineFortification = lineStepDiff > 0 && lateGivingOdds <= 1.98 && givingEuroDiff <= 0.02;
  const isUpLineTrap = lineStepDiff > 0 && lateGivingOdds >= 2.04 && givingEuroDiff >= 0.05;

  if (starChange > 0) {
    shiftType = 'INCREASED';
    keyReasons.push(`推荐星级跳升：由早盘 ${earlyStars}星 ⭐ 跃升至晚盘 ${lateStars}星 ⭐ (+${starChange}★)，置信度与风控等级大幅强化。`);
    if (isConfirmedUpLineFortification) {
      keyReasons.push(`升盘门槛加固：盘口由早盘 ${earlyHandicap} 连升 ${lineStepDiff} 档至晚盘 ${data.asianHandicap.lateHandicap}，门槛大幅拔高阻上，水位稳健承接在 ${lateGivingOdds.toFixed(2)} 健康中水区间，排除虚热。`);
    } else if (givingEuroDiff <= -0.05) {
      keyReasons.push(`欧赔胜指持续下调：${givingTeam} 胜赔由早盘 ${earlyGivingEuro.toFixed(2)} 压低至晚盘 ${lateGivingEuro.toFixed(2)} (${givingEuroDiff.toFixed(2)})，欧亚同向避险。`);
    }
  } else if (starChange < 0) {
    shiftType = 'DECREASED';
    keyReasons.push(`推荐星级下调：由早盘 ${earlyStars}星 ⭐ 下调至晚盘 ${lateStars}星 ⭐ (${starChange}★)，盘面出现诱导或风控松动，建议谨慎设防。`);
    if (isUpLineTrap) {
      keyReasons.push(`升盘高息诱上：${givingTeam} 虽升盘至 ${data.asianHandicap.lateHandicap}，但水位死卡 ${lateGivingOdds.toFixed(2)} 毒药高水且欧赔反弹 +${givingEuroDiff.toFixed(2)}，警惕借题材虚晃升盘诱上。`);
    } else if (rawGivingWaterDiff >= 0.08 || lateGivingOdds >= 2.04) {
      keyReasons.push(`让步方异常升水：${givingTeam} 亚盘水位由早盘 ${earlyGivingOdds.toFixed(2)} 飙升至晚盘 ${lateGivingOdds.toFixed(2)} (+${rawGivingWaterDiff.toFixed(2)})，高息满水暗藏“大热必死”诱上风险。`);
    }
    if (givingEuroDiff >= 0.08) {
      keyReasons.push(`欧赔胜指反常抬高：${givingTeam} 胜赔由早盘 ${earlyGivingEuro.toFixed(2)} 抬高至晚盘 ${lateGivingEuro.toFixed(2)} (+${givingEuroDiff.toFixed(2)})，机构对正路打出存在顾虑。`);
    }
  } else {
    // starChange === 0: evaluate micro odds / water / model changes
    if (isConfirmedUpLineFortification) {
      shiftType = 'INCREASED';
      keyReasons.push(`升盘阻上控赔：${givingTeam} 亚指连跨 ${lineStepDiff} 档深升至 ${data.asianHandicap.lateHandicap}，换水补偿折算后有效水位实际下压 ${Math.abs(effectiveGivingWaterDiff).toFixed(2)}，机构提高赢盘门槛过滤跟风筹码，正路穿盘阻力夯实。`);
      if (givingEuroDiff < 0) {
        keyReasons.push(`欧赔胜指同步下调：${givingTeam} 胜赔由早盘 ${earlyGivingEuro.toFixed(2)} 压低至晚盘 ${lateGivingEuro.toFixed(2)} (${givingEuroDiff.toFixed(2)})，欧亚同向避险。`);
      }
    } else if (isUpLineTrap) {
      shiftType = 'DECREASED';
      keyReasons.push(`升盘高息诱上：${givingTeam} 虽升盘至 ${data.asianHandicap.lateHandicap}，但水位死卡 ${lateGivingOdds.toFixed(2)} 毒药高水且欧赔反弹 +${givingEuroDiff.toFixed(2)}，警惕借题材虚晃升盘诱上。`);
    } else if (effectiveGivingWaterDiff <= -0.05 || givingEuroDiff <= -0.05) {
      shiftType = 'INCREASED';
      if (effectiveGivingWaterDiff <= -0.05) {
        keyReasons.push(`让步方极限压水：${givingTeam} 亚盘水位由早盘 ${earlyGivingOdds.toFixed(2)} 降至晚盘 ${lateGivingOdds.toFixed(2)} (${rawGivingWaterDiff > 0 ? '+' : ''}${rawGivingWaterDiff.toFixed(2)})，机构强行压降赔付空间。`);
      }
      if (givingEuroDiff <= -0.05) {
        keyReasons.push(`欧赔胜指持续下调：${givingTeam} 胜赔由早盘 ${earlyGivingEuro.toFixed(2)} 压低至晚盘 ${lateGivingEuro.toFixed(2)} (${givingEuroDiff.toFixed(2)})，欧亚同向避险。`);
      }
    } else if (rawGivingWaterDiff >= 0.08 || (rawGivingWaterDiff >= 0.04 && lateGivingOdds >= 2.04) || givingEuroDiff >= 0.08) {
      shiftType = 'DECREASED';
      if (rawGivingWaterDiff >= 0.04) {
        keyReasons.push(`让步方异常升水：${givingTeam} 亚盘水位由早盘 ${earlyGivingOdds.toFixed(2)} 攀升至晚盘 ${lateGivingOdds.toFixed(2)} (+${rawGivingWaterDiff.toFixed(2)})，高息满水暗藏“大热必死”诱上风险。`);
      }
      if (givingEuroDiff >= 0.08) {
        keyReasons.push(`欧赔胜指反常抬高：${givingTeam} 胜赔由早盘 ${earlyGivingEuro.toFixed(2)} 抬高至晚盘 ${lateGivingEuro.toFixed(2)} (+${givingEuroDiff.toFixed(2)})，机构对正路打出存在顾虑。`);
      }
    } else if (earlyReport.identifiedModel !== lateReport.identifiedModel) {
      const lateM = lateReport.identifiedModel;
      if (lateM === 'POSITIVE_CONTROL') {
        shiftType = 'INCREASED';
        keyReasons.push(`操盘模型确立：晚盘正式确立为【极限榨水 / 正向控赔】操盘模型，大庄坚决以低赔超低水避险打出。`);
      } else if (lateM === 'HIGH_INTEREST_TRAP') {
        shiftType = 'DECREASED';
        keyReasons.push(`警惕操盘陷阱：晚盘变轨触发【高息吸筹 / 名气诱导】模型，机构以高回报诱导大众投注让步方。`);
      } else if (lateM === 'AVALANCHE_RETREAT') {
        shiftType = 'DECREASED';
        keyReasons.push(`盘口退热示弱：晚盘变轨触发【雪崩退盘 / 退热示弱】模型，让步力度不足，首选防冷下盘。`);
      } else if (lateM === 'LOW_DRAW_DEFENSE') {
        shiftType = 'INCREASED';
        keyReasons.push(`平局防线加固：晚盘平赔压低触发【平赔低洼 / 胆平设防】模型，胜负两端分流，首选重点设防平局。`);
      }
    }
  }

  // Absolute flat guard: if handicap line, water and euro odds are essentially identical and stars unchanged,
  // ensure shiftType is STABLE without false alarm
  const isEssentiallyFlat =
    lineStepDiff === 0 &&
    Math.abs(rawGivingWaterDiff) < 0.03 &&
    Math.abs(givingEuroDiff) < 0.03 &&
    starChange === 0 &&
    earlyReport.identifiedModel === lateReport.identifiedModel;

  if (isEssentiallyFlat) {
    shiftType = 'STABLE';
  }

  // Over/Under synergy
  const lateOUNum = parseOverUnderValue(data.overUnder?.lateLine || '2.5');
  const earlyOUNum = parseOverUnderValue(data.overUnder?.earlyLine || '2.5');
  const ouDiff = Number((lateOUNum - earlyOUNum).toFixed(2));
  if (ouDiff > 0 && lateOUNum >= 3.25 && shiftType !== 'DECREASED') {
    keyReasons.push(`大小球跨档大开：大小球由 ${data.overUnder?.earlyLine} 升至 ${data.overUnder?.lateLine} (${lateOUNum}球深盘)，机构预期进球数爆发，与让步方深盘大胜形成四维联动。`);
  }

  // If still no key reasons, add stability note
  if (keyReasons.length === 0) {
    keyReasons.push(`早盘初盘与晚盘临场盘口水位高度吻合，欧亚变轨无剧烈偏离，盘面逻辑自洽稳定。`);
  }

  // Summary title
  let summaryTitle = '';
  if (shiftType === 'INCREASED') {
    summaryTitle = lineStepDiff > 0
      ? `晚盘信心大幅强化 (${starChange > 0 ? `+${starChange}星` : '维持' + lateStars + '星'} · 升盘阻上穿盘稳胆)`
      : starChange > 0
      ? `晚盘信心大幅增加 (+${starChange}星 · 机构控赔加固)`
      : `晚盘信心增强 (水位持续压低 · 避险打出)`;
  } else if (shiftType === 'DECREASED') {
    summaryTitle = starChange < 0
      ? `晚盘信心显著衰减 (${starChange}星 · 谨防诱盘陷阱)`
      : `晚盘信心减弱 (水位高企诱上 · 风险攀升)`;
  } else {
    summaryTitle = `晚盘盘面平稳 (早晚盘步调自洽 · 维持研判)`;
  }

  // Detailed dissection with dynamic euro text
  const euroDissectionText =
    givingEuroDiff < 0
      ? `欧赔让步方同步下调 -${Math.abs(givingEuroDiff).toFixed(2)}`
      : givingEuroDiff === 0
      ? `欧赔坚挺维持 ${lateGivingEuro.toFixed(2)}`
      : `欧赔让步方不降反升 (+${givingEuroDiff.toFixed(2)})`;

  const detailedExplanation =
    shiftType === 'INCREASED'
      ? lineStepDiff > 0
        ? `【《财富经》临场升盘阻上穿盘解析】：本场比赛在早盘确认双方初始基石盘口后，临场晚盘大庄坚决采取“升盘阻上 + 官方砸盘防大胜”的主动风控策略。盘口由早盘 ${earlyHandicap} 连跨 ${lineStepDiff} 档强升至 ${data.asianHandicap.lateHandicap}，通过拔高赢盘门槛（净胜2球输一半甚至全输）有效过滤跟风筹码。水位重置在 ${lateGivingOdds.toFixed(2)} 健康中水区间（经换水补偿折算后实际压缩赔付空间），配套${euroDissectionText}，去水隐含胜率攀升至 ${lateReport.metrics.lateHomeProb.toFixed(1)}%。机构“宁可主动拔高门槛也不承担深盘穿盘高额赔付”的底牌彻底暴露，晚盘较早盘信心显著强化，推荐方向作为实战五星顶级核心稳胆！`
        : `【《财富经》临场信心增加解析】：本场比赛在早盘确认双方初始实力盘后，临场晚盘资金真实注入阶段，机构并未通过升盘升水制造虚幻热度，而是欧亚联动持续向下封锁赔付空间。让步方水位由 ${earlyGivingOdds.toFixed(2)} 降至 ${lateGivingOdds.toFixed(2)}，${euroDissectionText}，去水隐含胜率提升至 ${lateReport.metrics.lateHomeProb.toFixed(1)}%。机构“宁可不赚钱也不承担高赔付风险”的底牌彻底暴露，临场信心较早盘显著提升，推荐方向可重点作为实战核心胆码。`
      : shiftType === 'DECREASED'
      ? `【《财富经》临场信心衰减避坑提示】：对比早盘初盘，晚盘临场出现明显背离。让步方在名气热度加持下，机构非但没有压低水位封锁赔付，反而在亚指端维持 ${lateGivingOdds.toFixed(2)} 高水甚至异常升水（水位差 +${rawGivingWaterDiff.toFixed(2)}），${euroDissectionText}。这完全违背了“降低赔付”的真实避险逻辑，属于典型的高息吸筹或让步乏力。早盘建立的信心在晚盘被彻底证伪，必须降低投资等级或果断反选下盘/设防平局！`
      : `【《财富经》临场盘面平稳自洽解析】：早盘初设基石盘口与晚盘临场变轨保持高度一致，欧赔三项与亚盘水位均在 ±0.03 的常规调仓容差范围内，未出现诱盘或急剧退热异动。早盘研判的五项核心决策依然成立，可按既定方案执行。`;

  return {
    shiftType,
    starChange,
    earlyStars,
    lateStars,
    earlyEuroPick: earlyReport.decision?.euroPick || '主胜',
    lateEuroPick: lateReport.decision?.euroPick || '主胜',
    earlyHandicapPick: earlyReport.decision?.handicapPick || '上盘',
    lateHandicapPick: lateReport.decision?.handicapPick || '上盘',
    earlyOverUnderPick: earlyReport.decision?.overUnderPick,
    lateOverUnderPick: lateReport.decision?.overUnderPick,
    earlyModel: earlyReport.identifiedModel,
    lateModel: lateReport.identifiedModel,
    earlyModelTitle: earlyReport.modelTitle,
    lateModelTitle: lateReport.modelTitle,
    summaryTitle,
    keyReasons,
    detailedExplanation,
    waterDiff: {
      home: homeWaterDiff,
      away: awayWaterDiff,
      giving: effectiveGivingWaterDiff,
    },
    euroDiff: {
      win: winDiff,
      draw: drawDiff,
      loss: lossDiff,
      giving: givingEuroDiff,
    },
    probDiff,
    earlyOddsSummary: {
      handicap: earlyHandicap,
      homeOdds: earlyHomeOdds,
      awayOdds: earlyAwayOdds,
      win: earlyWin,
      draw: earlyDraw,
      loss: earlyLoss,
      overUnderLine: earlyLine,
    },
    lateOddsSummary: {
      handicap: data.asianHandicap?.lateHandicap || '平手',
      homeOdds: data.asianHandicap?.lateHomeOdds || 1.90,
      awayOdds: data.asianHandicap?.lateAwayOdds || 1.90,
      win: data.euroOdds?.lateWin || 2.50,
      draw: data.euroOdds?.lateDraw || 3.20,
      loss: data.euroOdds?.lateLoss || 2.60,
      overUnderLine: data.overUnder?.lateLine || '2.5',
    },
  };
}
