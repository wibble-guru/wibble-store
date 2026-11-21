import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // 게임은 서브 경로(https://games.wibble.guru/store/)에 올라갈 수 있으니 상대 경로로 빌드
  base: "./",
  server: {
    port: 5181,
    host: true, // 같은 와이파이의 휴대폰에서 http://<맥 IP>:5181 으로 테스트
  },
});
