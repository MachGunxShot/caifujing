import React, { useState } from 'react';
import {
  BookOpen,
  ShieldAlert,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Flame,
  CheckCircle2,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import { PRESET_CASES, PresetCase } from '../utils/presetCases';

interface ModelKnowledgeBaseProps {
  onLoadPreset: (preset: PresetCase) => void;
}

export const ModelKnowledgeBase: React.FC<ModelKnowledgeBaseProps> = ({ onLoadPreset }) => {
  const [activeModel, setActiveModel] = useState<number>(0);

  const models = [
    {
      title: '【极限榨水 / 正向控赔】',
      subTitle: '真风控控赔 · 正路做稳胆',
      badge: '稳胆模型',
      badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      formula: '欧赔持续下调 + 亚指维持原盘或升盘 + 上盘水位砸至 <1.80 极低水',
      mindset:
        '大庄在临场资金大举介入后，不惜降低彩民的盈利吸引力，强行将赔付水位砸入冰点。机构宁可少赚抽水，也绝不敢冒高额赔付风险，这是货真价实的防范打出。',
      traps: '彩民常因“赔率只有1.75回报太低”而心理抗拒，转去博冷，结果惨遭绝杀。',
      rule: '天上不会掉馅饼，超低水才是机构最诚实的投降书。正路可做稳胆。',
      presetId: 'case-positive-control',
    },
    {
      title: '【高息吸筹 / 名气诱导】',
      subTitle: '大热必死 · 公开诱上坚决去下盘',
      badge: '高危杀猪盘',
      badgeColor: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
      formula: '强队名气/战意题材拉满 + 强升盘 + 上盘水位死卡 2.00~2.08 超高水/满水',
      mindset:
        '借豪门光环制造“让步坚挺、大胜穿盘”的幻觉，盘面大开方便之门，同时挂出满水高额诱饵。如果庄家真怕上盘打出，绝不敢长期悬挂满水让市场白捡暴利。',
      traps: '被球队历史战绩与豪门光环蒙蔽，沉迷“赢球即赢盘甚至赢半个球”的虚假安全感。',
      rule: '升盘挂满水，十有九次鬼。买得太舒服、回报率过高的盘面，坚决反选受让下盘。',
      presetId: 'case-high-interest-trap',
    },
    {
      title: '【雪崩退盘 / 退热示弱】',
      subTitle: '利空坐实跟退盘 · 豪门暴力洗盘需辨析',
      badge: '避险退防',
      badgeColor: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
      formula: '临场剧烈退盘 (如一球退半一/半一退半球) + 水位抬升至中高水',
      mindset:
        '正规透明联赛无端退盘升水，往往是机构核心风控提前捕捉到了未公开的核心利空（主力突发伤停、更衣室内讧、战意放弃）而紧急止损避险。',
      traps: '自作聪明以为“豪门退盘是机构在故意吓退资金，正好便宜抄底”，最终一脚踩空。',
      rule: '透明联赛大庄掌握绝对信息差，跟退盘者生，盲抄底者亡。常规联赛坚决跟退盘走客队。',
      presetId: 'case-avalanche-retreat',
    },
    {
      title: '【平赔低洼 / 平赔排雷】',
      subTitle: '欧平死压 <3.00 · 严防平局真实避险',
      badge: '首选胆平',
      badgeColor: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
      formula: '欧平平赔死压至 <3.00 (竞彩 <2.75) + 亚盘平手/平半浅盘两头对冲',
      mindset:
        '机构在胜负两端制造水位波动充当障眼法，资金在主胜与客胜间来回分流，而大庄的核心防御红线全部筑在平赔之上。平局一旦打出，机构通吃两头盘口。',
      traps: '总在主胜或客胜之间赌单边，忽略了平赔已经击穿机构防线的客观事实。',
      rule: '平赔破3.00为最高级风控预警，两头下注极易被绝杀，首选平局与双选平。',
      presetId: 'case-low-draw-defense',
    },
    {
      title: '【浅盘满水死亡】',
      subTitle: '主场优势归零 · 强队让步无力必丢分',
      badge: '冷门死穴',
      badgeColor: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      formula: '强队主场对中下游仅开平手/平半 + 长期挂 2.00+ 满水',
      mindset:
        '主队坐拥主场天利与人气，却开出几乎不设防的平半满水，买主队“赢球即收全且有高回报”。机构完全不担心主胜穿透，实则早已判了强队死刑。',
      traps: '“强队在主场总能赢一个吧”，盲目迷信主场保底胜率。',
      rule: '浅盘满水死亡线，送钱盘面是断头台。毫不犹豫反选下盘客队不败。',
      presetId: 'case-shallow-full-water',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Core Principles Header */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-950 border border-slate-800 rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="w-5 h-5 text-emerald-400" />
          <h2 className="text-base font-bold text-white tracking-tight">
            《财富经》核心研判哲学与底线逻辑
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80 space-y-1">
            <div className="text-emerald-400 font-bold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>1. 早盘看意图，晚盘看风控</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              早盘挂牌是机构试探市场情绪与吸纳基石资金；临场1-2小时资金汹涌注入后的盘水变轨，才是机构为了不赔钱而做出的最终避险调仓。
            </p>
          </div>

          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80 space-y-1">
            <div className="text-cyan-400 font-bold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              <span>2. 永远学会“证伪”而非自我证明</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              绝不要拿着看好某队的偏见去找支持它的零碎理由。必须用晚盘的剧烈变水与反向变盘去主动“证伪”早盘的逻辑。
            </p>
          </div>

          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80 space-y-1">
            <div className="text-rose-400 font-bold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
              <span>3. 天上不会掉无缘无故的馅饼</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              买得太舒服、门槛太低、回报率过高的盘面，99% 为机构精心布设的利诱陷阱。机构不是慈善家，绝不平白送肉。
            </p>
          </div>
        </div>
      </div>

      {/* Five Classic Models Navigation */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">五大经典操盘模型全景速查</h3>
          </div>
          <span className="text-[11px] text-slate-400">点击切换模型深入剖析</span>
        </div>

        {/* Model Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 mb-4">
          {models.map((m, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setActiveModel(idx)}
              className={`p-2 rounded-lg text-left transition-all border ${
                activeModel === idx
                  ? 'bg-slate-800 border-emerald-500/50 shadow text-white'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <div className="text-[10px] font-mono text-emerald-400 font-semibold mb-0.5">
                模型 0{idx + 1}
              </div>
              <div className="text-xs font-bold truncate">{m.title.replace(/[【】]/g, '')}</div>
            </button>
          ))}
        </div>

        {/* Active Model Deep Dive */}
        {models[activeModel] && (
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-850 pb-2">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-base font-black text-white">{models[activeModel].title}</h4>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${models[activeModel].badgeColor}`}>
                    {models[activeModel].badge}
                  </span>
                </div>
                <p className="text-xs text-emerald-400 mt-0.5 font-medium">
                  {models[activeModel].subTitle}
                </p>
              </div>

              {/* Load preset button */}
              <button
                type="button"
                onClick={() => {
                  const found = PRESET_CASES.find((c) => c.id === models[activeModel].presetId);
                  if (found) onLoadPreset(found);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-bold rounded-lg shadow cursor-pointer transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>载入该模型实战案例推演</span>
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-400 font-semibold">【判决公式与形态】：</span>
                <span className="text-slate-200 font-mono font-medium">{models[activeModel].formula}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800 space-y-1">
                  <div className="text-cyan-400 font-bold">机构操盘底牌剖析</div>
                  <p className="text-slate-300 leading-relaxed">{models[activeModel].mindset}</p>
                </div>
                <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800 space-y-1">
                  <div className="text-rose-400 font-bold">散户盲区与致死陷阱</div>
                  <p className="text-slate-300 leading-relaxed">{models[activeModel].traps}</p>
                </div>
                <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800 space-y-1">
                  <div className="text-amber-400 font-bold">《财富经》避坑断语</div>
                  <p className="text-slate-300 leading-relaxed font-semibold">{models[activeModel].rule}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Over/Under Cross-Examination Matrix */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3 border-b border-slate-800 pb-2">
          <Flame className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-bold text-white">三维联动：大小球联动测谎口诀表</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1.5">
            <div className="text-emerald-400 font-bold">
              深让步 (-1.25+) + 浅大小球 (2.25)
            </div>
            <p className="text-slate-400 leading-relaxed">
              强队让球极深，但大小球死卡浅线。机构深知强队破门乏力或对手打法极度坚韧，强烈指向 <strong className="text-white">1-0、2-0</strong> 经济型小胜。
            </p>
            <div className="text-[11px] font-mono text-emerald-400 font-semibold">
              ➔ 最终判定：去小球，防让平
            </div>
          </div>

          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1.5">
            <div className="text-cyan-400 font-bold">
              浅让步 (平手/平半) + 深大小球 (2.75+)
            </div>
            <p className="text-slate-400 leading-relaxed">
              胜负盘势均力敌无让步阻力，但大小球暴力拉深。揭示两队防线形同虚设，战术大开大合，机构真实底牌引导对攻刷大。
            </p>
            <div className="text-[11px] font-mono text-cyan-400 font-semibold">
              ➔ 最终判定：直接追大球，双飞破门
            </div>
          </div>

          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1.5">
            <div className="text-rose-400 font-bold">
              大球题材 + 死卡 2.5 仅降水不升盘
            </div>
            <p className="text-slate-400 leading-relaxed">
              市场充斥进球大战的狂热题材，但庄家死卡 2.5 盘口不越雷池，仅做微降水诱上。假大球双向收割陷阱。
            </p>
            <div className="text-[11px] font-mono text-rose-400 font-semibold">
              ➔ 最终判定：反选小球，严防冷门下盘
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
