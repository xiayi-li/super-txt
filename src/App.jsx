import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  Folder, Search, Plus, FileText, Settings, Copy, Trash2, 
  ChevronDown, ChevronRight, ListChecks, Moon, Sun, X, Bold, Italic, 
  List, Eye, Code, FolderOpen, Link as LinkIcon, 
  FileOutput, ArrowRightLeft, Quote, FolderPlus, Library, Camera, CalendarDays, 
  Clock, Maximize, Minimize, CornerRightUp, Palette, ListTree, RefreshCw
} from 'lucide-react';

// 稳健的 Tauri 检测，防止 window.__TAURI__ 部分定义时崩溃
const _tauriInvoke = (() => {
  try {
    if (typeof window === 'undefined') return null;
    if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) return window.__TAURI__.core.invoke;
    if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) return window.__TAURI_INTERNALS__.invoke;
  } catch (e) { console.warn('Tauri 探测异常:', e); }
  return null;
})();
const isTauri = !!_tauriInvoke;
// 增加超时保护：如果 invoke 挂起超过 8 秒自动 reject
const invoke = isTauri ? (cmd, args) => {
  return Promise.race([
    _tauriInvoke(cmd, args),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`invoke('${cmd}') 超时`)), 8000))
  ]);
} : (async () => undefined);

console.log('[SuperTxt] isTauri =', isTauri, '| 初始化开始');

if (!window.loadLocalImage) {
  window.loadLocalImage = async (path, imgElement) => {
    if (!isTauri || imgElement.dataset.loaded) return;
    try {
      const bytes = await invoke('read_raw_file', { path });
      const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' });
      imgElement.src = URL.createObjectURL(blob);
      imgElement.dataset.loaded = 'true';
    } catch(e) { console.error("图片加载失败:", e); }
  };
}

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null, info: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { this.setState({ info }); }
  render() {
    if (this.state.hasError) return (
      <div className="p-10 text-red-600 bg-red-50 h-screen w-full flex flex-col items-center justify-center">
        <h1 className="text-2xl font-bold mb-4">UI 渲染崩溃拦截</h1>
        <pre className="text-xs bg-white p-4 rounded shadow border border-red-200 overflow-auto max-w-3xl">{this.state.error?.toString()}</pre>
        {this.state.info && <pre className="text-xs bg-white p-3 rounded border mt-2 max-w-3xl max-h-40 overflow-auto">{this.state.info.componentStack}</pre>}
        <button onClick={()=>window.location.reload()} className="mt-4 px-4 py-2 bg-red-600 text-white rounded">刷新重试</button>
      </div>
    );
    return this.props.children;
  }
}

const initialCategories = [{ id: 'c1', name: '个人笔记', parentId: null, expanded: false }];
const initialTags = [{ id: 't1', name: '重要', color: '#EF4444' }];

const generatePath = (categoryId, title, format, categories, basePath) => {
  const safeTitle = (title || '未命名').replace(/[\\/:*?"<>|]/g, '');
  if (!categoryId) return `${basePath}\\${safeTitle}.${format}`;
  let path = []; let currentId = categoryId;
  while (currentId) {
    const cat = categories.find(c => c.id === currentId);
    if (cat) { path.unshift(cat.name); currentId = cat.parentId; } else break;
  }
  return `${basePath}\\${path.join('\\')}\\${safeTitle}.${format}`;
};

const getCategoryFullPath = (categoryId, categories) => {
  if (!categoryId) return '根目录 (未分类)';
  let path = []; let currentId = categoryId;
  while (currentId) {
    const cat = categories.find(c => c.id === currentId);
    if (cat) { path.unshift(cat.name); currentId = cat.parentId; } else break;
  }
  return path.join(' / ');
};

const formatDate = (isoStr) => {
  if(!isoStr) return '';
  const d = new Date(isoStr);
  const now = new Date();
  const diffMs = now - d;
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  const pad = (n) => n.toString().padStart(2,'0');
  // 一周内：显示到分钟
  if (diffMs >= 0 && diffMs < oneWeek) {
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (d.toDateString() === now.toDateString()) return `今天 ${time}`;
    const yesterday = new Date(now); yesterday.setDate(now.getDate()-1);
    if (d.toDateString() === yesterday.toDateString()) return `昨天 ${time}`;
    return `${pad(d.getMonth()+1)}-${pad(d.getDate())} ${time}`;
  }
  // 一周以上：显示到日
  if (d.getFullYear() === now.getFullYear()) return `${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
};

// 高亮关键词工具：在文本中包裹 <mark>
const highlightText = (text, query) => {
  const str = String(text||'');
  const q = (query||'').trim();
  if (!q) return str;
  try {
    const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`,'gi');
    const parts = str.split(re);
    return parts.map((p,i) => p.toLowerCase() === q.toLowerCase()
      ? `<mark style="background:#fef08a;color:#92400e;border-radius:2px;padding:0 2px;">${p}</mark>`
      : p).join('');
  } catch { return str; }
};

