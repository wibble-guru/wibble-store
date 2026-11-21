import { SITE_TEST_URL, isEmbedded } from "./bridge";
import logo from "./assets/gate/wibble-logo.png";
import mascotMobile from "./assets/gate/wibble-gate-mobile.svg";
import mascotPc from "./assets/gate/wibble-gate-pc.svg";

/**
 * 부정 사용 안내 (Figma "06 게임 직접 접속 안내 (공통)", 394:991 · PC 394:1005 / 모바일 402:86).
 * 게임 허브(game.wibble.guru)가 먼저 같은 화면으로 막고, 이건 게임 서버로 바로 들어왔을 때의 대비책.
 */
export function Gate() {
  // 낯선 페이지의 iframe 안이라면 새 탭으로 연다
  const newTab = isEmbedded() ? { target: "_blank", rel: "noopener" } : {};
  return (
    <div className="gate">
      <header>
        <img className="gate-logo" src={logo} alt="Wibble" width={720} height={179} />
      </header>
      <main className="gate-content">
        <picture className="gate-mascot">
          <source media="(min-width: 768px)" srcSet={mascotPc} width={203} height={203} />
          <img src={mascotMobile} alt="" width={152} height={152} />
        </picture>
        <h1>위블에서 만나요</h1>
        <p className="gate-body">
          이 테스트는 위블 공식 사이트에서만
          <br className="gate-mobile-break" /> 플레이할 수 있어요.
        </p>
        <a className="gate-btn" href={SITE_TEST_URL} {...newTab}>
          위블에서 플레이하기
        </a>
      </main>
      <footer>© {new Date().getFullYear()} Wibble</footer>
    </div>
  );
}
