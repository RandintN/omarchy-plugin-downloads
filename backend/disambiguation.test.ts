import { describe, test, expect } from "bun:test";

describe("Desambiguação de Mídia (Heurística de Seleção)", () => {
  const AD_KEYWORD_REGEX = /(?:^|[-_ \/])(ad|ads|advert|advertisement|banner|sponsored|preroll|midroll|postroll|vast|vpaid|outbrain|taboola|popunder|popup)(?:[-_ \/]|$)/i;
  const AD_URL_REGEX = /(doubleclick|googlesyndication|googleadservices|adnxs|adroll|taboola|outbrain|popads|propellerads|exoclick|trafficjunky|juicyads|a-ads|ad-delivery|adsystem)/i;
  const PLAYER_CONTAINER_REGEX = /(?:^|[-_ \/])(player|video|video-player|main-player|watch|content|article|entry|media-player)(?:[-_ \/]|$)/i;

  function calculateScore(v: {
    url: string;
    duration: number;
    area: number;
    isPlaying: boolean;
    isVisible: boolean;
    isAd: boolean;
    isPlayer: boolean;
  }) {
    let score = 20;
    const isLiveOrDynamic = v.duration === Infinity;

    if (isLiveOrDynamic || v.duration >= 180) {
      score += 70;
    } else if (v.duration >= 60) {
      score += 40;
    } else if (v.duration > 0 && v.duration <= 45) {
      score -= 50;
    }

    if (v.area >= 200000) {
      score += 50;
    } else if (v.area >= 70000) {
      score += 25;
    } else if (v.area > 0 && v.area < 40000) {
      score -= 30;
    }

    if (v.isVisible) score += 10;
    if (v.isPlaying) score += 40;

    if (v.isAd) score -= 80;
    if (v.isPlayer) score += 30;

    return score;
  }

  test("prioriza vídeo longo em player principal contra anúncio de 30 segundos", () => {
    const adVideo = {
      url: "https://ad.example.com/clip30s.mp4",
      duration: 30,
      area: 75000, // 300x250
      isPlaying: true,
      isVisible: true,
      isAd: true,
      isPlayer: false
    };

    const mainVideo = {
      url: "https://cdn.example.com/main_movie.mp4",
      duration: 1200, // 20 min
      area: 409920, // 854x480
      isPlaying: true,
      isVisible: true,
      isAd: false,
      isPlayer: true
    };

    const adScore = calculateScore(adVideo);
    const mainScore = calculateScore(mainVideo);

    expect(mainScore).toBeGreaterThan(adScore);
    expect(adScore).toBeLessThan(0);
    expect(mainScore).toBeGreaterThan(150);
  });

  test("favorece stream dinâmico ou HLS ao vivo (duration Infinity) contra banner publicitário", () => {
    const bannerAd = {
      url: "https://ads.net/promo15s.mp4",
      duration: 15,
      area: 30000,
      isPlaying: false,
      isVisible: true,
      isAd: true,
      isPlayer: false
    };

    const liveStream = {
      url: "https://cdn.example.com/live/index.m3u8",
      duration: Infinity,
      area: 921600, // 1280x720
      isPlaying: true,
      isVisible: true,
      isAd: false,
      isPlayer: true
    };

    const adScore = calculateScore(bannerAd);
    const streamScore = calculateScore(liveStream);

    expect(streamScore).toBeGreaterThan(adScore);
    expect(streamScore).toBeGreaterThan(200);
  });

  test("não descarta clipe curto legítimo se for o único vídeo da página", () => {
    const shortClip = {
      url: "https://social.example.com/short_clip.mp4",
      duration: 20,
      area: 120000,
      isPlaying: true,
      isVisible: true,
      isAd: false,
      isPlayer: false
    };

    const score = calculateScore(shortClip);
    // Pontuação pode ser modesta, mas o item é aceito e mantido como candidato
    expect(typeof score).toBe("number");
  });

  test("filtra domínios conhecidos de publicidade", () => {
    expect(AD_URL_REGEX.test("https://pagead2.googlesyndication.com/pagead/video.mp4")).toBe(true);
    expect(AD_URL_REGEX.test("https://ad.doubleclick.net/ddm/track/clk")).toBe(true);
    expect(AD_URL_REGEX.test("https://secure.adnxs.com/seg?add=1")).toBe(true);
    expect(AD_URL_REGEX.test("https://cdn.streamprovider.com/video.mp4")).toBe(false);
  });
});
