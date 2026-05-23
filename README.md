# Tauri + React

This template should help get you started developing with Tauri and React in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

super-txt/                  <-- 你的项目根目录
│
├── node_modules/           <-- 依赖包存放地 (不用管)
├── public/                 <-- 静态资源 (不用管)
│
├── src/                    <-- 【前端 React 代码区】
│   ├── assets/
│   ├── App.css
│   ├── App.jsx             <-- 👉 替换文件 3：[React 架构入口:src/App.jsx]
│   │                           (把原有内容全删掉，粘贴我给你的 React 代码)
│   └── main.jsx
│
├── src-tauri/              <-- 【后端 Rust 与系统配置区】
│   ├── icons/
│   ├── src/
│   │   └── main.rs         <-- 👉 替换文件 2：[Rust 底层引擎:src-tauri/src/main.rs]
│   │                           (负责真正读写你电脑硬盘的 Rust 代码)
│   ├── Cargo.toml
│   └── tauri.conf.json     <-- 👉 替换文件 1：[Tauri 配置与权限:src-tauri/tauri.conf.json]
│                               (定义窗口大小、名称、以及允许软件读写硬盘的权限)
│
├── index.html
├── package.json
└── vite.config.js


SuperTxt 产品技术设计说明书 (v1.0)
1. 核心定位与设计哲学
定位：AI 时代 Windows 原生记事本的“性能强化版”。

设计哲学 (Local-First)：文件即数据，数据即文件。软件仅作为物理文件夹的 UI 渲染层，用户在软件外使用其他编辑器（如 VS Code）修改文件，软件应保持高度兼容与一致性。

极简心流：秒开、自动保存、格式随心（TXT/MD 无损升级）。

2. 技术栈架构
运行环境：Tauri (Rust 后端 + Webview 前端)

前端框架：React 18 + TailwindCSS

状态管理：React Hooks (useMemo, useCallback), Context API

底层通信：Tauri IPC (Frontend -> Rust -> OS API)

存储结构：

物理层：真实文件夹与 .md / .txt 文件。

索引层：supertxt_index.json (用于存储标签、置顶状态、目录折叠信息等非文件元数据)。

3. 功能模块详细设计
3.1 物理文件系统 (The Workspace)
根目录锁定：支持用户自定义绝对路径。所有操作严格在此目录下进行。

动态扫描：软件启动时递归扫描工作区，生成文件树。

同名安全拦截：所有新建、重命名、移动操作，必须先通过 Rust 校验物理路径是否存在。若存在同名，强制弹出 UI 错误提示，禁止覆盖。

文件操作联动：

创建：调用 save_local_file，不存在父目录自动递归创建。

删除：调用 delete_local_item，若目录非空（检测算法：目录下含有文件），禁止删除。

移动：支持右键菜单 -> 移动。前端提供目录选择器（含路径预览），后端调用 rename_local_item 执行系统原子重命名。

3.2 编辑器引擎 (The Engine)
双模态切换：

源码模式：支持 Markdown 语法，提供工具栏快捷输入。

视觉模式：contentEditable 渲染。包含 “大纲导航(TOC)”，支持 H1-H3 标题自动提取。

智能格式转换：

无感升维：TXT 笔记中触发任何排版按钮时，弹出确认弹窗，确认后将文件升级为 MD 并同步修改磁盘后缀名。

提纯处理：支持将 Markdown 剥离排版标记，生成纯文本供复制给大模型。

图片与多媒体处理：

截图拦截：触发截图后，图片自动存入隐藏文件夹 .assets/。

本地预览：通过 Rust 读取图片二进制流 (read_raw_file) 转换为 Blob URL 进行渲染，绕过 WebView 本地路径安全拦截。

3.3 目录与列表导航 (The Navigator)
层级渲染：采用递归渲染策略。点击目录仅展示该目录下的直属文件与子文件夹。

对齐逻辑：文件夹与文件在左侧树状视图中，通过固定宽度容器（w-6）实现图标 100% 垂直对齐。

最近访问 (Recent Access)：支持“查看更多历史”，跳转到按时间倒序排列的独立历史视图页面。

4. 稳定性防御体系 (防白屏指南)
为了彻底解决我们之前遇到的白屏 Bug，开发规范必须遵守以下“铁律”：

ErrorBoundary (错误边界)：
应用顶层必须包裹一个 ErrorBoundary 组件，拦截所有渲染层崩溃。如果出错，不再白屏，而是显示具体的报错堆栈供调试。

状态与渲染隔离：
activeNote 等核心依赖变量必须在组件顶部 useState 定义后立即声明。严禁在 return 之后或 useEffect 循环外使用未初始化的状态。

唯一的 React Key：
在渲染列表时，强制使用 note.id 作为 Key，并对 recentIds 和 openTabs 使用 Array.from(new Set(arr)) 进行强制去重。

异步状态同步：
禁止在 useEffect 中直接进行高频 DOM 操作。所有涉及 DOM 属性（如图片路径、HTML 渲染）的操作，必须通过 useRef 获取 DOM 引用，并在状态变更后的 useEffect 中执行。