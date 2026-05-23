#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::Path;

#[tauri::command]
fn read_local_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("无法读取文件: {}", e))
}

#[tauri::command]
fn save_local_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("无法创建目录: {}", e))?;
        }
    }
    fs::write(&path, content).map_err(|e| format!("无法保存文件: {}", e))
}

#[tauri::command]
fn save_raw_file(path: String, bytes: Vec<u8>) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("无法创建目录: {}", e))?;
        }
    }
    fs::write(&path, bytes).map_err(|e| format!("无法保存图片: {}", e))
}

#[tauri::command]
fn read_raw_file(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(|e| format!("无法读取图片: {}", e))
}

#[tauri::command]
fn delete_local_item(path: String, is_dir: bool) -> Result<(), String> {
    if is_dir {
        fs::remove_dir_all(&path).map_err(|e| format!("无法删除文件夹: {}", e))
    } else {
        fs::remove_file(&path).map_err(|e| format!("无法删除文件: {}", e))
    }
}

#[tauri::command]
fn create_local_dir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| format!("无法创建文件夹: {}", e))
}

#[tauri::command]
fn rename_local_item(old_path: String, new_path: String) -> Result<(), String> {
    fs::rename(&old_path, &new_path).map_err(|e| format!("无法重命名: {}", e))
}

#[tauri::command]
fn open_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg("/select,") 
            .arg(&path)
            .spawn()
            .map_err(|e| format!("无法打开目录: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn start_screenshot() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("powershell")
            .args(["-Command", "Start-Process ms-screenclip:"])
            .spawn()
            .map_err(|e| format!("无法启动截图: {}", e))?;
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            read_local_file,
            save_local_file,
            save_raw_file,
            read_raw_file,
            delete_local_item,
            create_local_dir,
            rename_local_item,
            open_folder,
            start_screenshot
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}