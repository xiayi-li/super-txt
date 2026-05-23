// SuperTxt 后端 - 文件 IO / 截图 / 打开目录 等指令
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::Manager;

fn ensure_parent_dir(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| format!("创建父目录失败: {}", e))?;
        }
    }
    Ok(())
}

#[tauri::command]
fn read_local_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("读取文件失败 [{}]: {}", path, e))
}

#[tauri::command]
fn save_local_file(path: String, content: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    ensure_parent_dir(&p)?;
    fs::write(&p, content).map_err(|e| format!("写入文件失败 [{}]: {}", path, e))?;
    Ok(())
}

#[tauri::command]
fn read_raw_file(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(|e| format!("读取二进制文件失败 [{}]: {}", path, e))
}

#[tauri::command]
fn save_raw_file(path: String, bytes: Vec<u8>) -> Result<(), String> {
    let p = PathBuf::from(&path);
    ensure_parent_dir(&p)?;
    fs::write(&p, bytes).map_err(|e| format!("写入二进制文件失败 [{}]: {}", path, e))?;
    Ok(())
}

#[tauri::command]
fn rename_local_item(old_path: String, new_path: String) -> Result<(), String> {
    let dst = PathBuf::from(&new_path);
    ensure_parent_dir(&dst)?;
    fs::rename(&old_path, &dst).map_err(|e| format!("重命名/移动失败 [{} -> {}]: {}", old_path, new_path, e))?;
    Ok(())
}

#[tauri::command]
fn create_local_dir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| format!("创建目录失败 [{}]: {}", path, e))
}

#[tauri::command]
fn delete_local_item(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.exists() { return Ok(()); }
    if p.is_dir() {
        fs::remove_dir_all(&p).map_err(|e| format!("删除目录失败: {}", e))
    } else {
        fs::remove_file(&p).map_err(|e| format!("删除文件失败: {}", e))
    }
}

#[tauri::command]
fn list_dir(path: String) -> Result<Vec<String>, String> {
    let entries = fs::read_dir(&path).map_err(|e| format!("枚举目录失败 [{}]: {}", path, e))?;
    let mut result = Vec::new();
    for ent in entries.flatten() {
        if let Some(name) = ent.path().to_str() { result.push(name.to_string()); }
    }
    Ok(result)
}

/// Windows: 在资源管理器中定位/打开该路径。其它平台尝试通用 open。
#[tauri::command]
fn open_folder(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    #[cfg(target_os = "windows")]
    {
        // 如果是文件，使用 /select, 在 explorer 中高亮；否则直接打开目录
        let arg = if p.is_file() { format!("/select,{}", path) } else { path.clone() };
        Command::new("explorer").arg(arg).spawn().map_err(|e| format!("explorer 启动失败: {}", e))?;
        return Ok(());
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = p; // suppress unused warning
        let target = if std::path::Path::new(&path).is_file() {
            std::path::Path::new(&path).parent().map(|x| x.to_string_lossy().to_string()).unwrap_or(path.clone())
        } else { path.clone() };
        #[cfg(target_os = "macos")]
        { Command::new("open").arg(&target).spawn().map_err(|e| format!("open 启动失败: {}", e))?; }
        #[cfg(all(unix, not(target_os = "macos")))]
        { Command::new("xdg-open").arg(&target).spawn().map_err(|e| format!("xdg-open 启动失败: {}", e))?; }
        Ok(())
    }
}

/// 启动系统截图工具（Windows: SnippingTool / Win+Shift+S；其它平台占位）
#[tauri::command]
fn start_screenshot() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // ms-screenclip URI 方案直接拉起截图工具
        let res = Command::new("cmd").args(&["/C", "start", "ms-screenclip:"]).spawn();
        if res.is_err() {
            // 退路：调用 SnippingTool
            Command::new("SnippingTool.exe").spawn().map_err(|e| format!("截图工具启动失败: {}", e))?;
        }
        return Ok(());
    }
    #[cfg(not(target_os = "windows"))]
    { Err("当前平台暂不支持唤起截图".into()) }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            read_local_file,
            save_local_file,
            read_raw_file,
            save_raw_file,
            rename_local_item,
            create_local_dir,
            delete_local_item,
            list_dir,
            open_folder,
            start_screenshot
        ])
        .setup(|app| {
            // 开发阶段自动打开 DevTools，便于排查白屏等问题
            #[cfg(debug_assertions)]
            {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
