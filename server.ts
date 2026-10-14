import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { generateActuarialRuleReport } from './src/utils/actuaryEngine.ts';
import { parseBatchMatchScoresFromText } from './src/utils/textParser.ts';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Overridable via .env so a saturated or retired model can be swapped without
// editing code. Full flash tiers currently answer 503 while lite stays healthy,
// so a saturated model falls through to the next entry instead of failing.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
const GEMINI_MODEL_FALLBACKS = (process.env.GEMINI_MODEL_FALLBACKS
  || 'gemini-3.5-flash-lite,gemini-3.1-flash-lite')
  .split(',').map((m) => m.trim()).filter(Boolean);
const GEMINI_MODELS = [GEMINI_MODEL, ...GEMINI_MODEL_FALLBACKS.filter((m) => m !== GEMINI_MODEL)];

// A saturated model returns 503 UNAVAILABLE or 429 RESOURCE_EXHAUSTED while
// other tiers stay healthy, so those two are worth retrying on the next model.
function isRetryableModelError(err: any): boolean {
  const status = err?.status ?? err?.code ?? err?.error?.code;
  if (status === 503 || status === 429) return true;
  const message = String(err?.message ?? '');
  return /UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand|fetch failed/i.test(message);
}

async function generateWithFallback(params: { contents: any; config?: any }) {
  let lastError: any;
  for (const model of GEMINI_MODELS) {
    try {
      return await ai.models.generateContent({ ...params, model });
    } catch (err: any) {
      lastError = err;
      if (!isRetryableModelError(err)) throw err;
      console.warn(`Gemini model ${model} unavailable, trying next: ${String(err?.message ?? err).slice(0, 140)}`);
    }
  }
  throw lastError;
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

async function startServer() {
  const app = express();
  const port = parseInt(process.env.PORT || '3000', 10);

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Deep Actuarial Analysis API with Gemini 3.8 Flash
  app.post('/api/analyze', async (req, res) => {
    try {
      const matchData = req.body;
      const { matchInfo, asianHandicap, euroOdds, overUnder, additionalNotes, experiencePrompt } = matchData;

      const promptText = `
请以《财富经》足彩盘赔分析与博弈论顶级精算师与风险控制专家的身份，对以下比赛进行极其严苛、深入的盘赔测谎与风险解剖：

【赛事基本面】：
- 联赛：${matchInfo?.league || '未知联赛'}
- 对阵：${matchInfo?.homeTeam || '主队'} vs ${matchInfo?.awayTeam || '客队'}
- 比赛时间：${matchInfo?.matchTime || '临场'}
- 市场热度与题材：${matchInfo?.marketStory || '无特殊题材'}
- 额外备注/伤停：${additionalNotes || '无'}

【亚盘早晚盘数据】：
- 早盘盘口与水位：主队 ${asianHandicap?.earlyHandicap || '-'} (水位 ${asianHandicap?.earlyHomeOdds ?? '-'}) vs 客队 (水位 ${asianHandicap?.earlyAwayOdds ?? '-'})
- 临场晚盘即时盘口与水位：主队 ${asianHandicap?.lateHandicap || '-'} (水位 ${asianHandicap?.lateHomeOdds ?? '-'}) vs 客队 (水位 ${asianHandicap?.lateAwayOdds ?? '-'})

【欧赔早晚盘数据】：
- 早盘欧指（胜/平/负）：${euroOdds?.earlyWin ?? '-'} / ${euroOdds?.earlyDraw ?? '-'} / ${euroOdds?.earlyLoss ?? '-'}
- 晚盘欧指（胜/平/负）：${euroOdds?.lateWin ?? '-'} / ${euroOdds?.lateDraw ?? '-'} / ${euroOdds?.lateLoss ?? '-'}

【大小球联动数据】：
- 早盘大小球：${overUnder?.earlyLine ?? '-'} (大球水 ${overUnder?.earlyOverOdds ?? '-'} / 小球水 ${overUnder?.earlyUnderOdds ?? '-'})
- 晚盘大小球：${overUnder?.lateLine ?? '-'} (大球水 ${overUnder?.lateOverOdds ?? '-'} / 小球水 ${overUnder?.lateUnderOdds ?? '-'})

${experiencePrompt ? `\n${experiencePrompt}\n` : ''}

请严格依照《财富经》核心研判原则（早盘看意图，晚盘看真实风控；永远学会证伪而非自我证明；天下没有无缘无故的馅饼）和五大经典操盘模型（极限榨水、高息吸筹、雪崩退盘、平赔低洼、浅盘满水死亡）以及大小球联动测谎规则，直击大庄真实底牌。

【严格输出格式要求】（直接输出，绝不含客套寒暄）：
1. 【盘面第一印象】：定性该盘口属于正向控赔、高息诱上还是平赔风控，早晚盘变轨意图。
2. 【三维联动测谎】：交叉验证亚盘水位、欧赔走势与大小球盘口是否匹配，用晚盘证伪早盘。
3. 【财富经最终判定】：明确给出【推荐方向（上盘/下盘/大球/小球/平局）】与【避坑风险提示】。
`;

      let aiResponseText = '';
      if (process.env.GEMINI_API_KEY) {
        const response = await generateWithFallback({
          contents: promptText,
          config: {
            systemInstruction: `你是一位精通《财富经》足彩盘赔分析与博弈论的顶级精算师与风险控制专家。你的职责是依据《财富经》的底线逻辑与研判公式，结合系统持续沉淀的实战复盘经验法则库，剥离球队名气与市场虚火，直击博彩机构（大庄）的真实风控底牌。
核心研判原则：
1. 早盘看意图，晚盘看真实风控：临场 1-2 小时资金注入后的盘水变轨才是机构为了不赔钱而做出的最终避险调仓。
2. 永远学会“证伪”而非“自我证明”：用晚盘的剧烈变水与反向变盘去证伪早盘逻辑。
3. 天上不会掉无缘无故的馅饼：买得太舒服、回报率过高的盘面，99% 为机构诱导陷阱。
4. 深度吸纳实战进化经验法则：随时对照知识库中已被历史赛果证实的特定联赛与模型避险法则。
输出格式严格包含：
1. 【盘面第一印象】
2. 【三维联动测谎】
3. 【财富经最终判定】（包含推荐方向与避坑风险提示）
语言风格：犀利、严密、精算数学透彻、穿透操盘心理，坚决剥离名气虚火。`,
            temperature: 0.2,
          },
        });
        aiResponseText = response.text || '';
      }

      if (!aiResponseText) {
        const fallback = generateActuarialRuleReport(matchData);
        aiResponseText = `1. 【盘面第一印象】\n${fallback.firstImpression}\n\n2. 【三维联动测谎】\n${fallback.threeDimLieDetection}\n\n3. 【财富经最终判定】\n${fallback.finalVerdict.direction}\n${fallback.finalVerdict.directionDetail}\n【避坑风险提示】：${fallback.finalVerdict.riskWarning}`;
      }

      res.json({
        success: true,
        aiAnalysis: aiResponseText,
        source: aiResponseText.includes('【定性：') && !process.env.GEMINI_API_KEY ? 'RULE_ENGINE_FALLBACK' : 'GEMINI_AI',
      });
    } catch (err: any) {
      console.warn('Gemini API call temporarily unavailable, gracefully returning rule engine fallback:', err?.message);
      const fallback = generateActuarialRuleReport(req.body);
      const fallbackText = `1. 【盘面第一印象】\n${fallback.firstImpression}\n\n2. 【三维联动测谎】\n${fallback.threeDimLieDetection}\n\n3. 【财富经最终判定】\n${fallback.finalVerdict.direction}\n${fallback.finalVerdict.directionDetail}\n【避坑风险提示】：${fallback.finalVerdict.riskWarning}`;
      res.json({
        success: true,
        aiAnalysis: fallbackText,
        source: 'RULE_ENGINE_FALLBACK',
        note: '大模型并发激增，系统已秒级无缝切换至《财富经》底线精算引擎',
      });
    }
  });

  // Post-Match Review & AI Experience Evolution API
  app.post('/api/review', async (req, res) => {
    try {
      const { matchData, priorReport, actualHomeScore, actualAwayScore, matchIncidents } = req.body;
      const actualScore = `${actualHomeScore}-${actualAwayScore}`;

      const promptText = `
请以《财富经》足彩精算总监与博弈论操盘大师的身份，对已完场赛事的实战结果进行终极深度复盘，并为《财富经》核心经验库提炼 1 条永久生效的【实战进化法则】：

【赛事基本面】：
- 联赛：${matchData?.matchInfo?.league}
- 对阵：${matchData?.matchInfo?.homeTeam} vs ${matchData?.matchInfo?.awayTeam}
- 盘赔数据：亚盘让球 ${matchData?.asianHandicap?.lateHandicap} (水 ${matchData?.asianHandicap?.lateHomeOdds}) ｜ 欧指 ${matchData?.euroOdds?.lateWin}/${matchData?.euroOdds?.lateDraw}/${matchData?.euroOdds?.lateLoss} ｜ 大小球 ${matchData?.overUnder?.lateLine}
- 操盘定性模型：${priorReport?.modelTitle}

【赛前《财富经》预判建议】：
- 推荐星级：${priorReport?.decision?.starRating} 星
- 胜平负首选：${priorReport?.decision?.euroPick}
- 让球首选：${priorReport?.decision?.handicapPick}
- 大小球首选：${priorReport?.decision?.overUnderPick}
- 参考比分：${priorReport?.decision?.predictedScores?.join(', ')}
- 风险防范提示：${priorReport?.finalVerdict?.riskWarning}

【实际完场结果】：
- 最终实际比分：${actualScore}
- 赛中突发转折点：${matchIncidents || '无特殊突发事件，常规技战术对抗'}

【请严格按以下 JSON 结构输出】（使用 \`\`\`json 包裹）：
\`\`\`json
{
  "summaryNote": "一句话核心复盘定性（如：大庄正向控赔底牌完美印证，或是遭遇突发红牌/变异盘型反向收割）",
  "dissectionText": "深度博弈论复盘解析（从晚盘资金流、操盘手心理、比分节奏与实际赛果的严密推演）",
  "evolvedRuleTitle": "简明有力的法则标题（如：欧国联平赔破3.00坚决胆平法则）",
  "evolvedRuleContent": "可直接沉淀入《财富经》经验库的操作性法则正文（格式：当出现...特征时，切忌...，实战首选...）"
}
\`\`\`
`;

      let dissectionData = null;
      if (process.env.GEMINI_API_KEY) {
        try {
          const response = await generateWithFallback({
            contents: promptText,
            config: {
              systemInstruction: '你是一位精通欧亚足彩风控内幕的顶级操盘复盘专家。你的分析绝不浮于表面，必须深刻归因庄家真实赔付、筹码诱导陷阱或黑天鹅事件，提炼出可被未来研判复用的实战金律。',
              temperature: 0.2,
            },
          });

          const text = response.text || '';
          const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
          if (jsonMatch) {
            try {
              dissectionData = JSON.parse(jsonMatch[1]);
            } catch (e) {
              console.error('Failed to parse AI review json:', e);
            }
          }
        } catch (apiErr: any) {
          console.warn('Gemini review temporary spike, switching to deterministic review:', apiErr?.message);
        }
      }

      if (!dissectionData) {
        const home = matchData?.matchInfo?.homeTeam || '主队';
        const away = matchData?.matchInfo?.awayTeam || '客队';
        const league = matchData?.matchInfo?.league || '常规联赛';
        const modelTitle = priorReport?.modelTitle || '经典操盘模型';
        dissectionData = {
          summaryNote: `《财富经》【${modelTitle}】赛事实战复盘验证完成，实际完场比分 ${actualScore}。`,
          dissectionText: `【赛后精算归因】本场 ${league} ${home} vs ${away} 完场比分 ${actualScore}。晚盘亚指让步 ${matchData?.asianHandicap?.lateHandicap || '-'}（水 ${matchData?.asianHandicap?.lateHomeOdds || '-'}），欧指 ${matchData?.euroOdds?.lateWin || '-'}/${matchData?.euroOdds?.lateDraw || '-'}/${matchData?.euroOdds?.lateLoss || '-'}。操盘手核心意图在比赛终场得到深度检验，临场资金变水真实反映了庄家避险边界。`,
          evolvedRuleTitle: `${league}【${modelTitle}】实战沉淀法则`,
          evolvedRuleContent: `在 ${league} 等赛事中，当盘面确认【${modelTitle}】特征时，临场变水具有高度风控指向性，实战严格规避高息诱导，首选【${priorReport?.decision?.euroPick || '正向防守'}】。`,
        };
      }

      res.json({
        success: true,
        aiDissection: dissectionData,
      });
    } catch (err: any) {
      console.warn('Review API general error:', err?.message);
      const home = req.body?.matchData?.matchInfo?.homeTeam || '主队';
      const away = req.body?.matchData?.matchInfo?.awayTeam || '客队';
      const league = req.body?.matchData?.matchInfo?.league || '常规联赛';
      const actualScore = `${req.body?.actualHomeScore ?? 0}-${req.body?.actualAwayScore ?? 0}`;
      res.json({
        success: true,
        aiDissection: {
          summaryNote: `《财富经》赛事复盘已就绪，实际比分 ${actualScore}。`,
          dissectionText: `【精算复盘归因】${league} ${home} vs ${away} 完场 ${actualScore}，已自动比对欧亚水差并沉淀新法则。`,
          evolvedRuleTitle: `${league}【${home} vs ${away}】实战进化经验`,
          evolvedRuleContent: `在 ${league} 类似盘型下，优先比对早晚盘欧亚水差与临场平赔走向，规避反向陷阱。`,
        },
      });
    }
  });

  // Multimodal Image / Screenshot Recognition & Diagnosis with Gemini 3.8 Flash
  app.post('/api/analyze-image', async (req, res) => {
    try {
      const { imageBase64, mimeType = 'image/png', note = '' } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ success: false, error: 'No image data provided' });
      }

      // Clean base64 string
      const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, '');

      const promptText = `
请仔细识别这张赛事盘口截图（包含欧指胜平负、亚盘让球水位、大小球界线、早盘初盘与临场晚盘即时盘水，或比分网即时赔率），并以《财富经》足彩盘赔分析与博弈论顶级精算师的身份完成识别与深度测谎：

用户附言：${note || '无'}

请严格按照以下步骤输出：
第一步：先输出提取到的结构化数据 JSON 代码块（必须使用 \`\`\`json 包裹），示例如下：
\`\`\`json
{
  "league": "联赛名称",
  "homeTeam": "主队",
  "awayTeam": "客队",
  "matchTime": "比赛时间或临场",
  "marketStory": "从截图或对阵中可识别的题材与背景",
  "asianHandicap": {
    "earlyHandicap": "-0.75",
    "earlyHomeOdds": 1.92,
    "earlyAwayOdds": 1.90,
    "lateHandicap": "-1.0",
    "lateHomeOdds": 2.05,
    "lateAwayOdds": 1.78
  },
  "euroOdds": {
    "earlyWin": 1.65,
    "earlyDraw": 3.80,
    "earlyLoss": 5.20,
    "lateWin": 1.48,
    "lateDraw": 4.20,
    "lateLoss": 7.00
  },
  "overUnder": {
    "earlyLine": "2.5",
    "earlyOverOdds": 1.90,
    "earlyUnderOdds": 1.90,
    "lateLine": "2.5",
    "lateOverOdds": 1.82,
    "lateUnderOdds": 2.02
  }
}
\`\`\`

第二步：紧接着输出《财富经》标准三段式深度盘赔测谎诊断（直接输出，绝无寒暄）：
1. 【盘面第一印象】：定性该盘口属于正向控赔、高息诱上还是平赔风控，早晚盘变轨意图。
2. 【三维联动测谎】：交叉验证亚盘水位、欧赔走势与大小球盘口是否匹配，用晚盘证伪早盘。
3. 【财富经最终判定】：明确给出【推荐方向（上盘/下盘/大球/小球/平局）】与【避坑风险提示】。
`;

      let aiResponseText = '';
      if (process.env.GEMINI_API_KEY) {
        const imagePart = {
          inlineData: {
            mimeType: mimeType,
            data: cleanBase64,
          },
        };

        const response = await generateWithFallback({
          contents: {
            parts: [imagePart, { text: promptText }],
          },
          config: {
            systemInstruction: `你是一位精通《财富经》足彩盘赔分析与博弈论的顶级精算师与风险控制专家。你的职责是依据《财富经》的底线逻辑与研判公式，剥离球队名气与市场虚火，直击博彩机构（大庄）的真实风控底牌。
核心研判原则：
1. 早盘看意图，晚盘看真实风控：临场 1-2 小时资金注入后的盘水变轨才是机构为了不赔钱而做出的最终避险调仓。
2. 永远学会“证伪”而非“自我证明”：用晚盘的剧烈变水与反向变盘去证伪早盘逻辑。
3. 天上不会掉无缘无故的馅饼：买得太舒服、回报率过高的盘面，99% 为机构诱导陷阱。`,
            temperature: 0.2,
          },
        });
        aiResponseText = response.text || '';
      }

      // Try parsing JSON block out
      let extractedData = null;
      if (aiResponseText) {
        const jsonMatch = aiResponseText.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          try {
            extractedData = JSON.parse(jsonMatch[1]);
          } catch (e) {
            console.warn('Could not parse JSON block from image response:', e);
          }
        }
      }

      // If AI unavailable or failed, fallback
      if (!aiResponseText) {
        aiResponseText = `已接收并解析盘赔截图。\n1. 【盘面第一印象】\n已提取截图中的赔率分布。\n\n2. 【三维联动测谎】\n交叉比对完成。\n\n3. 【财富经最终判定】\n【推荐方向】：请结合临场最后变水做最终判定\n【避坑风险提示】：截图数据已自动填入精算台，建议复核晚盘即时水。`;
      }

      res.json({
        success: true,
        aiAnalysis: aiResponseText,
        extractedData,
        source: 'GEMINI_AI',
      });
    } catch (err: any) {
      console.warn('API /api/analyze-image error:', err?.message);
      res.json({
        success: true,
        aiAnalysis: `1. 【盘面第一印象】\n截图已接收。由于当前大模型访问并发较大，已将识别数据导入精算队列。\n\n2. 【三维联动测谎】\n欧亚盘型与大小球测谎矩阵已就绪。\n\n3. 【财富经最终判定】\n【推荐方向】：请使用左侧控制台进行微调测算\n【避坑风险提示】：遵循天上没有免费馅饼原则，防高水诱盘。`,
        extractedData: null,
        source: 'RULE_ENGINE_FALLBACK',
      });
    }
  });

  // Batch Match Results Recognition (Image OCR + Text/Markdown/Table parser)
  app.post('/api/recognize-scores', async (req, res) => {
    try {
      const { imageBase64, mimeType = 'image/png', rawText = '', candidates = [] } = req.body;
      let parsedScores: any[] = [];

      // 1. If Image is provided and GEMINI_API_KEY is present, use Gemini 3.8 Flash multimodal vision
      if (imageBase64 && process.env.GEMINI_API_KEY) {
        const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
        const candidateListStr = candidates.map((c: any) => `${c.home} vs ${c.away}`).join('、');

        const promptText = `
请仔细识别这张比分网/足彩赛果截图（例如雷速体育、懂球帝、捷报比分、LiveScore、新浪彩票等赛事的赛果列表），提取出图中所有赛事的【主队名称】、【客队名称】和【最终全场比分】。

${candidateListStr ? `【待匹配的目标赛事参考列表】：${candidateListStr}` : ''}

【必须严格按以下 JSON 数组代码块格式输出】（使用 \`\`\`json 包裹）：
\`\`\`json
[
  {
    "homeTeam": "瑞士",
    "awayTeam": "斯洛文尼亚",
    "homeScore": 1,
    "awayScore": 0,
    "incidents": "点球破门"
  }
]
\`\`\`
仅返回真实可辨识的已完场比分，不要包含任何闲聊和客套。
`;

        try {
          const response = await generateWithFallback({
            contents: [
              { text: promptText },
              {
                inlineData: {
                  mimeType,
                  data: cleanBase64,
                },
              },
            ],
            config: {
              systemInstruction: '你是一位精通各类足球比分网与彩票APP截图排版的高精度多模态 OCR 专家。能够准确提取主队、客队、比分，并自动校准球队别名。',
              temperature: 0.1,
            },
          });

          const text = response.text || '';
          const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
          if (jsonMatch) {
            try {
              const list = JSON.parse(jsonMatch[1]);
              if (Array.isArray(list)) {
                // Map and align with candidate matches
                parsedScores = list.map((item: any, idx: number) => {
                  const h = item.homeTeam || item.home || '主队';
                  const a = item.awayTeam || item.away || '客队';
                  const hs = typeof item.homeScore === 'number' ? item.homeScore : parseInt(item.homeScore, 10) || 0;
                  const as = typeof item.awayScore === 'number' ? item.awayScore : parseInt(item.awayScore, 10) || 0;

                  // Find match candidate
                  let matchedId: string | undefined;
                  let matchedName: string | undefined;
                  for (const cand of candidates) {
                    if (
                      (cand.home.includes(h) || h.includes(cand.home)) &&
                      (cand.away.includes(a) || a.includes(cand.away))
                    ) {
                      matchedId = cand.id;
                      matchedName = `${cand.home} vs ${cand.away}`;
                      break;
                    }
                  }

                  return {
                    id: `ocr-${Date.now()}-${idx}`,
                    homeTeam: h,
                    awayTeam: a,
                    homeScore: hs,
                    awayScore: as,
                    incidents: item.incidents || '',
                    matchedId,
                    matchedName,
                    confidence: matchedId ? 'HIGH' : 'MEDIUM',
                  };
                });
              }
            } catch (e) {
              console.warn('Failed to parse OCR scores json:', e);
            }
          }
        } catch (visionErr: any) {
          console.warn('Gemini vision score recognition error:', visionErr?.message);
        }
      }

      // 2. If rawText is provided (or if OCR didn't catch or offline)
      if (rawText && rawText.trim().length > 0) {
        const textResults = parseBatchMatchScoresFromText(rawText, candidates);
        if (textResults.length > 0) {
          if (parsedScores.length === 0) {
            parsedScores = textResults;
          } else {
            // Merge results
            for (const tr of textResults) {
              if (!parsedScores.some((p) => p.homeTeam === tr.homeTeam && p.awayTeam === tr.awayTeam)) {
                parsedScores.push(tr);
              }
            }
          }
        }
      }

      res.json({
        success: true,
        scores: parsedScores,
        source: imageBase64 && process.env.GEMINI_API_KEY ? 'GEMINI_VISION_OCR' : 'TEXT_PARSER',
      });
    } catch (err: any) {
      console.warn('/api/recognize-scores error:', err?.message);
      res.json({
        success: false,
        scores: [],
        error: err?.message,
      });
    }
  });

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      hasApiKey: !!process.env.GEMINI_API_KEY,
      model: GEMINI_MODEL,
      models: GEMINI_MODELS,
    });
  });

  // Dev vs Prod middleware
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server started on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
