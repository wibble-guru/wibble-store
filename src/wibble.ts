import { defineWibbleGame } from "@wibble-guru/boilerplate";

/** 위블 사이트 연동 설정. slug는 vite.config.ts의 wibble({ slug })와 같아야 한다 */
export const game = defineWibbleGame({
  slug: "store",
  defaultTheme: "horror",
  env: import.meta.env,
});
