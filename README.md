# SuperTxt

**AI 时代的硬核记事本** — 完全隐私安全，基于本地文件系统、极速秒开、支持 TXT 与 Markdown 智能双模的轻量级个人知识库工具。

![SuperTxt 界面](screenshot.png)

## 特性

- **三栏布局** — 侧边栏 / 文件列表 / 编辑器，支持拖拽调整宽度
- **TXT / MD 双模** — TXT 纯净模式与 Markdown 富文本模式无缝切换，TXT 中使用排版功能时自动提示升级
- **视觉编辑器** — 基于 contentEditable 的所见即所得 Markdown 编辑器，支持双向切换
- **大纲导航** — H1-H3 标题自动提取，层级缩进，点击跳转
- **全局截图** — 一键唤起系统截图工具（Win+Shift+S），图片自动存入 `.assets` 隐藏目录
- **图片渲染** — 通过 Rust 读取二进制流绕过 WebView 本地路径限制，支持自定义宽度语法
- **目录树** — 四色状态可视化（蓝=根目录 / 灰=空 / 橙=仅子目录 / 绿=含文件）
- **全局搜索** — 标题与正文实时模糊检索
- **文本提纯** — 一键剥离 Markdown/HTML 标记，复制纯净文本给大模型
- **双向链接** — `[[笔记名]]` 语法，自动创建/跳转，反向链接追踪
- **暗黑模式** — 全局 Light/Dark 主题切换
- **沉浸模式** — 一键隐藏侧边栏，全屏心流写作

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面底座 | Tauri v2 (WebView2 + Rust) |
| 前端 | React 19 + TailwindCSS 3 |
| 构建 | Vite 7 |
| 图标 | lucide-react |
| 打包 | NSIS |

## 环境要求

- [Node.js](https://nodejs.org/) >= 18
- [Rust](https://www.rust-lang.org/tools/install) (stable)
- [NSIS](https://nsis.sourceforge.io/) (安装到默认路径 `C:\Program Files (x86)\NSIS\`)

## 开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run tauri dev
```

开发模式下会自动打开 DevTools 方便调试。

## 打包构建

本应用基于 Tauri + WebView2，安装包有两种模式可供选择：

| | 轻量安装包 | 离线安装包 |
|---|---|---|
| **大小** | ~3 MB | ~200 MB |
| **WebView2** | 不捆绑，依赖目标机器已安装 | 内置完整运行时 |
| **适用场景** | Win11 / 已更新 Win10 / 联网机器 | 内网、离线、全新未更新系统 |
| **配置值** | `"skip"`（默认） | `"offlineInstaller"` |

> Win11 自带 WebView2；Win10 也会通过 Windows Update 自动推送。大多数情况下使用轻量安装包即可。

### 轻量安装包（默认，~3MB）

目标机器需已安装 WebView2（Win11 自带，Win10 通过 Windows Update 自动推送）：

```powershell
$env:Path = "C:\Program Files (x86)\NSIS\Bin;$env:Path"
npm run tauri build -- --bundles nsis
```

### 离线安装包（~200MB，内网可用）

自带 WebView2 完整运行时，无需联网：

1. 修改 `src-tauri/tauri.conf.json` 中 `webviewInstallMode`：
   ```json
   "webviewInstallMode": { "type": "offlineInstaller" }
   ```
2. 执行构建命令（同上）
3. 构建完成后改回 `"skip"`

**输出路径：** `src-tauri/target/release/bundle/nsis/SuperTxt_1.0.0_x64-setup.exe`

## 项目结构

```
super-txt/
├── src/                        # 前端代码
│   ├── App.jsx                 # 主应用组件（全部 UI 逻辑）
│   ├── App.css                 # 应用样式
│   ├── main.jsx                # React 入口
│   ├── index.css               # 全局样式 + Tailwind 指令
│   └── postcss.config.js       # PostCSS 配置
├── src-tauri/                  # Rust 后端
│   ├── src/
│   │   ├── lib.rs              # IPC 命令实现（文件 IO、截图、扫描等）
│   │   └── main.rs             # Rust 入口
│   ├── tauri.conf.json         # Tauri 配置（窗口、权限、打包）
│   ├── Cargo.toml              # Rust 依赖
│   └── capabilities/           # Tauri 权限声明
├── index.html                  # HTML 入口
├── vite.config.js              # Vite 配置
├── tailwind.config.js          # TailwindCSS 配置
└── package.json                # Node 依赖与脚本
```

## Rust IPC 命令

| 命令 | 功能 |
|---|---|
| `read_local_file` | 读取文本文件 |
| `save_local_file` | 写入文本文件 |
| `read_raw_file` | 读取二进制文件（图片等） |
| `save_raw_file` | 写入二进制文件 |
| `rename_local_item` | 重命名/移动文件或目录 |
| `create_local_dir` | 创建目录（自动递归） |
| `delete_local_item` | 删除文件或目录 |
| `list_dir` | 列举目录内容 |
| `open_folder` | 在资源管理器中打开/定位 |
| `start_screenshot` | 唤起系统截图工具 |
| `scan_workspace` | 递归扫描工作区文件 |

## License

MIT
