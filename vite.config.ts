import preact from "@preact/preset-vite";
import { wibble } from "@wibble-guru/boilerplate/vite";
import { defineConfig } from "vite";

// wibble(): 상대 경로 빌드(base "./"), 휴대폰 접속용 server.host, 호스트 시뮬레이터 /host.html
export default defineConfig({
  plugins: [preact(), wibble({ slug: "store", port: 5181, theme: "horror" })],
});
