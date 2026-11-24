import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  FileImage,
  FileSpreadsheet,
  FileText,
  X,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Info,
  ShieldCheck,
  Clipboard,
  Layers,
} from 'lucide-react';
import { parseImageMatch } from '../utils/importValidation';
import { FullMatchData } from '../types/fortuneActuary';
import { parseBatchMatchesFromText, SAMPLE_BATCH_CSV, SAMPLE_BATCH_MARKDOWN } from '../utils/textParser';

interface AttachmentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImageAnalyzed: (extractedData: FullMatchData, aiAnalysis: string, geminiModel?: string) => void;
  onBatchImported: (matches: FullMatchData[]) => void;
}

export const AttachmentUploadModal: React.FC<AttachmentUploadModalProps> = ({
  isOpen,
  onClose,
  onImageAnalyzed,
  onBatchImported,
}) => {
  const [activeTab, setActiveTab] = useState<'image' | 'batch' | 'architecture'>('image');
  const [isDragging, setIsDragging] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageNote, setImageNote] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [batchRawText, setBatchRawText] = useState('');
  const [parsedPreviewCount, setParsedPreviewCount] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const batchFileInputRef = useRef<HTMLInputElement>(null);

  // Global clipboard paste listener when modal is open
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            handleImageFile(file);
            setActiveTab('image');
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleImageFile = (file: File) => {
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewImage(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleImageUploadSubmit = async () => {
    if (!previewImage) return;
    setIsProcessing(true);

    try {
      const response = await fetch('/api/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: previewImage,
          mimeType: imageFile?.type || 'image/png',
          note: imageNote,
        }),
      });

      const res = await response.json();
      if (response.ok && res.success && res.source === 'GEMINI_AI') {
        let match;
        try {
          match = parseImageMatch(res.extractedData);
        } catch (error) {
          alert(error instanceof Error ? error.message : '截图识别数据不完整');
          return;
        }
        onImageAnalyzed(match, res.aiAnalysis, typeof res.geminiModel === 'string' ? res.geminiModel : undefined);
        onClose();
      } else {
        alert(res.error || '截图识别失败，请重试');
      }
    } catch (err) {
      console.error('Image analysis error:', err);
      alert('上传截图分析出错，请检查网络连接');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBatchTextChange = (text: string) => {
    setBatchRawText(text);
    const matches = parseBatchMatchesFromText(text);
    setParsedPreviewCount(matches.length);
  };

  const handleBatchFileSelect = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      handleBatchTextChange(content);
    };
    reader.readAsText(file);
  };

  const handleBatchSubmit = () => {
    const matches = parseBatchMatchesFromText(batchRawText);
    if (matches.length === 0) {
      alert('未检测到有效的赛事格式，请参考范例文本或点击“载入标准批量模板”');
      return;
    }
    onBatchImported(matches);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide">
                附件上传与多场次上下文隔离导入
              </h3>
              <p className="text-[11px] text-slate-400">
                支持截图自动识盘 · CSV/TXT 批量导入 · 杜绝上下文膨胀与信息污染
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Tab Navigation */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-slate-800 bg-slate-950/40 text-xs">
          <button
            onClick={() => setActiveTab('image')}
            className={`flex items-center gap-1.5 pb-2.5 font-semibold transition-all border-b-2 ${
              activeTab === 'image'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileImage className="w-4 h-4" />
            <span>📸 截图识盘 (支持微信/懂球帝截图 & 剪贴板Ctrl+V)</span>
          </button>
          <button
            onClick={() => setActiveTab('batch')}
            className={`flex items-center gap-1.5 pb-2.5 font-semibold transition-all border-b-2 ${
              activeTab === 'batch'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>📑 批量多场次导入 (CSV / 文本 / 表格)</span>
          </button>
          <button
            onClick={() => setActiveTab('architecture')}
            className={`flex items-center gap-1.5 pb-2.5 font-semibold transition-all border-b-2 ${
              activeTab === 'architecture'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <span>⚡ 上下文上限机制说明</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {/* TAB 1: IMAGE UPLOAD / PASTE */}
          {activeTab === 'image' && (
            <div className="space-y-4">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const files = e.dataTransfer.files;
                  if (files && files[0] && files[0].type.startsWith('image/')) {
                    handleImageFile(files[0]);
                  }
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                  isDragging
                    ? 'border-emerald-400 bg-emerald-500/10'
                    : previewImage
                    ? 'border-emerald-500/50 bg-slate-950/60'
                    : 'border-slate-800 hover:border-slate-700 bg-slate-950/40 hover:bg-slate-950/60'
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleImageFile(e.target.files[0]);
                    }
                  }}
                />

                {previewImage ? (
                  <div className="space-y-3">
                    <img
                      src={previewImage}
                      alt="盘赔截图预览"
                      className="max-h-56 mx-auto rounded-lg border border-slate-800 object-contain shadow-md"
                    />
                    <div className="flex items-center justify-center gap-2 text-xs text-emerald-400 font-medium">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>截图已载入，点击可更换图片或直接按下快捷键粘贴新截图</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 py-4">
                    <div className="w-12 h-12 rounded-full bg-slate-800 text-emerald-400 flex items-center justify-center mx-auto mb-2">
                      <Upload className="w-6 h-6" />
                    </div>
                    <p className="text-xs font-semibold text-slate-200">
                      拖拽截图到此处，或点击浏览本地图片
                    </p>
                    <p className="text-[11px] text-slate-500 font-mono">
                      快捷技巧：使用系统截图键 (Win+Shift+S / Cmd+Shift+4) 截取盘口，在此窗口直接按 <span className="text-emerald-400 font-bold">Ctrl+V</span> 即可粘贴！
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  补充说明 / 临场时间背景（选填）
                </label>
                <input
                  type="text"
                  value={imageNote}
                  onChange={(e) => setImageNote(e.target.value)}
                  placeholder="如：临场40分钟截图，主队核心伤停刚刚公布"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 rounded-lg"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={!previewImage || isProcessing}
                  onClick={handleImageUploadSubmit}
                  className="px-5 py-2 text-xs font-extrabold text-slate-950 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 rounded-lg shadow-lg disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  {isProcessing ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>多模态视觉识盘与测谎中...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>开始截图多模态深度识盘</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: BATCH CSV / TEXT IMPORT */}
          {activeTab === 'batch' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs">
                <div className="text-slate-300 font-semibold flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                  <span>粘贴或导入批量赛事（CSV / 制表符 / 多行文本）</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <button
                    type="button"
                    onClick={() => handleBatchTextChange(SAMPLE_BATCH_MARKDOWN)}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 underline font-mono cursor-pointer"
                  >
                    + 载入 Markdown 表格范例
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBatchTextChange(SAMPLE_BATCH_CSV)}
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 underline font-mono cursor-pointer"
                  >
                    + 载入 CSV 范例
                  </button>
                  <button
                    type="button"
                    onClick={() => batchFileInputRef.current?.click()}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs rounded border border-slate-700"
                  >
                    上传 .csv/.md/.txt 文件
                  </button>
                  <input
                    type="file"
                    ref={batchFileInputRef}
                    accept=".csv,.txt,.tsv,.md"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleBatchFileSelect(e.target.files[0]);
                      }
                    }}
                  />
                </div>
              </div>

              {/* Multi-Import & Kickoff Lock Protection Notice */}
              <div className="space-y-1.5">
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 flex items-center justify-between text-xs text-amber-300">
                  <div className="flex items-center gap-2">
                    <span className="text-amber-400 font-bold">🔒 终盘快照差量更新保护：</span>
                    <span className="text-[11px] text-slate-300">
                      若您已锁定/已封盘早先开赛的场次，再次导入全量 Markdown 时将<strong>自动免疫覆盖</strong>，保留终盘快照！
                    </span>
                  </div>
                </div>
                <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl px-3 py-2 flex items-center justify-between text-xs text-cyan-300">
                  <div className="flex items-center gap-2">
                    <span className="text-cyan-400 font-bold">⏱️ 开赛时间识别 & 销售日映射：</span>
                    <span className="text-[11px] text-slate-300">
                      自动提取 Markdown 中的开赛时间（如 <code>开赛时间: 2026-03-28 23:00</code> 或 <code>03-29 03:00</code>），严格按<strong>当日 11:00 至次日 11:00 划定竞彩销售日</strong>，复盘归档严密对齐赛果！
                    </span>
                  </div>
                </div>
              </div>

              <textarea
                value={batchRawText}
                onChange={(e) => handleBatchTextChange(e.target.value)}
                placeholder="直接粘贴 Markdown 分析报告、表格或 CSV 内容。系统智能识别开赛时间，例如：
# 2026-03-28 竞彩足球大盘分析
## 【1】曼彻斯特城 vs 埃弗顿
- 联赛：英超 ｜ 开赛时间：2026-03-28 23:00
- 亚盘让步：-1.75 ｜ 欧指走势：1.22 6.80 12.0 ｜ 大小球：3.25

## 【2】皇家马德里 vs 赫塔菲
- 联赛：西甲 ｜ 开赛时间：2026-03-29 03:00 (自动归属 03-28 销售日)
- 亚盘让步：-1.25 ｜ 欧指走势：1.42 4.60 7.20 ｜ 大小球：2.5"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 font-mono h-44 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />

              {parsedPreviewCount > 0 && (
                <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-lg p-2.5 flex items-center justify-between text-xs text-emerald-300">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>成功解析 {parsedPreviewCount} 场比赛数据</span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    将导入至【批量矩阵队列池】，采用上下文隔离独立精算
                  </span>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 rounded-lg"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={parsedPreviewCount === 0}
                  onClick={handleBatchSubmit}
                  className="px-5 py-2 text-xs font-extrabold text-slate-950 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 rounded-lg shadow-lg disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>导入批处理队列 ({parsedPreviewCount} 场)</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: ARCHITECTURE & CONTEXT LIMIT CLARIFICATION */}
          {activeTab === 'architecture' && (
            <div className="space-y-4 text-xs">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  <span>关于“场次太多会不会超出上下文上限”的精算工程设计说明</span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  您提出的问题非常专业且直击大型足彩精算系统的核心痛点。在传统大模型交互中，如果把 20 场比赛一次性塞入同一个 Prompt，确实会导致：
                  <strong className="text-rose-400"> 1. 上下文窗口暴涨；2. 跨场次逻辑交叉污染；3. 机构操盘模型判断力严重钝化</strong>。
                </p>
                <p className="text-slate-300 leading-relaxed">
                  针对这一风险，本系统采用严密的 <strong className="text-emerald-400">“单场隔离（Match-Context Isolation）+ 本地确定性精算引擎预处理”</strong> 架构：
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1.5">
                  <div className="text-emerald-400 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>1. 场次独立沙箱</span>
                  </div>
                  <p className="text-slate-400 leading-relaxed text-[11px]">
                    无论是导入 10 场还是 100 场比赛，系统均将其拆解为一个个完全独立的单场沙箱。每一场的欧亚水位、变轨偏离与五大模型检测均独立结算，绝无任何 Token 累积风险。
                  </p>
                </div>

                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1.5">
                  <div className="text-cyan-400 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    <span>2. 本地精算毫秒响应</span>
                  </div>
                  <p className="text-slate-400 leading-relaxed text-[11px]">
                    本地内嵌的《财富经》量化引擎可在无需消耗任何 AI Token 的情况下，即时测算出 50 场比赛的机构抽水率、去水概率与模型定性，实现零延迟总览。
                  </p>
                </div>

                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1.5">
                  <div className="text-amber-400 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    <span>3. 单场点对点穿透</span>
                  </div>
                  <p className="text-slate-400 leading-relaxed text-[11px]">
                    在批量矩阵中，您只需点击任意感兴趣的场次，系统才会针对该特定场次调度 Gemini 大模型进行纵深三维测谎，上下文消耗恒定在极小区间。
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
