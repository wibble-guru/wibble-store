/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** init을 받아도 되는 사이트 origin 목록 (쉼표 구분). 비우면 제한 없음 */
  readonly VITE_ALLOWED_HOST_ORIGINS?: string;
  /** 단독 실행을 막을 때 안내할 위블 사이트 주소 (기본 https://wibble.guru) */
  readonly VITE_SITE_URL?: string;
}