const stripMarkdown = (text) => (text||'').replace(/```[\s\S]*?```/g,'').replace(/<[^>]+>/g,'').replace(/[#_*~`]/g,'').replace(/!\[.*?\]\(.*?\)/g,'[图片]').replace(/\[(.*?)\]\(.*?\)/g,'$1').replace(/\[\[(.*?)\]\]/g,'$1').replace(/^\s*[-\d.]\s/gm,'').replace(/\|.*\|/g,'').split('\n').map(l=>l.trim()).filter(l=>l.length>0).join('\n');

const htmlToMarkdown = (html) => {
  if (!html) return '';

  // ——— DOM 预处理：用真实 DOM property 检测 checkbox 状态 ———
  // innerHTML 序列化只反映 HTML attribute（checked），不反映用户点击后的 property（.checked）
  // 必须通过 DOM API 读取真实状态，转为安全占位符（不含 null 字节/HTML特殊字符）
  const cbItems = []; // 存储 {checked, text} 数组
  let source = html;
  if (typeof document !== 'undefined') {
    try {
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      tmp.querySelectorAll('li').forEach(li => {
        const cb = li.querySelector('input[type="checkbox"]');
        if (!cb) return;
        const isChecked = cb.checked; // 真实当前状态（property）
        cb.remove();
        const text = li.textContent.trim();
        const idx = cbItems.length;
        cbItems.push({ checked: isChecked, text });
        // 用索引占位符替换整个 li（避免 null 字节在 HTML 序列化中被损坏）
        const span = document.createElement('span');
        span.dataset.cbidx = String(idx);
        li.replaceWith(span);
      });
      source = tmp.innerHTML;
    } catch (e) { /* 降级到正则处理 */ }
  }

  let md = String(source);
  // 先将 <br> 替换为 \n
  md = md.replace(/<br\s*[\/]?>/gi, '\n');
  // div/p 换行
  md = md.replace(/<\/div>\s*<div[^>]*>/gi, '\n').replace(/<div[^>]*>/gi, '\n').replace(/<\/div>/gi, '');
  md = md.replace(/<p[^>]*>/gi, '').replace(/<\/p>/gi, '\n');
  // 颜色 span 保留（先匹配，后续不被 strip 掉）
  md = md.replace(/<span\s+style\s*=\s*["']color:\s*(.*?)["'][^>]*>(.*?)<\/span>/gi, '§COLOR§$1§§$2§END§');
  md = md.replace(/<font\s+color=["'](.*?)["'][^>]*>([\s\S]*?)<\/font>/gi, '§COLOR§$1§§$2§END§');
  md = md.replace(/<font\s+color=([\w#]+)[^>]*>([\s\S]*?)<\/font>/gi, '§COLOR§$1§§$2§END§');
  // 提取 DOM 预处理生成的 checkbox 索引占位符 span
  md = md.replace(/<span\s+data-cbidx="(\d+)"[^>]*><\/span>/gi, (_, idxStr) => {
    const idx = parseInt(idxStr, 10);
    const item = cbItems[idx];
    if (!item) return '';
    return '\n- [' + (item.checked ? 'x' : ' ') + '] ' + item.text + '\n';
  });
  md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**').replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
  md = md.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*').replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n# $1\n').replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n## $1\n').replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n### $1\n');
  // 相邻标题之间不要有空行
  md = md.replace(/^(#{1,6} .+)\n\n+(#{1,6} )/gm, '$1\n$2');
  // 列表：先处理 <ul><ol>，去除列表标签及其前后空白
  md = md.replace(/<\/?ul[^>]*>/gi, '').replace(/<\/?ol[^>]*>/gi, '');
  // 去掉 <li> 前的多余换行，避免产生空行
  md = md.replace(/\n+(<li)/gi, '\n$1');
  // 正则兜底（DOM 预处理未覆盖的情况）
  md = md.replace(/<li[^>]*>\s*<input[^>]*checked[^>]*>\s*([\s\S]*?)<\/li>/gi, (m, p1) => '- [x] ' + p1.replace(/\n/g,'').trim() + '\n');
  md = md.replace(/<li[^>]*>\s*<input[^>]*type="checkbox"[^>]*>\s*([\s\S]*?)<\/li>/gi, (m, p1) => '- [ ] ' + p1.replace(/\n/g,'').trim() + '\n');
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (m, p1) => '- ' + p1.replace(/\n/g,'').trim() + '\n');
  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (m, inner) =>
    inner.replace(/<[^>]+>/g,'').split('\n').filter(l=>l.trim()).map(l => `> ${l.trim()}`).join('\n') + '\n');
  md = md.replace(/<span[^>]*class="wiki-link"[^>]*data-title="(.*?)"[^>]*>.*?<\/span>/gi, '[[$1]]');
  md = md.replace(/<img[^>]*data-path="(.*?)"[^>]*alt="(.*?)"[^>]*data-width="(.*?)"[^>]*>/gi, '![$2|$3]($1)');
  md = md.replace(/<img[^>]*data-path="(.*?)"[^>]*alt="(.*?)"[^>]*>/gi, '![$2]($1)');
  md = md.replace(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/gi, '```\n$1\n```\n');
  // 先把颜色占位符转换为最终的 HTML span（需保护，不能被后续 strip 掉）
  // 用索引占位符，等 strip 之后再还原
  const colorSpans = [];
  md = md.replace(/§COLOR§(.*?)§§(.*?)§END§/g, (_, color, text) => {
    const idx = colorSpans.length;
    colorSpans.push(`<span style="color:${color}">${text}</span>`);
    return `\x00COLOR${idx}\x00`;
  });
  // 去除所有剩余 HTML 标签
  md = md.replace(/<[^>]+>/g, '');
  // 还原 HTML 实体
  md = md.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  // 最后还原颜色 span
  colorSpans.forEach((span, idx) => { md = md.split(`\x00COLOR${idx}\x00`).join(span); });
  // 去除列表项之间多余的空行（连续 - 开头的行之间不应有空行）
  md = md.replace(/^([-*] .*)\n\n+([-*] )/gm, '$1\n$2');
  md = md.replace(/^(- \[[ x]\] .*)\n\n+(- \[[ x]\] )/gm, '$1\n$2');
  // 去除标题与列表之间的多余空行
  md = md.replace(/^(#{1,6} .+)\n\n+(- \[[ x]\] )/gm, '$1\n$2');
  md = md.replace(/^(#{1,6} .+)\n\n+([-*] )/gm, '$1\n$2');
  // 最多保留一个空行
  md = md.replace(/\n{3,}/g, '\n\n');
  return md.trim();
};

// 在序列化前将 checkbox 的 DOM property（.checked）同步到 HTML attribute
// 因为用户点击 checkbox 只改 property，不改 attribute，innerHTML 只反映 attribute
const syncCheckboxesAndMarkdown = (el) => {
  if (!el) return '';
  el.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    if (cb.checked) cb.setAttribute('checked', '');
    else cb.removeAttribute('checked');
  });
  return htmlToMarkdown(el.innerHTML);
};

const renderMarkdown = (rawText) => {
  let text = String(rawText || '');
  if (!text) return '';
  text = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // 围栏代码块
  text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
    `<pre style="background:#1e1e2e;color:#cdd6f4;padding:1rem;border-radius:8px;overflow-x:auto;margin:12px 0;font-size:13px;line-height:1.5;"><code>${code}</code></pre>`);
  // 水平线
  text = text.replace(/^---$/gm, '<hr style="border:none;border-top:1px solid #e5e7eb;margin:1.5rem 0;"/>');
  // 标题
  text = text.replace(/^### (.*$)/gim, '<h3 data-heading="$1" style="font-size:1.125rem;font-weight:700;margin:1rem 0 0.5rem;">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 data-heading="$1" style="font-size:1.25rem;font-weight:700;margin:1.5rem 0 0.75rem;border-bottom:1px solid #e5e7eb;">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 data-heading="$1" style="font-size:1.875rem;font-weight:800;margin:1.5rem 0 1rem;">$1</h1>');
  // 行内格式
  text = text.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>').replace(/\*(.*?)\*/gim, '<em>$1</em>');
  text = text.replace(/&lt;span style="color:(.*?)"&gt;(.*?)&lt;\/span&gt;/gim, '<span style="color:$1">$2</span>');
  text = text.replace(/`(.*?)`/gim, '<code style="background-color:#f3f4f6;padding:2px 6px;border-radius:4px;color:#db2777;">$1</code>');
  // 列表
  text = text.replace(/^- \[ \] (.*$)/gim, '<li style="list-style:none;"><input type="checkbox" style="margin-right:8px;"/> $1</li>')
    .replace(/^- \[(x|X)\] (.*$)/gim, '<li style="list-style:none;color:#9ca3af;text-decoration:line-through;"><input type="checkbox" checked style="margin-right:8px;"/> $2</li>')
    .replace(/^- (.*$)/gim, '<li style="margin-left:1.25rem;list-style-type:disc;margin-top:0.25rem;margin-bottom:0.25rem;">$1</li>');
  text = text.replace(/^\d+\.\s(.*$)/gim, '<li style="margin-left:1.25rem;list-style-type:decimal;margin-top:0.25rem;margin-bottom:0.25rem;">$1</li>');
  // 引用
  text = text.replace(/^\&gt;\s(.*$)/gim, '<blockquote>$1</blockquote>');
  // 合并相邻 blockquote
  text = text.replace(/<\/blockquote>\n<blockquote>/g, '\n');
  // 表格 (简易)
  text = text.replace(/^\|(.+)\|\s*\n\|[-\s|:]+\|\s*\n((?:\|.+\|\s*\n?)*)/gm, (match, header, body) => {
    const ths = header.split('|').map(h => `<th style="border:1px solid #e5e7eb;padding:8px 12px;background:#f9fafb;">${h.trim()}</th>`).join('');
    const rows = body.trim().split('\n').map(row => {
      const tds = row.replace(/^\||\|$/g,'').split('|').map(c => `<td style="border:1px solid #e5e7eb;padding:8px 12px;">${c.trim()}</td>`).join('');
      return `<tr>${tds}</tr>`;
    }).join('');
    return `<table style="width:100%;border-collapse:collapse;margin:12px 0;"><thead><tr>${ths}</tr></thead><tbody>${rows}</tbody></table>`;
  });
  // 双向链接 + 图片
  text = text.replace(/\[\[(.*?)\]\]/g, '<span class="wiki-link text-blue-600 dark:text-blue-400 font-medium cursor-pointer hover:underline" data-title="$1">[[$1]]</span>');
  text = text.replace(/!\[(.*?)\|(\d+)\]\((.*?)\)/g, '<img src="$3" data-path="$3" alt="$1" data-width="$2" style="width:$2px;max-width:100%;border-radius:8px;border:1px solid #ddd;margin:12px 0;" class="previewable-img" title="单击编辑尺寸 · 双击放大" onerror="window.loadLocalImage(this.getAttribute(\'data-path\'), this)"/>');
  text = text.replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" data-path="$2" alt="$1" style="max-width:100%;border-radius:8px;border:1px solid #ddd;margin:12px 0;" class="previewable-img" title="单击编辑尺寸 · 双击放大" onerror="window.loadLocalImage(this.getAttribute(\'data-path\'), this)"/>');
  // 去掉列表项间的换行（不要转为 <br/>）
  text = text.replace(/<\/li>\n/g, '</li>');
  // 去掉标题与列表之间的换行（避免日期与待办之间多余空行）
  text = text.replace(/<\/h([1-6])>\n(<li|<ul|<ol)/gi, '</h$1>$2');
  text = text.replace(/\n/g, '<br/>');
  return text;
};

export default function App() {
  return <ErrorBoundary><SuperTxtShell /></ErrorBoundary>;
}

function SuperTxtShell() {
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('supertxt_theme') || 'light'; } catch { return 'light'; } });
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [notes, setNotes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [tags, setTags] = useState([]);
  const [recentIds, setRecentIds] = useState([]);
  const [workspacePath, setWorkspacePath] = useState(() => { try { return localStorage.getItem('supertxt_workspace') || 'D:\\SuperTxt_Workspace'; } catch { return 'D:\\SuperTxt_Workspace'; } });

  const [sidebarWidth, setSidebarWidth] = useState(240);
  const isResizing = useRef(false);
  const [zenMode, setZenMode] = useState(false);

  const [activeCategoryId, setActiveCategoryId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [openTabs, setOpenTabs] = useState([]);
  const [activeNoteId, setActiveNoteId] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [renamingCategoryId, setRenamingCategoryId] = useState(null);
  const [renameCategoryValue, setRenameCategoryValue] = useState('');

  const [showVisualMode, setShowVisualMode] = useState(false);
  const [showTOC, setShowTOC] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const [showBacklinks, setShowBacklinks] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [tempWorkspacePath, setTempWorkspacePath] = useState(workspacePath);
  const [showTempTextModal, setShowTempTextModal] = useState(false);
  const [tempTextContent, setTempTextContent] = useState('');
  const [toastMessage, setToastMessage] = useState(null);
  const toastTimeoutRef = useRef(null);

  const [confirmDialog, setConfirmDialog] = useState(null);
  const [moveDialog, setMoveDialog] = useState(null);
  const [saveStatus, setSaveStatus] = useState({ state: 'saved', time: null });
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  const [showRecentModal, setShowRecentModal] = useState(false);
  const [recentPage, setRecentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // 正文字体大小: sm=13px, md=15px, lg=17px
  const [editorFontSize, setEditorFontSize] = useState(() => { try { return localStorage.getItem('supertxt_fontsize') || 'md'; } catch { return 'md'; } });
  const fontSizeMap = { sm: '13px', md: '15px', lg: '17px' };
  useEffect(() => { try { localStorage.setItem('supertxt_fontsize', editorFontSize); } catch {} }, [editorFontSize]);

  // 工具栏激活态（视觉模式下根据 selection 查询）
  const [activeFormats, setActiveFormats] = useState({ bold:false, italic:false, h1:false, h2:false, h3:false, list:false, quote:false, currentColor:'#111827' });
  // 一键折叠所有展开目录
  const expandedCount = useMemo(() => categories.filter(c=>c.expanded).length, [categories]);

  const visualEditorRef = useRef(null);
  const newCatInputRef = useRef(null);
  const saveTimeoutId = useRef(null);
  const contentSyncId = useRef(null);
  const savedSelectionRef = useRef(null);
  // 模式切换时存储实时 markdown 内容，防止异步 state 导致内容丢失
  const pendingSourceContentRef = useRef(null);
  // 追踪当前激活笔记 ID，防止延迟同步把新笔记内容写入旧笔记
  const activeNoteIdRef = useRef(null);
  useEffect(() => { activeNoteIdRef.current = activeNoteId; }, [activeNoteId]);
  // 定期自动保存：追踪上次已存内容，避免重复写盘
  const lastAutoSavedRef = useRef({ id: null, content: '' });

  const activeNote = useMemo(() => notes.find(n => n.id === activeNoteId), [notes, activeNoteId]);
  const docHeadings = useMemo(() => {
    if (!activeNote || !activeNote.content) return [];
    const regex = /^(#{1,6})\s+(.*)$/gm;
    let match; const headings = [];
    while ((match = regex.exec(activeNote.content)) !== null) {
      // 去掉 md 内联格式：**bold**, *italic*, `code`, [[link]]
      const text = match[2].replace(/\*\*(.*?)\*\*/g,'$1').replace(/\*(.*?)\*/g,'$1').replace(/`(.*?)`/g,'$1').replace(/\[\[(.*?)\]\]/g,'$1').trim();
      headings.push({ level: match[1].length, text, id: text });
    }
    return headings;
  }, [activeNote?.content]);

  const backlinks = useMemo(() => {
    if (!activeNote || !activeNote.title) return [];
    const linkSyntax = `[[${activeNote.title}]]`;
    return notes.filter(n => n.id !== activeNote.id && (n.content || '').includes(linkSyntax));
  }, [notes, activeNote]);

  const showToast = useCallback((msg, isError = false) => {
    setToastMessage({ text: msg, isError });
    if(toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 3000);
  }, []);
  const requestConfirm = (message, onConfirm) => setConfirmDialog({ message, onConfirm });

  // 全局点击：关闭右键菜单、图片预览、wiki-link跳转
  useEffect(() => {
    const handleClick = (e) => {
      const target = (e.target instanceof Element) ? e.target : null;
      if (!target) return;
      setContextMenu(null);
      if (showColorPicker && !target.closest('.color-picker-container')) setShowColorPicker(false);
      // 双向链接点击
      const wikiLink = target.closest('.wiki-link');
      if (wikiLink) {
        const title = wikiLink.dataset.title;
        if (!title) return;
        const targetNote = notes.find(n => n.title === title);
        if (targetNote) { handleOpenNote(targetNote.id); }
        else {
          if (!activeCategoryId || activeCategoryId === '__recent__') { showToast('⚠️ 请先在左侧选择一个目录', true); return; }
          const newNote = { id: `n${Date.now()}`, title, content: '', categoryId: activeCategoryId, tags: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), format: 'md', isPinned: false };
          setNotes(prev => [newNote, ...prev]);
          setOpenTabs(prev => Array.from(new Set([newNote.id, ...prev])));
          setActiveNoteId(newNote.id);
          showToast(`📝 新建笔记：${title}`);
        }
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [showColorPicker, notes, activeCategoryId]);

  // 全局未捕获错误监听（控制台输出，便于排查）
  useEffect(() => {
    const onErr = (ev) => { console.error('[GlobalError]', ev.error || ev.message); };
    const onRej = (ev) => { console.error('[UnhandledRejection]', ev.reason); };
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onRej);
    return () => { window.removeEventListener('error', onErr); window.removeEventListener('unhandledrejection', onRej); };
  }, []);

  // 粘贴事件
  useEffect(() => {
    const handleGlobalPaste = async (e) => {
      const items = e.clipboardData?.items;
      let hasImage = false;
      if (items && isTauri) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) {
            hasImage = true; e.preventDefault();
            const blob = items[i].getAsFile(); const buffer = await blob.arrayBuffer(); const bytes = Array.from(new Uint8Array(buffer));
            const fileName = `img_${Date.now()}.png`; const imgPath = `${workspacePath}\\.assets\\${fileName}`;
            try {
              await invoke('save_raw_file', { path: imgPath, bytes });
              const mdImage = `\n![粘贴图片](${imgPath})\n`;
              if (activeNoteId) {
                if (showVisualMode && visualEditorRef.current && document.activeElement === visualEditorRef.current) {
                  document.execCommand('insertHTML', false, `<img src="${imgPath}" data-path="${imgPath}" alt="粘贴图片" style="max-width:100%;border-radius:8px;border:1px solid #ddd;margin:12px 0;" class="previewable-img" title="单击编辑尺寸 · 双击放大" onerror="window.loadLocalImage(this.getAttribute('data-path'), this)"/>`);
                  updateActiveNote({content: syncCheckboxesAndMarkdown(visualEditorRef.current)});
                } else {
                  const textarea = document.getElementById('note-editor-textarea');
                  if (textarea && document.activeElement === textarea) {
                    const start = textarea.selectionStart; const text = textarea.value;
                    updateActiveNote({content: text.substring(0, start) + mdImage + text.substring(textarea.selectionEnd)});
                  } else { updateActiveNote({content: (notes.find(n => n.id === activeNoteId)?.content || '') + mdImage}); }
                }
                showToast("✅ 图片已保存并插入");
              } else {
                if (!activeCategoryId || activeCategoryId === '__recent__') { showToast('⚠️ 请先在左侧选择一个目录', true); return; }
                const newNote = { id: `n${Date.now()}`, title: `图片笔记_${Date.now()}`, content: mdImage, categoryId: activeCategoryId, tags: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), format: 'md', isPinned: false };
                setNotes(prev => [newNote, ...prev]); setOpenTabs(prev => Array.from(new Set([newNote.id, ...prev]))); setActiveNoteId(newNote.id);
              }
            } catch (err) { showToast("❌ 保存图片失败", true); }
            return;
          }
        }
      }
      if (!hasImage) {
        const target = e.target;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && !target.isContentEditable) {
          const text = e.clipboardData.getData('text/plain');
          if (text) {
            e.preventDefault();
            if (!activeCategoryId || activeCategoryId === '__recent__') { showToast('⚠️ 请先在左侧选择一个目录', true); return; }
            const newTitle = text.trim().split('\n')[0].substring(0, 30) || '剪贴板笔记';
            const newNote = { id: `n${Date.now()}`, title: newTitle, content: text, categoryId: activeCategoryId, tags: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), format: 'txt', isPinned: false };
            setNotes(prev => [newNote, ...prev]); setOpenTabs(prev => Array.from(new Set([newNote.id, ...prev]))); setActiveNoteId(newNote.id);
          }
        }
      }
    };
    document.addEventListener('paste', handleGlobalPaste);
    return () => document.removeEventListener('paste', handleGlobalPaste);
  }, [activeCategoryId, activeNoteId, showVisualMode, workspacePath]);

  // 数据初始化
  useEffect(() => {
    const initData = async () => {
      console.log('[SuperTxt] initData 开始, isTauri=', isTauri, 'workspace=', workspacePath);
      if (!isTauri) {
        setNotes([{ id: 'n1', title: '欢迎使用', content: '# 欢迎使用 SuperTxt\n\nWeb端无本地权限，请使用 Tauri 桌面端体验完整功能。', categoryId: 'c1', tags: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), format: 'md', isPinned: true }]);
        setCategories(initialCategories); setTags(initialTags); setOpenTabs(['n1']); setActiveNoteId('n1'); setIsDataLoaded(true); return;
      }
      try {
        const indexStr = await invoke('read_local_file', { path: `${workspacePath}\\supertxt_index.json` });
        console.log('[SuperTxt] 索引读取成功, 长度=', (indexStr||'').length);
        const parsedMeta = JSON.parse(indexStr);
        // 补全旧数据可能缺失的字段，避免渲染崩溃
        const safeNotes = (parsedMeta.notes || []).map(n => ({
          id: n.id || `n${Math.random().toString(36).slice(2)}`,
          title: n.title || '未命名',
          content: typeof n.content === 'string' ? n.content : '',
          categoryId: n.categoryId ?? null,
          tags: Array.isArray(n.tags) ? n.tags : [],
          createdAt: n.createdAt || new Date().toISOString(),
          updatedAt: n.updatedAt || new Date().toISOString(),
          lastAccessedAt: n.lastAccessedAt || n.updatedAt || new Date().toISOString(),
          format: (n.format === 'md' || n.format === 'txt') ? n.format : 'txt',
          isPinned: !!n.isPinned,
        }));
        const safeCats = Array.isArray(parsedMeta.categories) && parsedMeta.categories.length
          ? parsedMeta.categories.map(c => ({ ...c, expanded: false }))
          : initialCategories;
        setCategories(safeCats); setNotes(safeNotes); setTags(parsedMeta.tags || []); setRecentIds(Array.isArray(parsedMeta.recentIds) ? parsedMeta.recentIds : []);
        console.log('[SuperTxt] 数据加载完成:', safeNotes.length, '条笔记,', safeCats.length, '个目录');
      } catch (e) {
        console.warn('[SuperTxt] 索引加载失败(首次运行属正常):', e?.message || e);
        setCategories(initialCategories); setNotes([]); setTags(initialTags); setRecentIds([]);
      }
      setIsDataLoaded(true);
      console.log('[SuperTxt] initData 完成, isDataLoaded=true');
    };
    initData();
  }, [workspacePath]);

  // 应急备份恢复：启动时检测上次崩溃前保存的备份
  useEffect(() => {
    if (!isDataLoaded || !isTauri) return;
    try {
      const raw = localStorage.getItem('supertxt_emergency');
      if (!raw) return;
      const backup = JSON.parse(raw);
      if (!backup || !backup.id || !backup.content) { localStorage.removeItem('supertxt_emergency'); return; }
      const note = notes.find(n => n.id === backup.id);
      if (!note) { localStorage.removeItem('supertxt_emergency'); return; }
      const backupTime = new Date(backup.time).getTime();
      const noteTime = new Date(note.updatedAt).getTime();
      // 备份比已保存的版本新 → 恢复
      if (backupTime > noteTime) {
        console.log('[SuperTxt] 检测到应急备份，恢复笔记:', note.title);
        setNotes(prev => prev.map(n => {
          if (n.id === backup.id) {
            const restored = { ...n, content: backup.content, updatedAt: backup.time };
            const path = generatePath(restored.categoryId, restored.title, restored.format, categories, workspacePath);
            invoke('save_local_file', { path, content: backup.content }).catch(() => {});
            return restored;
          }
          return n;
        }));
      }
      localStorage.removeItem('supertxt_emergency');
    } catch { localStorage.removeItem('supertxt_emergency'); }
  }, [isDataLoaded]);

  // 定期自动保存：每 5 秒无条件保存当前笔记到磁盘（最后安全网）
  useEffect(() => {
    if (!isDataLoaded || !isTauri) return;
    const interval = setInterval(() => {
      try {
        if (!activeNoteId) return;
        // 获取当前实时内容
        let content = null;
        if (showVisualMode && visualEditorRef.current) {
          content = syncCheckboxesAndMarkdown(visualEditorRef.current);
        } else {
          const note = notes.find(n => n.id === activeNoteId);
          if (note) content = note.content;
        }
        if (content === null) return;
        // 与上次自动保存内容一致则跳过
        if (lastAutoSavedRef.current.id === activeNoteId && lastAutoSavedRef.current.content === content) return;
        const note = notes.find(n => n.id === activeNoteId);
        if (!note) return;
        const path = generatePath(note.categoryId, note.title, note.format, categories, workspacePath);
        invoke('save_local_file', { path, content }).catch(() => {});
        lastAutoSavedRef.current = { id: activeNoteId, content };
      } catch {}
    }, 5000);
    return () => clearInterval(interval);
  }, [isDataLoaded, activeNoteId, showVisualMode, notes, categories, workspacePath]);

  // 自动保存索引
  useEffect(() => {
    if (!isDataLoaded || !isTauri) return;
    const timer = setTimeout(async () => {
      try { await invoke('save_local_file', { path: `${workspacePath}\\supertxt_index.json`, content: JSON.stringify({ notes, categories, tags, recentIds: Array.from(new Set(recentIds)) }) }); } catch (e) {}
    }, 1500);
    return () => clearTimeout(timer);
  }, [notes, categories, tags, recentIds, isDataLoaded, workspacePath]);

  // 保险机制：页面关闭/隐藏时强制保存当前笔记内容
  useEffect(() => {
    const getCurrentContent = () => {
      if (!activeNoteId) return null;
      if (showVisualMode && visualEditorRef.current) {
        return syncCheckboxesAndMarkdown(visualEditorRef.current);
      }
      const textarea = document.getElementById('note-editor-textarea');
      if (textarea) return textarea.value;
      const note = notes.find(n => n.id === activeNoteId);
      return note ? note.content : null;
    };
    // beforeunload: localStorage 应急备份（防止崩溃丢失）
    const handleBeforeUnload = () => {
      try {
        const content = getCurrentContent();
        if (content !== null && activeNoteId) {
          localStorage.setItem('supertxt_emergency', JSON.stringify({
            id: activeNoteId,
            content,
            time: new Date().toISOString()
          }));
        }
      } catch {}
    };
    // visibilitychange: 切换应用时存盘
    const handleVisibility = () => {
      if (document.hidden && activeNoteId && isTauri) {
        try {
          const content = getCurrentContent();
          if (content !== null) {
            const note = notes.find(n => n.id === activeNoteId);
            if (note) {
              const path = generatePath(note.categoryId, note.title, note.format, categories, workspacePath);
              invoke('save_local_file', { path, content }).catch(() => {});
            }
          }
        } catch {}
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [activeNoteId, showVisualMode, notes, categories, workspacePath]);

  // 侧边栏拖拽
  useEffect(() => {
    const handleMouseMove = (e) => { if (isResizing.current) setSidebarWidth(Math.max(160, Math.min(400, e.clientX))); };
    const handleMouseUp = () => { isResizing.current = false; document.body.style.cursor = ''; document.body.style.userSelect = ''; };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => { document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp); };
  }, []);

  // 视觉模式初始化
  useEffect(() => {
    if (showVisualMode && visualEditorRef.current && activeNote) {
      if (visualEditorRef.current.getAttribute('data-note-id') !== activeNote.id) {
        visualEditorRef.current.innerHTML = renderMarkdown(activeNote.content);
        visualEditorRef.current.setAttribute('data-note-id', activeNote.id);
      }
    }
  }, [showVisualMode, activeNoteId]);

  // 视觉模式：监听选区变化，实时更新工具栏激活态
  useEffect(() => {
    if (!showVisualMode) { setActiveFormats({ bold:false, italic:false, h1:false, h2:false, h3:false, list:false, quote:false, currentColor:'#111827' }); return; }
    const updateFormats = () => {
      try {
        const block = document.queryCommandValue('formatBlock') || '';
        const fc = document.queryCommandValue('foreColor') || '';
        // 检查是否是 checkbox 待办列表（区别于普通无序列表）
        let isList = document.queryCommandState('insertUnorderedList');
        if (isList) {
          const sel = window.getSelection();
          let node = sel?.anchorNode;
          while (node && node !== visualEditorRef.current) {
            if (node.nodeType === 1 && node.tagName === 'LI' && node.querySelector && node.querySelector('input[type="checkbox"]')) {
              isList = false; break;
            }
            node = node.parentNode;
          }
        }
        setActiveFormats({
          bold: document.queryCommandState('bold'),
          italic: document.queryCommandState('italic'),
          h1: /h1/i.test(block),
          h2: /h2/i.test(block),
          h3: /h3/i.test(block),
          list: isList,
          quote: /blockquote/i.test(block),
          currentColor: fc || '#111827',
        });
      } catch {}
    };
    document.addEventListener('selectionchange', updateFormats);
    return () => document.removeEventListener('selectionchange', updateFormats);
  }, [showVisualMode]);

  // 主题持久化
  useEffect(() => { try { localStorage.setItem('supertxt_theme', theme); } catch {} }, [theme]);

  const getSubCategoryIds = useCallback((parentId, currentCategories) => {
    let ids = []; const visited = new Set();
    const walk = (pid) => {
      if (visited.has(pid)) return; visited.add(pid);
      currentCategories.filter(c => c.parentId === pid).forEach(child => { ids.push(child.id); walk(child.id); });
    };
    walk(parentId); return ids;
  }, []);

  const getCategoryNoteCount = useCallback((categoryId) => {
    const relevantCatIds = [categoryId, ...getSubCategoryIds(categoryId, categories)];
    return notes.filter(n => relevantCatIds.includes(n.categoryId)).length;
  }, [categories, notes, getSubCategoryIds]);

  const filteredNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    // 最近访问：按访问时间倒序（recentIds 顺序），最多 200 条
    if (activeCategoryId === '__recent__') {
      const list = Array.from(new Set(recentIds)).map(id => notes.find(n => n.id === id)).filter(Boolean);
      const filtered = q ? list.filter(n => (n.title||'').toLowerCase().includes(q) || (n.content||'').toLowerCase().includes(q)) : list;
      return filtered.slice(0, 200);
    }
    return notes.filter(note => {
      // 搜索非空时跨目录全局搜
      const matchCategory = q ? true : (activeCategoryId === null ? true : note.categoryId === activeCategoryId);
      const matchSearch = !q || (note.title || '').toLowerCase().includes(q) || (note.content || '').toLowerCase().includes(q);
      return matchCategory && matchSearch;
    }).sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      // 按最近修改时间倒序
      return new Date(b.updatedAt||0) - new Date(a.updatedAt||0);
    }).slice(0, 200);
  }, [notes, activeCategoryId, searchQuery, recentIds]);

  const updateActiveNote = (updates) => {
    if (!activeNoteId) return;
    const currentNote = notes.find(n => n.id === activeNoteId);
    if (!currentNote) return;
    if (updates.title !== undefined) {
      const isDup = notes.some(n => n.categoryId === currentNote.categoryId && n.id !== activeNoteId && n.title === updates.title);
      if (isDup) { showToast("⚠️ 同名文件拦截", true); return; }
    }
    // 检查是否有实际变化，无变化则不触发保存
    const hasContentChange = (updates.content !== undefined && updates.content !== currentNote.content);
    const hasTitleChange = (updates.title !== undefined && updates.title !== currentNote.title);
    const hasFormatChange = (updates.format !== undefined && updates.format !== currentNote.format);
    if (!hasContentChange && !hasTitleChange && !hasFormatChange && Object.keys(updates).every(k => ['content','title','format'].includes(k))) return;
    // 使用 functional setState 避免 stale closure 导致并发更新覆盖
    setNotes(prev => prev.map(n => {
      if (n.id === activeNoteId) {
        let updatedNote = { ...n, ...updates, updatedAt: new Date().toISOString() };
        if (hasTitleChange || hasFormatChange) {
          const oldPath = generatePath(n.categoryId, n.title, n.format, categories, workspacePath);
          const newPath = generatePath(n.categoryId, updatedNote.title, updatedNote.format, categories, workspacePath);
          if(isTauri) invoke('rename_local_item', { oldPath, newPath }).catch(()=>{});
        }
        if (hasContentChange || hasTitleChange || hasFormatChange) {
          if(saveTimeoutId.current) clearTimeout(saveTimeoutId.current);
          saveTimeoutId.current = setTimeout(async () => {
            if (!isTauri) { setSaveStatus({ state: 'saved', time: new Date() }); return; }
            try {
              const currentPath = generatePath(updatedNote.categoryId, updatedNote.title, updatedNote.format, categories, workspacePath);
              await invoke('save_local_file', { path: currentPath, content: updatedNote.content || '' });
              setSaveStatus({ state: 'saved', time: new Date() });
            } catch (err) { showToast("❌ 文件保存失败", true); }
          }, 800);
        }
        return updatedNote;
      }
      return n;
    }));
  };

  const handleOpenNote = (id) => {
    // 清理旧笔记的延迟同步定时器，防止交叉污染
    if (contentSyncId.current) { clearTimeout(contentSyncId.current); contentSyncId.current = null; }
    if (!openTabs.includes(id)) {
      // 标签页上限 10，超出时关闭最早打开的
      let newTabs = [id, ...openTabs];
      if (newTabs.length > 10) { newTabs = newTabs.slice(0, 10); }
      setOpenTabs(Array.from(new Set(newTabs)));
    }
    setActiveNoteId(id);
    // md 格式默认进入视觉模式
    const targetNote = notes.find(n => n.id === id);
    if (targetNote && targetNote.format === 'md') setShowVisualMode(true);
    // 最近访问：追加到末尾（不移到第一个，避免列表跳动），仅在不存在时添加
    setRecentIds(prev => { if (prev.includes(id)) return prev; return [id, ...prev].slice(0, 100); });
    // 写入访问时间（不触发 saveStatus 变化）
    setNotes(prev => prev.map(n => n.id === id ? { ...n, lastAccessedAt: new Date().toISOString() } : n));
    // 自动展开该笔记所在的父目录链 + 选中该目录
    const note = notes.find(n => n.id === id);
    if (note && note.categoryId) {
      setActiveCategoryId(note.categoryId);
      const idsToExpand = new Set();
      let cur = note.categoryId;
      while (cur) {
        idsToExpand.add(cur);
        const c = categories.find(x => x.id === cur);
        if (!c) break;
        cur = c.parentId;
      }
      setCategories(prev => prev.map(c => idsToExpand.has(c.id) ? { ...c, expanded: true } : c));
    }
  };

  const handleCloseTab = (e, id, skipSave = false) => {
    if (e?.stopPropagation) e.stopPropagation();
    // 关闭当前活跃标签页时，强制保存视觉编辑器内容（右键菜单不触发 onBlur）
    // skipSave: 删除笔记等场景不需要保存（文件已移入回收站）
    if (!skipSave && activeNoteId === id && showVisualMode && visualEditorRef.current) {
      if (contentSyncId.current) clearTimeout(contentSyncId.current);
      updateActiveNote({ content: syncCheckboxesAndMarkdown(visualEditorRef.current) });
    }
    const newTabs = openTabs.filter(t => t !== id);
    setOpenTabs(newTabs);
    if (activeNoteId === id) setActiveNoteId(newTabs.length > 0 ? newTabs[newTabs.length - 1] : null);
  };

  const handleCreateNote = () => {
    if (!activeCategoryId || activeCategoryId === '__recent__') {
      showToast('⚠️ 请先在左侧选择一个目录', true);
      return;
    }
    const targetCategoryId = activeCategoryId;
    let newTitle = '未命名笔记'; let counter = 1;
    while (notes.some(n => n.categoryId === targetCategoryId && n.title === newTitle)) { newTitle = `未命名笔记 (${counter})`; counter++; }
    const newNote = { id: `n${Date.now()}`, title: newTitle, content: '', categoryId: targetCategoryId, tags: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), format: 'txt', isPinned: false };
    if(isTauri) invoke('save_local_file', { path: generatePath(newNote.categoryId, newNote.title, newNote.format, categories, workspacePath), content: '' });
    setNotes([newNote, ...notes]);
    let newTabs = Array.from(new Set([newNote.id, ...openTabs]));
    if (newTabs.length > 10) newTabs = newTabs.slice(0, 10);
    setOpenTabs(newTabs); setActiveNoteId(newNote.id); setShowVisualMode(false);
    setTimeout(() => { const el = document.getElementById('note-title-input'); if (el) { el.focus(); el.select(); } }, 100);
  };

  // 扫描工作空间，发现手动复制进来的 .md/.txt 文件并加载到索引
  const handleScanWorkspace = async () => {
    if (!isTauri) { showToast('⚠️ 仅 Tauri 桌面端支持扫描', true); return; }
    try {
      showToast('🔍 正在扫描工作空间...');
      const jsonStr = await invoke('scan_workspace', { workspacePath });
      const files = JSON.parse(jsonStr);
      if (!files || files.length === 0) {
        showToast('📭 未发现新文件');
        return;
      }

      // 构建已有笔记的路径映射（使用相对路径作为去重键）
      const existingPaths = new Set(notes.map(n => {
        if (!n.categoryId) return `${n.title}.${n.format}`;
        const catPath = getCategoryFullPath(n.categoryId, categories).replace(/ \/ /g, '\\');
        return `${catPath}\\${n.title}.${n.format}`;
      }));

      const newNotes = [];
      const newCats = [];

      for (const file of files) {
        const fileKey = file.category_path ? `${file.category_path}\\${file.name}.${file.format}` : `${file.name}.${file.format}`;
        // 跳过已存在的文件（按路径+名称匹配）
        if (existingPaths.has(fileKey)) continue;

        // 解析/创建分类路径
        let parentCategoryId = null;
        if (file.category_path) {
          const pathSegments = file.category_path.split('\\').filter(s => s);
          for (const seg of pathSegments) {
            const existing = categories.find(c => c.name === seg && c.parentId === parentCategoryId);
            if (existing) {
              parentCategoryId = existing.id;
            } else if (!newCats.find(c => c.name === seg && c.parentId === parentCategoryId)) {
              const newCatId = `cs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
              newCats.push({ id: newCatId, name: seg, parentId: parentCategoryId, expanded: false });
              parentCategoryId = newCatId;
            } else {
              parentCategoryId = newCats.find(c => c.name === seg && c.parentId === parentCategoryId)?.id || parentCategoryId;
            }
          }
        }

        const createdAt = file.created_secs > 0 ? new Date(file.created_secs * 1000).toISOString() : new Date().toISOString();
        const updatedAt = file.modified_secs > 0 ? new Date(file.modified_secs * 1000).toISOString() : new Date().toISOString();

        newNotes.push({
          id: `ns_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          title: file.name,
          content: file.content,
          categoryId: parentCategoryId,
          tags: [],
          createdAt,
          updatedAt,
          format: file.format,
          isPinned: false,
        });
      }

      if (newNotes.length === 0 && newCats.length === 0) {
        showToast('📭 所有文件已在索引中，无需导入');
        return;
      }

      // 合并新分类和笔记
      if (newCats.length > 0) setCategories(prev => [...prev, ...newCats]);
      if (newNotes.length > 0) setNotes(prev => [...newNotes, ...prev]);

      const catMsg = newCats.length > 0 ? ` ${newCats.length} 个新目录` : '';
      showToast(`✅ 扫描完成：导入 ${newNotes.length} 个文件${catMsg}`);
    } catch (e) {
      showToast(`❌ 扫描失败: ${e?.message || e}`, true);
    }
  };

  // 删除笔记 → 移入回收站
  const handleDeleteNote = async (note) => {
    if (isTauri) {
      const srcPath = generatePath(note.categoryId, note.title, note.format, categories, workspacePath);
      const trashDir = `${workspacePath}\\.trash`;
      const trashPath = `${trashDir}\\${note.title}_${Date.now()}.${note.format}`;
      try {
        await invoke('create_local_dir', { path: trashDir });
        await invoke('rename_local_item', { oldPath: srcPath, newPath: trashPath });
      } catch (e) { /* 文件可能不存在 */ }
    }
    setNotes(prev => prev.filter(n => n.id !== note.id));
    setRecentIds(prev => prev.filter(id => id !== note.id));
    // 清理延迟同步定时器，跳过保存（文件已移入回收站）
    if (contentSyncId.current) { clearTimeout(contentSyncId.current); contentSyncId.current = null; }
    handleCloseTab(null, note.id, true);
    showToast("🗑️ 已移入回收站 (.trash)");
  };

  // 删除目录（需非空检测）
  const handleDeleteCategory = (cat) => {
    const hasChildren = categories.some(c => c.parentId === cat.id);
    const hasNotes = notes.some(n => n.categoryId === cat.id);
    if (hasChildren || hasNotes) { showToast("⚠️ 目录非空，无法删除（请先移除内部文件与子目录）", true); return; }
    setCategories(categories.filter(c => c.id !== cat.id));
    if (activeCategoryId === cat.id) setActiveCategoryId(null);
    showToast("✅ 空目录已删除");
  };

  // 源码模式下的格式插入：直接基于 action 参数，避免依赖异步 state
  const insertSourceFormat = (action, upgradeToMd = false) => {
    if (!activeNote) return;
    const textarea = document.getElementById('note-editor-textarea');
    const start = textarea ? textarea.selectionStart : (activeNote.content || '').length;
    const end = textarea ? textarea.selectionEnd : start;
    const text = activeNote.content || '';
    const selection = text.substring(start, end);
    let prefix = '', suffix = '', defaultText = '文本';
    switch (action) {
      case 'bold': prefix = '**'; suffix = '**'; break;
      case 'italic': prefix = '*'; suffix = '*'; break;
      case 'h1': prefix = '# '; defaultText = '一级标题'; break;
      case 'h2': prefix = '## '; defaultText = '二级标题'; break;
      case 'h3':
      case 'heading': prefix = '### '; defaultText = '三级标题'; break;
      case 'list': prefix = '\n- '; defaultText = '列表项'; suffix = '\n- 列表项2\n- 列表项3\n'; break;
      case 'quote': prefix = '\n> '; defaultText = '引用内容'; suffix = '\n'; break;
      case 'todo': { 
        const now = new Date(); const pad = n=>n.toString().padStart(2,'0');
        prefix = '\n- [ ] '; defaultText = `待办事项 [创建 ${pad(now.getHours())}:${pad(now.getMinutes())}]`; suffix = '\n'; break;
      }
      case 'todoTemplate': {
        const now = new Date();
        const pad = n=>n.toString().padStart(2,'0');
        const timeStr = `[创建 ${pad(now.getHours())}:${pad(now.getMinutes())}]`;
        prefix = `\n\n## 📅 ${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())} 待办\n- [ ]`;
        defaultText = `高优先级任务 ${timeStr}`; suffix = `\n- [ ] 常规任务 ${timeStr}\n`; break;
      }
      case 'timestamp': {
        const now = new Date(); const pad2 = n=>n.toString().padStart(2,'0');
        prefix = `${now.getFullYear()}-${pad2(now.getMonth()+1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())} `;
        defaultText = ''; break;
      }
      case 'table': prefix = '\n| 标题1 | 标题2 |\n|---|---|\n| 内容 | 内容 |\n'; defaultText = ''; break;
      case 'link': prefix = '[['; suffix = ']]'; defaultText = '笔记标题'; break;
      default: return;
    }
    const insertedCore = selection || defaultText;
    const newText = text.substring(0, start) + prefix + insertedCore + suffix + text.substring(end);
    if (upgradeToMd) {
      updateActiveNote({ format: 'md', content: newText });
    } else {
      updateActiveNote({ content: newText });
    }
    setTimeout(() => {
      const ta = document.getElementById('note-editor-textarea');
      if (ta) { ta.focus(); const cursorStart = start + prefix.length; ta.setSelectionRange(cursorStart, cursorStart + insertedCore.length); }
    }, 50);
  };

  const executeUpgradeToMd = () => {
    const action = pendingAction;
    setUpgradeModalOpen(false); setPendingAction(null);
    if (action && action !== 'color') {
      insertSourceFormat(action, true);
    } else {
      // 纯格式升级（含 color 动作：升级后用户在视觉模式下选颜色即可）
      updateActiveNote({ format: 'md' });
    }
    // 转换完成后自动进入视觉模式
    setTimeout(() => {
      if (visualEditorRef.current) visualEditorRef.current.removeAttribute('data-note-id');
      setShowVisualMode(true);
    }, 80);
  };

  const handleToolbarAction = (action, extraValue = null) => {
    if (!activeNote) return;
    // 视觉模式（仅 md）：直接 execCommand，不立即 setNotes，避免 React 重渲染清空 contentEditable
    if (showVisualMode && activeNote.format === 'md') {
      visualEditorRef.current?.focus();
      // 确保有选区在 editor 内
      try {
        const sel = window.getSelection();
        if (!sel.rangeCount || (visualEditorRef.current && !visualEditorRef.current.contains(sel.anchorNode))) {
          const range = document.createRange();
          range.selectNodeContents(visualEditorRef.current);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      } catch {}
      switch(action) {
        case 'bold': {
          document.execCommand('bold', false, null);
          break;
        }
        case 'italic': {
          document.execCommand('italic', false, null);
          break;
        }
        case 'underline': document.execCommand('underline', false, null); break;
        case 'color':
          if (extraValue) {
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed) {
              // 无选区：设置输入颜色持续生效
              document.execCommand('foreColor', false, extraValue);
            } else {
              // 有选区：着色后光标移到末尾，重置为黑色
              document.execCommand('foreColor', false, extraValue);
              const range = sel.getRangeAt(0);
              range.collapse(false);
              sel.removeAllRanges(); sel.addRange(range);
              document.execCommand('foreColor', false, '#111827');
            }
          }
          break;
        case 'h1': document.execCommand('formatBlock', false, 'H1'); break;
        case 'h2': document.execCommand('formatBlock', false, 'H2'); break;
        case 'h3':
        case 'heading': document.execCommand('formatBlock', false, 'H3'); break;
        case 'list': document.execCommand('insertUnorderedList', false, null); break;
        case 'quote': document.execCommand('formatBlock', false, 'BLOCKQUOTE'); break;
        case 'todo': { 
          const now = new Date(); const pad = n=>n.toString().padStart(2,'0');
          document.execCommand('insertHTML', false, `<ul><li style="list-style:none;"><input type="checkbox" style="margin-right:8px;"/> 待办事项 [创建 ${pad(now.getHours())}:${pad(now.getMinutes())}]</li></ul>`); break;
        }
        case 'todoTemplate': {
          const now = new Date();
          const pad = n=>n.toString().padStart(2,'0');
          const timeStr = `[创建 ${pad(now.getHours())}:${pad(now.getMinutes())}]`;
          const dateStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} `;
          document.execCommand('insertHTML', false, `<br/><br/><h2>📅 ${dateStr} 待办</h2><ul><li style="list-style:none;"><input type="checkbox" style="margin-right:8px;"/> 高优先级任务 ${timeStr}</li><li style="list-style:none;"><input type="checkbox" style="margin-right:8px;"/> 常规任务 ${timeStr}</li></ul><br/>`);
          break;
        }
        case 'timestamp': {
          const now = new Date();
          const pad = n=>n.toString().padStart(2,'0');
          const ts = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
          document.execCommand('insertText', false, ts + ' ');
          break;
        }
        case 'table': document.execCommand('insertHTML', false, '<table border="1" style="width:100%;border-collapse:collapse;margin:12px 0;"><tr><td>单元格</td><td>单元格</td></tr><tr><td>单元格</td><td>单元格</td></tr></table><br/>'); break;
        case 'link': { const url = prompt('请输入双向链接标题'); if (url) document.execCommand('insertHTML', false, `<span class="wiki-link text-blue-600" data-title="${url}">[[${url}]]</span>&nbsp;`); break; }
        default: break;
      }
      // 防抖同步到 state
      if (contentSyncId.current) clearTimeout(contentSyncId.current);
      const expectedId = activeNoteIdRef.current;
      contentSyncId.current = setTimeout(() => {
        if (visualEditorRef.current && visualEditorRef.current.getAttribute('data-note-id') === expectedId) {
          updateActiveNote({ content: syncCheckboxesAndMarkdown(visualEditorRef.current) });
        }
      }, 600);
      return;
    }
    // 源码模式 + txt：弹升级确认
    if (activeNote.format === 'txt') { setPendingAction(action); setUpgradeModalOpen(true); return; }
    // 源码模式 + md：直接插入
    insertSourceFormat(action, false);
  };

  const toggleVisualMode = (toVisual) => {
    if (!activeNoteId) return;
    if (!toVisual && visualEditorRef.current) {
      // 保存当前可视内容为 markdown，同时存入 ref 确保切换后 textarea 读到最新内容
      const mdContent = syncCheckboxesAndMarkdown(visualEditorRef.current);
      pendingSourceContentRef.current = mdContent;
      updateActiveNote({ content: mdContent });
    }
    if (toVisual && visualEditorRef.current) {
      // 清除 ref 残留
      pendingSourceContentRef.current = null;
      // 强制清除 data-note-id，确保切换回视觉时重新渲染最新 markdown
      visualEditorRef.current.removeAttribute('data-note-id');
    }
    setShowVisualMode(toVisual);
  };

  const handleScreenshot = async () => {
    if (!isTauri) { showToast("⚠️ 仅 Tauri 桌面端支持截图", true); return; }
    try {
      showToast("📸 截图完成后将自动粘贴...");
      invoke('start_screenshot').catch(e => showToast("❌ 截图失败: " + (e?.message||e), true));
      // 窗口重新获焦后自动读取剪贴板图片粘贴
      const onFocus = async () => {
        window.removeEventListener('focus', onFocus);
        try {
          if (!navigator.clipboard?.read) return;
          const items = await navigator.clipboard.read();
          for (const item of items) {
            const imgType = item.types.find(t => t.startsWith('image/'));
            if (!imgType) continue;
            const blob = await item.getType(imgType);
            const buffer = await blob.arrayBuffer();
            const bytes = Array.from(new Uint8Array(buffer));
            const fileName = `img_${Date.now()}.png`;
            const imgPath = `${workspacePath}\\.assets\\${fileName}`;
            await invoke('save_raw_file', { path: imgPath, bytes });
            const altText = '截图';
            if (showVisualMode && visualEditorRef.current) {
              visualEditorRef.current.focus();
              document.execCommand('insertHTML', false, `<img src="${imgPath}" data-path="${imgPath}" alt="${altText}" style="max-width:100%;border-radius:8px;border:1px solid #ddd;margin:12px 0;" class="previewable-img" title="单击编辑尺寸 · 双击放大" onerror="window.loadLocalImage(this.getAttribute('data-path'), this)"/>`);
              updateActiveNote({content: syncCheckboxesAndMarkdown(visualEditorRef.current)});
            } else {
              const textarea = document.getElementById('note-editor-textarea');
              const mdImage = `\n![${altText}](${imgPath})\n`;
              if (textarea) { const s = textarea.selectionStart; updateActiveNote({content: textarea.value.substring(0, s) + mdImage + textarea.value.substring(textarea.selectionEnd)}); }
              else if (activeNoteId) setNotes(prev => prev.map(n => n.id === activeNoteId ? {...n, content: n.content + mdImage, updatedAt: new Date().toISOString()} : n));
            }
            showToast("✅ 截图已自动插入");
            return;
          }
        } catch (e) { console.log('[screenshot] auto-paste failed', e); }
      };
      window.addEventListener('focus', onFocus);
    } catch (e) { showToast("❌ 截图唤起失败", true); }
  };

  const handleExtractPlainText = () => {
    if (!activeNote) return;
    const raw = showVisualMode && visualEditorRef.current ? visualEditorRef.current.innerText : stripMarkdown(activeNote.content);
    setTempTextContent(raw.replace(/\n{3,}/g, '\n\n').trim());
    setShowTempTextModal(true);
  };

  const handleConvertToTxtPermanent = () => {
    if (!activeNote) return;
    requestConfirm("转换为TXT将丢失所有排版，确认继续？", () => {
      updateActiveNote({ format: 'txt', content: stripMarkdown(activeNote.content) });
      setShowVisualMode(false);
    });
  };

  const handleMoveConfirm = async () => {
    const targetId = moveDialog.targetId === 'root' ? null : moveDialog.targetId;
    if (moveDialog.type === 'folder') {
      const item = moveDialog.item;
      if (item.id === targetId) return setMoveDialog(null);
      const childrenIds = getSubCategoryIds(item.id, categories);
      if (childrenIds.includes(targetId)) { showToast("⚠️ 不能移入子目录（防死锁）", true); return; }
      if (categories.some(c => c.parentId === targetId && c.name === item.name)) { showToast("⚠️ 同名目录拦截", true); return; }
      setCategories(categories.map(c => c.id === item.id ? { ...c, parentId: targetId } : c)); showToast("✅ 已移动");
    } else {
      const item = moveDialog.item;
      if (notes.some(n => n.categoryId === targetId && n.title === item.title)) { showToast("⚠️ 同名文件拦截", true); return; }
      setNotes(notes.map(n => n.id === item.id ? { ...n, categoryId: targetId } : n)); showToast("✅ 已移动");
    }
    setMoveDialog(null);
  };

  const handleTOCClick = (headingText) => {
    if (showVisualMode && visualEditorRef.current) {
      // 遍历所有标题元素，按文本内容匹配
      const headings = visualEditorRef.current.querySelectorAll('h1,h2,h3,h4,h5,h6');
      for (const el of headings) {
        if (el.textContent.trim() === headingText) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          break;
        }
      }
    } else {
      const textarea = document.getElementById('note-editor-textarea');
      if (textarea) {
        const idx = textarea.value.indexOf(headingText);
        if (idx !== -1) { textarea.focus(); textarea.setSelectionRange(idx, idx + headingText.length); textarea.scrollTop = textarea.scrollHeight * (idx / textarea.value.length); }
      }
    }
  };

  const handleSaveSettings = () => {
    localStorage.setItem('supertxt_workspace', tempWorkspacePath);
    setWorkspacePath(tempWorkspacePath);
    setIsDataLoaded(false);
    setShowSettingsModal(false);
    showToast("✅ 工作区路径已更新，重新加载中...");
  };

  // 计算当前激活笔记的父目录链（用于高亮显示）
  const ancestorCategoryIds = useMemo(() => {
    const set = new Set();
    if (!activeNote || !activeNote.categoryId) return set;
    let cur = activeNote.categoryId;
    while (cur) {
      set.add(cur);
      const c = categories.find(x => x.id === cur);
      if (!c) break;
      cur = c.parentId;
    }
    return set;
  }, [activeNote, categories]);

  const renderCategoryTree = (parentId = null, level = 0) => {
    const childrenCats = categories.filter(c => c.parentId === parentId);
    const directNotes = notes.filter(n => n.categoryId === parentId);
    return (
      <ul className="space-y-0.5">
        {childrenCats.map(cat => {
          const hasChildren = categories.some(c => c.parentId === cat.id) || notes.some(n=>n.categoryId === cat.id);
          const isRootFolder = parentId === null;
          const hasDirectFiles = notes.some(n => n.categoryId === cat.id);
          const hasSubDirs = categories.some(c => c.parentId === cat.id);
          const count = getCategoryNoteCount(cat.id);
          const isSelected = activeCategoryId === cat.id;
          const isAncestor = ancestorCategoryIds.has(cat.id);
          // 图标颜色：统一逻辑（根目录与子目录一致）
          const iconColor = hasDirectFiles ? 'text-emerald-500' : hasSubDirs ? 'text-amber-500' : 'text-gray-400';
          // 选中高亮颜色
          const selectedBg = hasDirectFiles ? 'bg-emerald-400' : hasSubDirs ? 'bg-amber-400' : 'bg-blue-400';
          return (
            <li key={cat.id} className="relative">
              <div style={{ paddingLeft: `${level * 16 + 8}px` }}>
              <div className={`group flex items-center py-1.5 pr-2 rounded-lg cursor-pointer text-sm transition-all ${isSelected ? `${selectedBg} text-white font-semibold shadow-md` : isAncestor ? `bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 font-medium` : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/50'}`}
                onClick={() => { setActiveCategoryId(cat.id); }}
                onContextMenu={(e) => { e.preventDefault(); setContextMenu({ visible:true, x:e.clientX, y:e.clientY, type:'folder', item: cat}); }}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('ring-2','ring-blue-400'); }}
                onDragLeave={(e) => { e.currentTarget.classList.remove('ring-2','ring-blue-400'); }}
                onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('ring-2','ring-blue-400'); const noteId = e.dataTransfer.getData('text/note-id'); if (noteId) { const dragNote = notes.find(n=>n.id===noteId); if(dragNote && dragNote.categoryId !== cat.id) { if(isTauri) { const oldPath = generatePath(dragNote.categoryId, dragNote.title, dragNote.format, categories, workspacePath); const newPath = generatePath(cat.id, dragNote.title, dragNote.format, categories, workspacePath); invoke('rename_local_item',{oldPath,newPath}).catch(()=>{}); } setNotes(prev => prev.map(n => n.id === noteId ? { ...n, categoryId: cat.id } : n)); showToast("✅ 已移入 " + cat.name); } } }}>
                <div className="w-5 h-5 flex items-center justify-center shrink-0 text-gray-400 hover:text-gray-600 rounded" onClick={(e) => {e.stopPropagation(); if(hasChildren) { setCategories(categories.map(c => c.id === cat.id ? { ...c, expanded: !c.expanded } : c)); } setActiveCategoryId(cat.id);}}>
                  {hasChildren ? (cat.expanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>) : <div className="w-1.5 h-1.5 rounded-full bg-gray-300"></div>}
                </div>
                <div className={`w-5 flex items-center justify-center shrink-0 ${isSelected ? 'text-white' : iconColor}`}>
                  {isRootFolder ? <FolderOpen size={14} fill="currentColor" fillOpacity={0.25}/> : <Folder size={14} fill="currentColor" fillOpacity={0.25}/>}
                </div>
                {renamingCategoryId === cat.id ? (
                <input autoFocus value={renameCategoryValue} onChange={e => setRenameCategoryValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleFinishRename(); if (e.key === 'Escape') setRenamingCategoryId(null); }} onBlur={handleFinishRename} className="flex-1 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border rounded px-1 py-0 outline-none focus:border-blue-400" />
              ) : (
                <span className="flex-1 truncate leading-none">{cat.name}</span>
              )}
                <span className={`text-[10px] ml-1 font-mono px-1.5 rounded-full shrink-0 ${isSelected ? 'bg-white/25 text-white' : 'bg-gray-200/60 dark:bg-gray-700 text-gray-400'}`}>{count}</span>
                <button onClick={(e) => { e.stopPropagation(); setCreatingCategory(cat.id); }} className={`p-0.5 ml-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${isSelected?'text-white/70 hover:text-white hover:bg-white/20':'text-gray-300 hover:text-blue-600 hover:bg-blue-50'}`} title="新建子目录"><Plus size={11}/></button>
              </div>
              </div>
              {/* 新建子目录输入框：显示在该目录下面 */}
              {creatingCategory === cat.id && (
                <div className="flex items-center py-1.5" style={{ paddingLeft: `${(level+1) * 16 + 16}px` }}>
                  <input autoFocus value={newCategoryName} onChange={e=>setNewCategoryName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')handleCreateCategory(creatingCategory);if(e.key==='Escape')setCreatingCategory(false);}} onBlur={()=>handleCreateCategory(creatingCategory)} placeholder="目录名称" className="flex-1 text-sm bg-white dark:bg-gray-700 border rounded px-2 py-1 outline-none focus:border-blue-400"/>
                </div>
              )}
              {cat.expanded && renderCategoryTree(cat.id, level + 1)}
            </li>
          );
        })}
        {directNotes.map(n => (
          <li key={`file-${n.id}`}>
            <div style={{ paddingLeft: `${level * 16 + 8}px` }}>
            <div onClick={() => handleOpenNote(n.id)} onContextMenu={(e)=>{e.preventDefault(); setContextMenu({visible:true, x:e.clientX, y:e.clientY, type:'note', item:n})}}
              className={`flex items-center px-1.5 py-1.5 rounded-md cursor-pointer text-[12.5px] transition-colors ${activeNoteId === n.id ? 'text-blue-700 font-semibold bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300' : 'text-gray-500 hover:text-gray-800'}`}>
              <div className="w-5 shrink-0"></div>
              <div className="w-5 flex items-center justify-center shrink-0"><FileText size={13} className="opacity-60"/></div>
              <span className="truncate leading-none">{n.title || '未命名'}</span>
            </div>
            </div>
          </li>
        ))}
      </ul>
    );
  };

  // 重命名目录
  const handleFinishRename = () => {
    if (!renamingCategoryId) return;
    const trimmed = renameCategoryValue.trim();
    if (!trimmed) { setRenamingCategoryId(null); return; }
    const cat = categories.find(c => c.id === renamingCategoryId);
    if (!cat) { setRenamingCategoryId(null); return; }
    if (categories.some(c => c.id !== renamingCategoryId && c.parentId === cat.parentId && c.name === trimmed)) {
      showToast('⚠️ 同名目录已存在', true);
      setRenamingCategoryId(null);
      return;
    }
    setCategories(prev => prev.map(c => c.id === renamingCategoryId ? { ...c, name: trimmed } : c));
    setRenamingCategoryId(null);
    showToast('✅ 目录已重命名');
  };
  const handleStartRename = (cat) => {
    setRenamingCategoryId(cat.id);
    setRenameCategoryValue(cat.name);
    setContextMenu(null);
  };

  // 新建子目录输入框处理
  const handleCreateCategory = (parentId) => {
    if (!newCategoryName.trim()) { setCreatingCategory(false); return; }
    const realParent = parentId === 'root' ? null : parentId;
    if (categories.some(c => c.parentId === realParent && c.name === newCategoryName.trim())) { showToast("⚠️ 同名目录已存在", true); setCreatingCategory(false); return; }
    setCategories([...categories, { id: `c${Date.now()}`, name: newCategoryName.trim(), parentId: realParent, expanded: false }]);
    setNewCategoryName(''); setCreatingCategory(false);
  };

  return (
    <div className={`flex h-screen w-full font-sans transition-colors duration-200 relative ${theme === 'dark' ? 'dark bg-[#0a0a0a] text-gray-100' : 'bg-white text-gray-900'}`}>
      {/* Toast */}
      {toastMessage && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in duration-300">
          <div className={`px-5 py-2.5 rounded-full shadow-2xl text-sm font-medium flex items-center ${toastMessage.isError ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-gray-900 text-white'}`}>{toastMessage.text}</div>
        </div>
      )}
      {/* 全屏看图 */}
      {fullscreenImage && (
        <div className="fixed inset-0 bg-black/95 z-[500] flex items-center justify-center cursor-zoom-out" onClick={() => setFullscreenImage(null)}>
          <img src={fullscreenImage} alt="全屏预览" className="max-w-[95%] max-h-[95vh] object-contain shadow-2xl rounded" />
        </div>
      )}
      {/* 右键菜单 */}
      {contextMenu && (
        <div className="fixed inset-0 z-[150]" onClick={() => setContextMenu(null)} onContextMenu={(e)=>{e.preventDefault();setContextMenu(null)}}>
          <div className="absolute bg-white dark:bg-gray-800 shadow-xl border border-gray-200 dark:border-gray-700 rounded-lg py-1.5 w-44 text-sm overflow-hidden" style={{ top: contextMenu.y, left: contextMenu.x }}>
            {contextMenu.type === 'folder' ? (<>
              <button onClick={() => {setCreatingCategory(contextMenu.item.id);setContextMenu(null);}} className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"><Plus size={14} className="mr-2 text-blue-500"/>新建子目录</button>
              <button onClick={() => {setMoveDialog({type:'folder',item:contextMenu.item,targetId:'root'});setContextMenu(null);}} className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"><CornerRightUp size={14} className="mr-2 text-green-500"/>移动该目录</button>
              <button onClick={() => {handleStartRename(contextMenu.item);}} className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"><span className="mr-2 text-amber-500 w-[14px] text-center">✎</span>重命名</button>
              <div className="h-px bg-gray-200 dark:bg-gray-700 my-1"></div>
              <button onClick={() => {handleDeleteCategory(contextMenu.item);setContextMenu(null);}} className="w-full text-left px-4 py-2 hover:bg-red-50 text-red-600 flex items-center"><Trash2 size={14} className="mr-2"/>删除目录</button>
            </>) : contextMenu.type === 'tab' ? (<>
              <button onClick={() => {handleCloseTab(null,contextMenu.item.id);setContextMenu(null);}} className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"><X size={14} className="mr-2 text-gray-500"/>关闭</button>
              <button onClick={() => {const others=openTabs.filter(t=>t!==contextMenu.item.id);setOpenTabs([contextMenu.item.id]);setActiveNoteId(contextMenu.item.id);setContextMenu(null);}} className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"><X size={14} className="mr-2 text-orange-500"/>关闭其它</button>
              <button onClick={() => {setOpenTabs([]);setActiveNoteId(null);setContextMenu(null);}} className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"><X size={14} className="mr-2 text-red-500"/>关闭全部</button>
            </>) : (<>
              <button onClick={() => {setMoveDialog({type:'note',item:contextMenu.item,targetId:'root'});setContextMenu(null);}} className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"><CornerRightUp size={14} className="mr-2 text-green-500"/>移动笔记</button>
              <button onClick={() => {handleOpenNote(contextMenu.item.id); handleConvertToTxtPermanent(); setContextMenu(null);}} className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"><ArrowRightLeft size={14} className="mr-2 text-purple-500"/>格式转换</button>
              <div className="h-px bg-gray-200 dark:bg-gray-700 my-1"></div>
              <button onClick={() => {requestConfirm("确认删除？笔记将移入回收站(.trash)。",()=>handleDeleteNote(contextMenu.item)); setContextMenu(null);}} className="w-full text-left px-4 py-2 hover:bg-red-50 text-red-600 flex items-center"><Trash2 size={14} className="mr-2"/>删除笔记</button>
            </>)}
          </div>
        </div>
      )}
      {/* 弹窗区 */}
      {moveDialog && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[200]">
          <div className="bg-white dark:bg-gray-800 w-[400px] flex flex-col rounded-xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-700">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between bg-gray-50 dark:bg-gray-900"><h3 className="font-semibold text-sm">选择目标位置</h3><button onClick={()=>setMoveDialog(null)}><X size={16}/></button></div>
            <div className="p-6">
              <select value={moveDialog.targetId||'root'} onChange={e=>setMoveDialog({...moveDialog, targetId: e.target.value})} className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600">
                <option value="root">📁 根目录 (最外层)</option>
                {(() => {
                  // 移动目录时：排除目录自身及其所有子目录
                  let excludeIds = new Set();
                  if (moveDialog.type === 'folder') {
                    excludeIds.add(moveDialog.item.id);
                    getSubCategoryIds(moveDialog.item.id, categories).forEach(id => excludeIds.add(id));
                  }
                  return categories.filter(c => !excludeIds.has(c.id)).map(c =>
                    <option key={c.id} value={c.id}>📁 {getCategoryFullPath(c.id, categories)}</option>
                  );
                })()}
              </select>
            </div>
            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 flex justify-end space-x-3">
              <button onClick={()=>setMoveDialog(null)} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-md text-sm">取消</button>
              <button onClick={handleMoveConfirm} className="px-5 py-2 bg-blue-600 text-white rounded-md text-sm">确认移动</button>
            </div>
          </div>
        </div>
      )}
      {confirmDialog && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[200]">
          <div className="bg-white dark:bg-gray-800 w-[360px] flex flex-col rounded-xl shadow-2xl p-6">
            <h3 className="font-bold mb-2">安全确认</h3><p className="text-sm mb-6 text-gray-600 dark:text-gray-300">{confirmDialog.message}</p>
            <div className="flex justify-end space-x-3"><button onClick={()=>setConfirmDialog(null)} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-md text-sm">取消</button><button onClick={()=>{confirmDialog.onConfirm();setConfirmDialog(null);}} className="px-4 py-2 bg-red-600 text-white rounded-md text-sm">确认执行</button></div>
          </div>
        </div>
      )}
      {upgradeModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[200]">
          <div className="bg-white dark:bg-gray-800 w-[400px] flex flex-col rounded-xl p-6">
            <h3 className="font-bold mb-2">确认格式转换</h3><p className="text-sm mb-6 text-gray-600 dark:text-gray-300">纯净TXT无法保存排版，需转为 Markdown 格式。</p>
            <div className="flex justify-end space-x-3">
              <button onClick={()=>{setUpgradeModalOpen(false);setPendingAction(null);}} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-md text-sm">取消</button>
              <button onClick={executeUpgradeToMd} className="px-5 py-2 bg-blue-600 text-white rounded-md text-sm">同意转换</button>
            </div>
          </div>
        </div>
      )}
      {/* 设置弹窗 */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[200]">
          <div className="bg-white dark:bg-gray-800 w-[450px] flex flex-col rounded-xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-700">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between bg-gray-50 dark:bg-gray-900"><h3 className="font-semibold text-sm">⚙️ 工作区设置</h3><button onClick={()=>setShowSettingsModal(false)}><X size={16}/></button></div>
            <div className="p-6 space-y-4">
              <label className="block text-xs font-medium text-gray-500 mb-1">存储根目录路径</label>
              <input value={tempWorkspacePath} onChange={e=>setTempWorkspacePath(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm font-mono dark:bg-gray-700 dark:border-gray-600" placeholder="D:\MyNotes" />
              <p className="text-[11px] text-gray-400">修改后软件将热重载，从新路径加载数据</p>
            </div>
            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 flex justify-end space-x-3">
              <button onClick={()=>setShowSettingsModal(false)} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-md text-sm">取消</button>
              <button onClick={handleSaveSettings} className="px-5 py-2 bg-blue-600 text-white rounded-md text-sm">保存并重载</button>
            </div>
          </div>
        </div>
      )}
      {/* 提纯 Modal */}
      {showTempTextModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[200]">
          <div className="bg-white dark:bg-gray-800 w-[550px] max-h-[80vh] flex flex-col rounded-xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-700">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between bg-gray-50 dark:bg-gray-900"><h3 className="font-semibold text-sm">📋 提纯文本（已剥离排版）</h3><button onClick={()=>setShowTempTextModal(false)}><X size={16}/></button></div>
            <div className="flex-1 overflow-y-auto p-6"><pre className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700 dark:text-gray-200 font-sans">{tempTextContent}</pre></div>
            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 flex justify-end space-x-3">
              <button onClick={()=>{navigator.clipboard.writeText(tempTextContent); showToast("✅ 已复制到剪贴板");}} className="px-5 py-2 bg-blue-600 text-white rounded-md text-sm flex items-center"><Copy size={14} className="mr-1.5"/>一键复制</button>
            </div>
          </div>
        </div>
      )}
      {/* 最近访问弹窗 */}
      {showRecentModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[200]">
          <div className="bg-white dark:bg-gray-800 w-[550px] max-h-[80vh] flex flex-col rounded-xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-700">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between bg-gray-50 dark:bg-gray-900"><h3 className="font-semibold text-sm">🕐 全部访问历史</h3><button onClick={()=>setShowRecentModal(false)}><X size={16}/></button></div>
            <div className="flex-1 overflow-y-auto p-4">
              {Array.from(new Set(recentIds)).slice((recentPage-1)*ITEMS_PER_PAGE, recentPage*ITEMS_PER_PAGE).map(id => {
                const n = notes.find(x=>x.id===id); if(!n) return null;
                return (<div key={id} onClick={()=>{handleOpenNote(id);setShowRecentModal(false);}} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg cursor-pointer border-b border-gray-100 dark:border-gray-700 last:border-none">
                  <div className="flex-1 min-w-0"><p className="font-medium text-sm truncate">{n.title}</p><p className="text-[11px] text-gray-400 mt-0.5">{formatDate(n.updatedAt)}</p></div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${n.format==='md'?'bg-purple-100 text-purple-600':'bg-gray-100 text-gray-500'}`}>{(n.format||'txt').toUpperCase()}</span>
                </div>);
              })}
            </div>
            <div className="px-6 py-3 bg-gray-50 dark:bg-gray-900 flex justify-between items-center text-xs text-gray-500">
              <span>共 {Array.from(new Set(recentIds)).filter(id => notes.some(n => n.id === id)).length} 条记录</span>
              <div className="flex space-x-2">
                <button disabled={recentPage<=1} onClick={()=>setRecentPage(p=>p-1)} className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded disabled:opacity-30">上一页</button>
                <button disabled={recentPage*ITEMS_PER_PAGE>=recentIds.length} onClick={()=>setRecentPage(p=>p+1)} className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded disabled:opacity-30">下一页</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== 1. 左侧边栏 ===== */}
      <div style={{ width: `${sidebarWidth}px`, minWidth:'160px' }} className={`border-r flex flex-col shrink-0 relative transition-[width] ${zenMode?'w-0 hidden':''} ${theme==='dark'?'bg-gray-900 border-gray-700':'bg-[#f9fafb] border-gray-200'}`}>
        <div className="p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center font-bold text-base"><div className="w-5 h-5 bg-blue-600 rounded text-white flex items-center justify-center mr-2 text-xs">S</div> SuperTxt</div>
          <button onClick={()=>setTheme(theme==='dark'?'light':'dark')} className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500">
            {theme==='dark'?<Sun size={14}/>:<Moon size={14}/>}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 px-2 py-2 space-y-4 custom-scrollbar pb-16">
          <div onClick={()=>setActiveCategoryId(null)}
            onDragOver={(e)=>{e.preventDefault();e.currentTarget.classList.add('ring-2','ring-blue-400');}}
            onDragLeave={(e)=>{e.currentTarget.classList.remove('ring-2','ring-blue-400');}}
            onDrop={(e)=>{e.preventDefault();e.currentTarget.classList.remove('ring-2','ring-blue-400'); const noteId=e.dataTransfer.getData('text/note-id'); if(noteId){ const dragNote=notes.find(n=>n.id===noteId); if(dragNote && dragNote.categoryId !== null) { if(isTauri) { const oldPath=generatePath(dragNote.categoryId,dragNote.title,dragNote.format,categories,workspacePath); const newPath=generatePath(null,dragNote.title,dragNote.format,categories,workspacePath); invoke('rename_local_item',{oldPath,newPath}).catch(()=>{}); } setNotes(prev=>prev.map(n=>n.id===noteId?{...n,categoryId:null}:n));showToast("✅ 已移至根目录"); } }}}
            className={`flex items-center px-3 py-2 rounded-lg cursor-pointer text-sm font-medium transition-colors ${activeCategoryId===null?'bg-blue-600 text-white':'text-gray-700 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-700'}`}>
            <Library size={16} className="mr-2.5"/>全部文件
            <span className={`ml-auto text-[10px] px-1.5 rounded-full font-mono ${activeCategoryId===null?'bg-white/20 text-white':'bg-gray-200/60 text-gray-500'}`}>{notes.length}</span>
          </div>
          <div onClick={()=>setActiveCategoryId('__recent__')} className={`flex items-center px-3 py-2 rounded-lg cursor-pointer text-sm font-medium transition-colors ${activeCategoryId==='__recent__'?'bg-blue-600 text-white':'text-gray-700 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-700'}`}><Clock size={16} className="mr-2.5"/>最近访问
            <span className={`ml-auto text-[10px] px-1.5 rounded-full font-mono ${activeCategoryId==='__recent__'?'bg-white/20 text-white':'bg-gray-200/60 text-gray-500'}`}>{Array.from(new Set(recentIds)).filter(id => notes.some(n => n.id === id)).length}</span>
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-400 dark:text-gray-500 mb-2 flex justify-between items-center px-1">
              <span>文件夹目录</span>
              <div className="flex items-center space-x-1">
                {expandedCount > 3 && (
                  <button onClick={()=>setCategories(prev=>prev.map(c=>({...c, expanded:false})))} className="hover:text-blue-500 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700" title="一键折叠所有展开目录">折叠({expandedCount})</button>
                )}
                <button onClick={()=>setCreatingCategory('root')} className="hover:text-blue-500" title="新建顶层目录"><FolderPlus size={14}/></button>
                <button onClick={handleScanWorkspace} className="hover:text-green-500" title="扫描工作空间中的文件"><RefreshCw size={14}/></button>
              </div>
            </div>
            {renderCategoryTree(null, 0)}
            {/* 新建顶层目录输入框 */}
            {creatingCategory === 'root' && (
              <div className="flex items-center px-3 py-1.5 mt-1">
                <input autoFocus value={newCategoryName} onChange={e=>setNewCategoryName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')handleCreateCategory(creatingCategory);if(e.key==='Escape')setCreatingCategory(false);}} onBlur={()=>handleCreateCategory(creatingCategory)} placeholder="目录名称" className="flex-1 text-sm bg-white dark:bg-gray-700 border rounded px-2 py-1 outline-none focus:border-blue-400"/>
              </div>
            )}
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-gray-200 dark:border-gray-700 bg-inherit">
          <button onClick={()=>{setTempWorkspacePath(workspacePath);setShowSettingsModal(true);}} className="flex items-center w-full px-3 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-200/60 dark:hover:bg-gray-700"><Settings size={14} className="mr-2"/>工作区设置</button>
        </div>
        {/* 拖拽手柄 */}
        <div className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-400/50 z-10" onMouseDown={()=>{isResizing.current=true;document.body.style.cursor='col-resize';document.body.style.userSelect='none';}}></div>
      </div>

      {/* ===== 2. 中间栏 - 笔记列表 ===== */}
      <div className={`w-72 border-r flex flex-col shrink-0 relative ${zenMode?'w-0 hidden':''} ${theme==='dark'?'bg-gray-900/50 border-gray-700':'bg-[#fcfcfc] border-gray-200'}`}>
        <div className="p-3 border-b border-gray-200 dark:border-gray-700 space-y-3 shrink-0">
          <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/><input type="text" placeholder="搜索标题或内容..." value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} className="w-full pl-8 pr-8 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-md text-sm outline-none"/>{searchQuery && <button onClick={()=>setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-0.5 rounded"><X size={14}/></button>}</div>
          <button onClick={handleCreateNote} disabled={!activeCategoryId || activeCategoryId === '__recent__'} title={!activeCategoryId || activeCategoryId === '__recent__' ? '请先在左侧目录树中选择一个目录' : '新建笔记'} className={`w-full flex items-center justify-center py-1.5 rounded-md text-sm transition-colors ${!activeCategoryId || activeCategoryId === '__recent__' ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}><Plus size={16} className="mr-1"/> 新建笔记</button>
        </div>
        {activeCategoryId && activeCategoryId !== '__recent__' && (
          <div className="px-4 py-2 text-[11px] text-gray-500 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center"><FolderOpen size={12} className="mr-1.5"/>{getCategoryFullPath(activeCategoryId, categories)}</div>
        )}
        <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar note-list-container">
          {filteredNotes.map(note => {
            const preview = stripMarkdown(note.content).substring(0,80);
            return (
            <div key={note.id} draggable onDragStart={(e)=>{e.dataTransfer.setData('text/note-id', note.id); e.dataTransfer.effectAllowed='move'; e.currentTarget.style.opacity='0.5';}} onDragEnd={(e)=>{e.currentTarget.style.opacity='1';}} onClick={()=>handleOpenNote(note.id)} onContextMenu={(e)=>{e.preventDefault();setContextMenu({visible:true,x:e.clientX,y:e.clientY,type:'note',item:note})}}
              className={`p-3 border-b dark:border-gray-700 cursor-pointer ${activeNoteId===note.id?'bg-blue-50/50 dark:bg-blue-900/20 border-l-[3px] border-l-blue-500':'hover:bg-gray-50 dark:hover:bg-gray-800 border-l-[3px] border-l-transparent'}`}>
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-medium text-[13px] truncate flex-1" dangerouslySetInnerHTML={{__html: highlightText(note.title||'未命名笔记', searchQuery)}}/>
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ml-2 shrink-0 ${note.format==='md'?'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300':'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>{(note.format||'txt').toUpperCase()}</span>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2 mb-1.5" dangerouslySetInnerHTML={{__html: highlightText(preview, searchQuery)}}/>
              <div className="flex items-center justify-between text-[10px] text-gray-400">
                {activeCategoryId === '__recent__' ? (<>
                  <span title={`最近访问 ${note.lastAccessedAt||note.updatedAt}`}>访问 {formatDate(note.lastAccessedAt||note.updatedAt)}</span>
                  <span title={`修改于 ${note.updatedAt}`}>修改 {formatDate(note.updatedAt)}</span>
                </>) : (<>
                  <span title={`修改于 ${note.updatedAt}`}>修改 {formatDate(note.updatedAt)}</span>
                  <span title={`创建于 ${note.createdAt}`}>创建 {formatDate(note.createdAt)}</span>
                </>)}
              </div>
            </div>);
          })}
          {filteredNotes.length===0 && <div className="text-center text-gray-400 text-sm py-12">暂无笔记</div>}
        </div>
      </div>

      {/* ===== 3. 右侧主区域 ===== */}
      <div className={`flex-1 flex flex-col min-w-0 relative ${theme==='dark'?'bg-[#0f0f0f]':'bg-white'}`}>
        {/* 标签栏 */}
        {openTabs.length > 0 && (
          <div className={`flex items-center border-b overflow-x-auto select-none pt-2 px-2 gap-1 custom-scrollbar shrink-0 relative ${theme==='dark'?'bg-gray-900 border-gray-700':'bg-[#f4f5f7] border-gray-200'}`}>
            {Array.from(new Set(openTabs)).map(tabId => {
              const tabNote = notes.find(n=>n.id===tabId); if(!tabNote) return null;
              return (<div key={tabId} onClick={()=>setActiveNoteId(tabId)}
                onContextMenu={(e)=>{e.preventDefault(); setContextMenu({visible:true, x:e.clientX, y:e.clientY, type:'tab', item:{id:tabId}});}}
                className={`flex items-center px-3 py-1.5 rounded-t-lg border cursor-pointer min-w-[120px] max-w-[200px] group transition-all ${tabId===activeNoteId?`bg-white dark:bg-gray-800 text-blue-600 relative top-[1px] ${theme==='dark'?'border-gray-700':'border-gray-200'}`:'bg-transparent text-gray-500 border-transparent'}`}>
                <span className="truncate flex-1 text-[11px] font-medium">{tabNote.title}</span><button onClick={(e)=>handleCloseTab(e,tabId)} className="ml-2 p-0.5 opacity-50 hover:opacity-100"><X size={12}/></button>
              </div>);
            })}
          </div>
        )}
        {/* 编辑器 */}
        {activeNote ? (<>
          <div className={`border-b px-4 flex flex-wrap items-center gap-2 py-2 shrink-0 z-10 ${theme==='dark'?'bg-[#0f0f0f] border-gray-700':'bg-white border-gray-200'}`}>
            <div className="flex items-center space-x-2 flex-wrap">
              {activeNote.format==='md' ? (
                <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-md p-0.5 shrink-0">
                  <button onClick={()=>toggleVisualMode(false)} className={`px-2.5 py-1 rounded text-[11px] flex items-center ${!showVisualMode?'bg-white dark:bg-gray-700 shadow-sm':''}`}><Code size={12} className="mr-1"/> 源码</button>
                  <button onClick={()=>toggleVisualMode(true)} className={`px-2.5 py-1 rounded text-[11px] flex items-center ${showVisualMode?'bg-white dark:bg-gray-700 shadow-sm text-blue-600':''}`}><Eye size={12} className="mr-1"/> 视觉</button>
                </div>
              ) : (
                <div className="flex items-center bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-md text-[11px] text-gray-500 shrink-0"><FileText size={12} className="mr-1.5"/> TXT</div>
              )}
              <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 shrink-0"></div>
              <div className="flex items-center flex-wrap gap-0.5">
                <button onMouseDown={(e)=>e.preventDefault()} onClick={()=>handleToolbarAction('bold')} className={`toolbar-btn p-1.5 rounded transition-all active:scale-90 ${activeFormats.bold?'bg-blue-100 text-blue-600 dark:bg-blue-900/40':'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`} title="加粗 (Ctrl+B)"><Bold size={14}/></button>
                <button onMouseDown={(e)=>e.preventDefault()} onClick={()=>handleToolbarAction('italic')} className={`toolbar-btn p-1.5 rounded transition-all active:scale-90 ${activeFormats.italic?'bg-blue-100 text-blue-600 dark:bg-blue-900/40':'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`} title="斜体 (Ctrl+I)"><Italic size={14}/></button>
                <button onMouseDown={(e)=>e.preventDefault()} onClick={()=>handleToolbarAction('quote')} className={`toolbar-btn p-1.5 rounded transition-all active:scale-90 ${activeFormats.quote?'bg-blue-100 text-blue-600 dark:bg-blue-900/40':'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`} title="引用块"><Quote size={14}/></button>
                {(showVisualMode || activeNote.format === 'txt') && (
                  <div className="relative color-picker-container">
                    <button onMouseDown={(e)=>e.preventDefault()} onClick={()=>{
                      // TXT 格式：直接触发升级流程
                      if (activeNote.format === 'txt') { handleToolbarAction('color'); return; }
                      // 打开颜色选择器前保存当前 selection
                      if (visualEditorRef.current) {
                        const sel = window.getSelection();
                        savedSelectionRef.current = (sel && sel.rangeCount > 0) ? sel.getRangeAt(0).cloneRange() : null;
                      }
                      setShowColorPicker(v=>!v);
                    }} className="toolbar-btn p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-all active:scale-90 relative" title="字体颜色">
                      <Palette size={14}/>
                      <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-3 h-[2px] rounded-full" style={{background: activeFormats.currentColor || '#111827'}}></div>
                    </button>
                    {showColorPicker && (
                      <div className="absolute top-full mt-1 left-0 bg-white dark:bg-gray-800 shadow-xl border rounded-lg p-2 z-50 w-[180px]">
                        <div className="grid grid-cols-5 gap-1.5 mb-2">
                          {['#ef4444','#f97316','#f59e0b','#10b981','#06b6d4','#3b82f6','#6366f1','#8b5cf6','#ec4899','#111827'].map(c => (
                            <div key={c} className="w-6 h-6 rounded-md cursor-pointer border border-gray-200 dark:border-gray-600 hover:scale-110 transition-transform flex items-center justify-center" style={{background:c}} title={c}
                              onMouseDown={(e) => {
                                e.preventDefault(); e.stopPropagation();
                                try {
                                  if (!visualEditorRef.current) return;
                                  visualEditorRef.current.focus();
                                  const sel = window.getSelection();
                                  if (savedSelectionRef.current) {
                                    sel.removeAllRanges();
                                    sel.addRange(savedSelectionRef.current);
                                  }
                                  if (sel && !sel.isCollapsed) {
                                    // 选中文字：着色后光标移到末尾，后续输入恢复黑色
                                    document.execCommand('foreColor', false, c);
                                    const range = sel.getRangeAt(0);
                                    range.collapse(false);
                                    sel.removeAllRanges(); sel.addRange(range);
                                    // 重置后续输入颜色为黑色
                                    document.execCommand('foreColor', false, '#111827');
                                  } else {
                                    // 无选区：设置输入颜色，持续生效
                                    document.execCommand('foreColor', false, c);
                                  }
                                  if (contentSyncId.current) clearTimeout(contentSyncId.current);
                                  contentSyncId.current = setTimeout(() => {
                                    if (visualEditorRef.current) updateActiveNote({content: syncCheckboxesAndMarkdown(visualEditorRef.current)});
                                  }, 400);
                                } catch(err) { console.error('color err', err); }
                                setShowColorPicker(false);
                              }}>
                              {c === '#111827' && <span className="text-white text-[8px] font-bold">A</span>}
                            </div>
                          ))}
                        </div>
                        <button onMouseDown={(e) => {
                          e.preventDefault(); e.stopPropagation();
                          try {
                            if (!visualEditorRef.current) return;
                            visualEditorRef.current.focus();
                            const sel = window.getSelection();
                            if (savedSelectionRef.current) { sel.removeAllRanges(); sel.addRange(savedSelectionRef.current); }
                            if (sel && !sel.isCollapsed) {
                              document.execCommand('removeFormat', false, null);
                              document.execCommand('foreColor', false, '#111827');
                            }
                            if (contentSyncId.current) clearTimeout(contentSyncId.current);
                            contentSyncId.current = setTimeout(() => { if (visualEditorRef.current) updateActiveNote({content: syncCheckboxesAndMarkdown(visualEditorRef.current)}); }, 400);
                          } catch {}
                          setShowColorPicker(false);
                        }} className="w-full text-[11px] text-gray-500 hover:text-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded py-1 transition-colors">恢复默认黑色</button>
                      </div>
                    )}
                  </div>
                )}
                <div className="w-px h-3 bg-gray-200 dark:bg-gray-700 mx-1"></div>
                <button onMouseDown={(e)=>e.preventDefault()} onClick={()=>handleToolbarAction('h1')} className={`toolbar-btn p-1.5 font-bold text-[12px] rounded transition-all active:scale-90 ${activeFormats.h1?'bg-blue-100 text-blue-600 dark:bg-blue-900/40':'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`} title="一级标题">H1</button>
                <button onMouseDown={(e)=>e.preventDefault()} onClick={()=>handleToolbarAction('h2')} className={`toolbar-btn p-1.5 font-bold text-[12px] rounded transition-all active:scale-90 ${activeFormats.h2?'bg-blue-100 text-blue-600 dark:bg-blue-900/40':'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`} title="二级标题">H2</button>
                <button onMouseDown={(e)=>e.preventDefault()} onClick={()=>handleToolbarAction('h3')} className={`toolbar-btn p-1.5 font-bold text-[12px] rounded transition-all active:scale-90 ${activeFormats.h3?'bg-blue-100 text-blue-600 dark:bg-blue-900/40':'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`} title="三级标题">H3</button>
                <div className="w-px h-3 bg-gray-200 dark:bg-gray-700 mx-1"></div>
                <button onMouseDown={(e)=>e.preventDefault()} onClick={()=>handleToolbarAction('list')} className={`toolbar-btn p-1.5 rounded transition-all active:scale-90 ${activeFormats.list?'bg-blue-100 text-blue-600 dark:bg-blue-900/40':'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`} title="无序列表"><List size={14}/></button>
                <button onMouseDown={(e)=>e.preventDefault()} onClick={()=>handleToolbarAction('todo')} className="toolbar-btn p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-all active:scale-90" title="插入待办"><ListChecks size={14}/></button>
                <button onMouseDown={(e)=>e.preventDefault()} onClick={()=>handleToolbarAction('todoTemplate')} className="toolbar-btn p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-all active:scale-90" title="快捷待办"><CalendarDays size={14}/></button>
                <button onMouseDown={(e)=>e.preventDefault()} onClick={()=>handleToolbarAction('timestamp')} className="toolbar-btn p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-all active:scale-90" title="时间戳"><Clock size={14}/></button>
                {activeNote.format==='md' && <button onMouseDown={(e)=>e.preventDefault()} onClick={handleScreenshot} className="toolbar-btn p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-all active:scale-90" title="截图"><Camera size={14}/></button>}
              </div>
            </div>
            <div className="flex items-center space-x-1.5 ml-auto shrink-0">
              <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-md p-0.5 text-[11px] shrink-0">
                {['sm','md','lg'].map(s => <button key={s} onMouseDown={e=>e.preventDefault()} onClick={()=>setEditorFontSize(s)} className={`px-1.5 py-0.5 rounded transition-all ${editorFontSize===s?'bg-white dark:bg-gray-700 shadow-sm text-blue-600':'text-gray-400 hover:text-gray-600'}`} title={{sm:'小字',md:'中字',lg:'大字'}[s]}>{s.toUpperCase()}</button>)}
              </div>
              <button onClick={()=>setZenMode(!zenMode)} className="p-1.5 text-gray-500 hover:text-blue-600 rounded" title="沉浸模式">{zenMode?<Minimize size={14}/>:<Maximize size={14}/>}</button>
              <button onClick={handleExtractPlainText} className="p-1.5 text-gray-500 hover:text-blue-600 rounded" title="提取纯文本"><FileOutput size={14}/></button>
            </div>
          </div>
          {/* 编辑器主体 */}
          <div className="flex-1 flex overflow-hidden relative">
            <div className="flex-1 overflow-y-auto custom-scrollbar flex justify-center">
              <div className={`w-full max-w-4xl py-5 px-7 flex flex-col`}>
                <input id="note-title-input" type="text" value={activeNote.title} onChange={(e)=>updateActiveNote({title:e.target.value})} placeholder="无标题笔记" className="text-2xl font-bold bg-transparent border-none outline-none mb-2 w-full dark:text-gray-100"/>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-gray-400 mb-3 font-mono">
                  <span className="font-bold text-green-500 text-[11px]">
                    {saveStatus.time ? `已保存 ${formatDate(saveStatus.time.toISOString())}` : '未保存'}
                  </span>
                  <span>创建 {formatDate(activeNote.createdAt)}</span>
                  <span>修改 {formatDate(activeNote.updatedAt)}</span>
                  <span className="cursor-pointer hover:text-blue-500 hover:underline inline-flex items-center" title="点击定位文件" onClick={()=>{if(isTauri) invoke('open_folder',{path: generatePath(activeNote.categoryId, activeNote.title, activeNote.format, categories, workspacePath)}).catch(()=>{})}}>
                    <FolderOpen size={9} className="mr-0.5"/>{(()=>{ const p=generatePath(activeNote.categoryId, activeNote.title, activeNote.format, categories, workspacePath); return p.length>50 ? '...'+p.slice(-45) : p; })()}
                  </span>
                </div>
                {showVisualMode && activeNote.format==='md' ? (
                  <div className="flex-1 w-full flex flex-col" onClick={(e) => {
                    // 点击空白区域时将光标置于编辑器末尾
                    if (e.target === e.currentTarget || !visualEditorRef.current?.contains(e.target)) {
                      if (visualEditorRef.current) {
                        visualEditorRef.current.focus();
                        const sel = window.getSelection();
                        const range = document.createRange();
                        range.selectNodeContents(visualEditorRef.current);
                        range.collapse(false);
                        sel.removeAllRanges();
                        sel.addRange(range);
                      }
                    }
                  }}>
                    <div ref={visualEditorRef} contentEditable suppressContentEditableWarning
                      className="flex-1 w-full leading-relaxed outline-none editor-content dark:text-gray-200"
                      style={{fontSize: fontSizeMap[editorFontSize], minHeight: '60vh', paddingBottom: '30vh'}}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          try {
                            const block = (document.queryCommandValue('formatBlock') || '').toLowerCase();
                            // 标题或引用 Enter → 插入段落并切为正文
                            if (/^h[1-6]$/.test(block) || block === 'blockquote') {
                              e.preventDefault();
                              const sel = window.getSelection();
                              // 检测光标是否在标题开头（offset 0）→ 在标题前插入新段落
                              if (sel && sel.isCollapsed && sel.anchorNode && sel.anchorOffset === 0) {
                                const headingEl = sel.anchorNode.nodeType === 3
                                  ? sel.anchorNode.parentElement.closest('h1,h2,h3,h4,h5,h6,blockquote')
                                  : sel.anchorNode.closest('h1,h2,h3,h4,h5,h6,blockquote');
                                if (headingEl && headingEl === sel.anchorNode.parentElement?.closest('h1,h2,h3,h4,h5,h6,blockquote')) {
                                  const p = document.createElement('p');
                                  p.innerHTML = '<br>';
                                  headingEl.parentNode.insertBefore(p, headingEl);
                                  const range = document.createRange();
                                  range.setStart(p, 0);
                                  range.collapse(true);
                                  sel.removeAllRanges();
                                  sel.addRange(range);
                                  return;
                                }
                              }
                              // 非开头位置：正常拆分并切为正文
                              document.execCommand('insertParagraph', false, null);
                              document.execCommand('formatBlock', false, 'p');
                            }
                          } catch {}
                        }
                      }}
                      onInput={(e)=>{
                        if(contentSyncId.current) clearTimeout(contentSyncId.current);
                        const el = e.currentTarget;
                        const expectedId = activeNoteIdRef.current;
                        contentSyncId.current = setTimeout(()=>{
                          // 防止切换笔记后延迟回调把新笔记内容写入旧笔记
                          if (!visualEditorRef.current || visualEditorRef.current.getAttribute('data-note-id') !== expectedId) return;
                          updateActiveNote({content: syncCheckboxesAndMarkdown(el)});
                        }, 800);
                      }}
                      onMouseDown={(e) => {
                        // 图片点击选中显示尺寸控件
                        const target = e.target;
                        if (target.tagName === 'IMG') {
                          e.preventDefault();
                          setSelectedImage(target);
                        }
                      }}
                      onClick={(e) => {
                        // 点击非图片区域取消图片选中
                        if (e.target.tagName !== 'IMG') setSelectedImage(null);
                        // checkbox 被点击 → 切换删除线样式 + 添加/移除完成时间 + 立即保存
                        if (e.target.type === 'checkbox') {
                          const cb = e.target;
                          const li = cb.closest('li');
                          if (li) {
                            // 更新文本节点：添加或移除完成时间
                            let textNode = null;
                            for (const child of li.childNodes) {
                              if (child.nodeType === 3 && child.textContent.trim()) { textNode = child; break; }
                            }
                            if (textNode) {
                              let text = textNode.textContent;
                              // 移除已有的完成时间标记
                              text = text.replace(/\s*\[完成\s+\d{2}:\d{2}\]\s*$/, '');
                              if (cb.checked) {
                                const now = new Date(); const pad = n=>n.toString().padStart(2,'0');
                                text = text.trimEnd() + ` [完成 ${pad(now.getHours())}:${pad(now.getMinutes())}]`;
                              }
                              textNode.textContent = text;
                            }
                            // 切换删除线样式
                            if (cb.checked) {
                              li.style.color = '#9ca3af';
                              li.style.textDecoration = 'line-through';
                            } else {
                              li.style.color = '';
                              li.style.textDecoration = '';
                            }
                          }
                          if (contentSyncId.current) clearTimeout(contentSyncId.current);
                          const expectedId = activeNoteIdRef.current;
                          contentSyncId.current = setTimeout(() => {
                            if (visualEditorRef.current && visualEditorRef.current.getAttribute('data-note-id') === expectedId) updateActiveNote({content: syncCheckboxesAndMarkdown(visualEditorRef.current)});
                          }, 0);
                        }
                      }}
                      onDoubleClick={(e) => {
                        // 双击图片放大预览
                        if (e.target.tagName === 'IMG') {
                          e.preventDefault();
                          setFullscreenImage(e.target.src);
                        }
                      }}
                      onBlur={(e)=>updateActiveNote({content:syncCheckboxesAndMarkdown(e.target)})}/>
                    {/* 图片尺寸修改浮层 */}
                    {selectedImage && (() => {
                      const rect = selectedImage.getBoundingClientRect();
                      const containerRect = visualEditorRef.current?.parentElement?.getBoundingClientRect() || {top:0,left:0};
                      return (
                        <div className="fixed bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700 rounded-lg p-2.5 flex items-center gap-2 z-[100]" style={{ top: rect.bottom + 6, left: Math.max(8, rect.left) }}>
                          <span className="text-[11px] text-gray-500 shrink-0">宽:</span>
                          {[100, 200, 300, 450, 600].map(w => (
                            <button key={w} onMouseDown={(e) => { e.preventDefault(); selectedImage.style.width = w + 'px'; selectedImage.setAttribute('data-width', w); setSelectedImage(null); if(contentSyncId.current) clearTimeout(contentSyncId.current); const expectedId = activeNoteIdRef.current; contentSyncId.current = setTimeout(()=>{if(visualEditorRef.current && visualEditorRef.current.getAttribute('data-note-id') === expectedId) updateActiveNote({content:syncCheckboxesAndMarkdown(visualEditorRef.current)});},300); }}
                              className={`px-2 py-0.5 text-[11px] rounded transition-colors ${selectedImage.offsetWidth === w ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-700 hover:bg-blue-100 hover:text-blue-600'}`}>{w}</button>
                          ))}
                          <input type="number" defaultValue={Math.round(selectedImage.offsetWidth)} min={50} max={1200} className="w-14 px-1.5 py-0.5 text-[11px] border rounded dark:bg-gray-700 dark:border-gray-600 outline-none text-center" onKeyDown={(e) => { if(e.key==='Enter') { const v = Math.max(50, parseInt(e.target.value)||300); selectedImage.style.width = v+'px'; selectedImage.setAttribute('data-width',v); setSelectedImage(null); if(contentSyncId.current) clearTimeout(contentSyncId.current); const expectedId = activeNoteIdRef.current; contentSyncId.current = setTimeout(()=>{if(visualEditorRef.current && visualEditorRef.current.getAttribute('data-note-id') === expectedId) updateActiveNote({content:syncCheckboxesAndMarkdown(visualEditorRef.current)});},300); }}} placeholder="px"/>
                          <button onMouseDown={(e)=>{e.preventDefault();setSelectedImage(null)}} className="text-gray-400 hover:text-red-500 ml-1"><X size={13}/></button>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <textarea id="note-editor-textarea" value={(() => {
                    // 优先使用切换时暂存的内容 ref，防止异步 state 导致显示旧内容
                    if (pendingSourceContentRef.current !== null) {
                      const v = pendingSourceContentRef.current;
                      pendingSourceContentRef.current = null;
                      return v;
                    }
                    return activeNote.content;
                  })()} onChange={(e)=>updateActiveNote({content:e.target.value})} style={{fontSize: activeNote.format==='md' ? '13px' : fontSizeMap[editorFontSize]}} className={`flex-1 w-full bg-transparent border-none outline-none resize-none leading-relaxed pb-32 min-h-[400px] dark:text-gray-200 ${activeNote.format==='md'?'font-mono':''}`}/>
                )}
                {/* 反向链接面板 */}
                {backlinks.length > 0 && (
                  <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                    <button onClick={()=>setShowBacklinks(!showBacklinks)} className="text-xs font-semibold text-gray-400 flex items-center mb-3 hover:text-blue-500">
                      <LinkIcon size={12} className="mr-1.5"/>{backlinks.length} 篇笔记引用了此文 {showBacklinks?'▼':'▶'}
                    </button>
                    {showBacklinks && (
                      <div className="space-y-2">{backlinks.map(bl => (
                        <div key={bl.id} onClick={()=>handleOpenNote(bl.id)} className="px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20">
                          <p className="text-sm font-medium text-blue-600">{bl.title}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5 truncate">{stripMarkdown(bl.content).substring(0,100)}</p>
                        </div>
                      ))}</div>
                    )}
                  </div>
                )}
              </div>
            </div>
            {/* 大纲悬浮面板：默认折叠为一个按钮，点击展开 */}
            {activeNote.format==='md' && (
              <div className={`absolute top-2 right-4 z-30`}>
                {!showTOC ? (
                  <button onClick={()=>setShowTOC(true)} className={`p-2 rounded-lg shadow-lg border transition-all hover:scale-105 ${theme==='dark'?'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700':'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`} title="展开大纲导航">
                    <ListTree size={16}/>
                  </button>
                ) : (
                  <div className={`w-56 max-h-[55vh] overflow-y-auto custom-scrollbar shadow-2xl border rounded-lg p-3 ${theme==='dark'?'bg-gray-800 border-gray-700':'bg-white border-gray-200'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">大纲</h4>
                      <button onClick={()=>setShowTOC(false)} className="p-0.5 text-gray-400 hover:text-gray-700"><X size={11}/></button>
                    </div>
                    <ul className="space-y-1">
                      {docHeadings.map((h,i) => (
                        <li key={i} onClick={()=>handleTOCClick(h.text)} className="text-[11px] text-gray-600 dark:text-gray-300 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 px-2 py-0.5 rounded cursor-pointer truncate transition-colors" style={{paddingLeft:`${(h.level-1)*10+4}px`}}>{h.text}</li>
                      ))}
                      {docHeadings.length===0 && <li className="text-[10px] text-gray-400 italic px-2">暂无标题</li>}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </>) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-300 dark:text-gray-600"><Library size={48} className="mb-4 opacity-50"/><p className="text-sm font-medium">请选择或创建一条笔记</p></div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{__html:`
        .custom-scrollbar::-webkit-scrollbar{width:5px;height:5px}.custom-scrollbar::-webkit-scrollbar-track{background:transparent}.custom-scrollbar::-webkit-scrollbar-thumb{background:#d1d5db;border-radius:10px}
        .hide-scrollbar::-webkit-scrollbar{display:none}
        .editor-content img{max-width:100%;border-radius:8px;border:1px solid #eee;margin:16px 0;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1)}
        .editor-content h1{font-size:1.875rem;font-weight:800;margin:1.5rem 0 1rem;line-height:1.2}
        .editor-content h2{font-size:1.25rem;font-weight:700;margin:1.5rem 0 0.75rem;padding-bottom:0.5rem;border-bottom:1px solid #e5e7eb;line-height:1.3}
        .editor-content h3{font-size:1.125rem;font-weight:700;margin:1rem 0 0.5rem;line-height:1.3}
        .editor-content blockquote{border-left:4px solid #3b82f6;padding:0.75rem 1rem;margin:1rem 0;background:#eff6ff;border-radius:0 8px 8px 0;color:#1e40af}
        .editor-content ul{list-style-type:disc;margin-left:1.5rem;margin-top:0.5rem;margin-bottom:0.5rem}
        .editor-content ol{list-style-type:decimal;margin-left:1.5rem;margin-top:0.5rem;margin-bottom:0.5rem}
        .editor-content li{margin:0.25rem 0}
        .editor-content input[type="checkbox"]{margin-right:8px;transform:scale(1.1)}
        .editor-content table{width:100%;border-collapse:collapse;margin:12px 0}
        .editor-content td,.editor-content th{border:1px solid #e5e7eb;padding:8px 12px}
        .editor-content th{background:#f9fafb;font-weight:600}
      `}}/>
    </div>
  );
}
