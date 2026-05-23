import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // 终极必杀：强制 Vite 使用 Tailwind 处理 CSS
  css: {
    postcss: {
      plugins: [tailwindcss(), autoprefixer()],
    },
  },
  // 防止 Vite 清除 Tauri 的终端输出
  clearScreen: false,
  server: {
    port: 1421, 
    strictPort: true, 
  },
});