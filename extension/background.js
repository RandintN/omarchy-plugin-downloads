function sendDownload(url, referer, title) {
  if (!url || !/^https?:/i.test(url)) return;

  const payload = { url };
  if (referer) payload.referer = referer;
  if (title) payload.title = title;

  chrome.runtime.sendNativeMessage('com.omarchy.ytdlp', payload, () => {
    void chrome.runtime.lastError;
  });
}

function scanMediaFromPage() {
  const pageUrl = location.href;
  const isGeneric = (str) => !str || /^(master|index|playlist|video|stream|manifest)(?:\.[a-z0-9]+)?$/i.test(str.trim());
  const cleanTitle = (str) => {
    if (!str) return '';
    let t = str.replace(/[\r\n\t]+/g, ' ').trim();
    t = t.replace(/\s*[-\u2013\u2014|]\s*(?:Animes Online|Assistir Online|YouTube|Bilibili|Dailymotion).*$/i, '').trim();
    return isGeneric(t) ? '' : t;
  };

  const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
  const twitterTitle = document.querySelector('meta[name="twitter:title"]')?.getAttribute('content') || '';
  const h1Title = document.querySelector('h1')?.textContent || '';
  let pageTitle = cleanTitle(ogTitle) || cleanTitle(h1Title) || cleanTitle(twitterTitle) || cleanTitle(document.title);

  const AD_KEYWORD_REGEX = /(?:^|[-_ \/])(ad|ads|advert|advertisement|banner|sponsored|preroll|midroll|postroll|vast|vpaid|outbrain|taboola|popunder|popup|exo)(?:[-_ \/]|$)/i;
  const AD_URL_REGEX = /(doubleclick|googlesyndication|googleadservices|adnxs|adroll|taboola|outbrain|popads|propellerads|exoclick|trafficjunky|juicyads|a-ads|ad-delivery|adsystem|adtng|montlusa|(?:^|[^a-z0-9])(?:ad|ads)(?:[^a-z0-9]|$)|(?:^|[^a-z0-9])(?:vast|vpaid)(?:[^a-z0-9]|$))/i;
  const PLAYER_CONTAINER_REGEX = /(?:^|[-_ \/])(player|video|video-player|main-player|watch|content|article|entry|media-player)(?:[-_ \/]|$)/i;

  const isAdContainer = (el) => {
    let curr = el;
    let depth = 0;
    while (curr && curr !== document.body && depth < 6) {
      const id = curr.id || '';
      const className = typeof curr.className === 'string' ? curr.className : '';
      if (AD_KEYWORD_REGEX.test(id) || AD_KEYWORD_REGEX.test(className)) {
        return true;
      }
      curr = curr.parentElement;
      depth++;
    }
    return false;
  };

  const isPlayerContainer = (el) => {
    let curr = el;
    let depth = 0;
    while (curr && curr !== document.body && depth < 6) {
      const id = curr.id || '';
      const className = typeof curr.className === 'string' ? curr.className : '';
      if (PLAYER_CONTAINER_REGEX.test(id) || PLAYER_CONTAINER_REGEX.test(className)) {
        return true;
      }
      curr = curr.parentElement;
      depth++;
    }
    return false;
  };

  // Normaliza URL para dedup: caixa do host, fragmento e barra final, preservando query
  // (streams usam query assinada; colapsar tokens quebraria o download)
  const normalizeUrl = (u) => {
    try {
      const parsed = new URL(u);
      parsed.hash = '';
      parsed.hostname = parsed.hostname.toLowerCase();
      let href = parsed.href;
      if (href.endsWith('/') && !href.endsWith('//')) href = href.slice(0, -1);
      return href;
    } catch {
      return u.toLowerCase();
    }
  };

  let awaitingMetadata = false;

  // Detecta URLs de stream: .m3u8/.mp4 com query, ou HLS tokenizado sem extensao
  // (ex.: hanime.tv/hls/<id>/<token>, cujo manifest nao termina em .m3u8)
  const isStreamUrl = (u) => /\.(m3u8|mp4)(\?|$)/i.test(u) || /\/hls\//i.test(u);

  function collectCandidates() {
    const candidates = [];
    const seenUrls = new Set();
    let pendingVideo = null;

    // 1. Inspecionar elementos <video> diretamente no DOM
  const videoElements = Array.from(document.querySelectorAll('video'));
  for (const vid of videoElements) {
    const sources = [];
    const directSrc = vid.currentSrc || vid.src || vid.getAttribute('src');
    if (directSrc) sources.push(directSrc);
    for (const s of vid.querySelectorAll('source')) {
      const sSrc = s.src || s.getAttribute('src');
      if (sSrc) sources.push(sSrc);
    }

    for (const rawSrc of sources) {
      if (!rawSrc || !/^https?:/i.test(rawSrc)) continue;
      if (AD_URL_REGEX.test(rawSrc)) continue;
      const srcKey = normalizeUrl(rawSrc);
      if (seenUrls.has(srcKey)) continue;
      seenUrls.add(srcKey);

      let score = 20;
      const duration = Number.isFinite(vid.duration) && vid.duration > 0 ? vid.duration : 0;
      const isLiveOrDynamic = vid.duration === Infinity;
      const isPlaying = !vid.paused && vid.currentTime > 0;

      const rect = vid.getBoundingClientRect ? vid.getBoundingClientRect() : { width: 0, height: 0 };
      const area = Math.max(0, rect.width) * Math.max(0, rect.height);
      // Renderizado (tem layout) e realmente dentro da viewport. O layout rect persiste
      // para elementos rolados para fora da tela, entao largura/altura sozinhas nao bastam.
      const isRendered = rect.width > 20 && rect.height > 20;
      const inViewport = isRendered && rect.top < window.innerHeight && rect.bottom > 0 && rect.left < window.innerWidth && rect.right > 0;
      const centerY = rect.top + rect.height / 2;
      const inMiddleBand = inViewport && centerY > window.innerHeight * 0.25 && centerY < window.innerHeight * 0.75;

      // Ponderacao por duracao
      if (isLiveOrDynamic || duration >= 180) {
        score += 70;
      } else if (duration >= 60) {
        score += 40;
      } else if (duration > 0 && duration <= 45) {
        score -= 50;
      }

      // Ponderacao por dimensoes de tela
      if (area >= 200000) {
        score += 50;
      } else if (area >= 70000) {
        score += 25;
      } else if (area > 0 && area < 40000) {
        score -= 30;
      }

      // Ponderacao de visibilidade real: na viewport vale muito, renderizado fora dela pouco
      if (isRendered) score += 10;
      if (inViewport) score += 40;
      if (inMiddleBand) score += 10;

      // Playing e sinal forte so dentro da viewport; tocando fora dela e anti-sinal
      // (autoplay muted de feeds e ads que continuam apos scroll-out)
      if (isPlaying && inViewport) score += 40;
      else if (isPlaying && !inViewport) score -= 40;

      // Ponderacao de contexto no DOM
      if (isAdContainer(vid)) {
        score -= 80;
      }
      // Ad estrutural: curto + tocando + fora de player container. Classnames obfuscadas
      // escapam do AD_KEYWORD_REGEX, mas o padrao "curto e tocando fora de player" e de ad.
      if (duration > 0 && duration <= 45 && isPlaying && !isPlayerContainer(vid)) {
        score -= 80;
      }
      if (isPlayerContainer(vid)) {
        score += 30;
      }

      candidates.push({
        url: rawSrc,
        referer: pageUrl,
        title: pageTitle,
        score,
        duration,
        area,
        inViewport
      });

      // Candidato principal provavel (na viewport) sem metadata: aguardar loadedmetadata
      // antes de decidir, para o sinal de duracao real entrar na pontuacao.
      if (inViewport && duration === 0 && vid.readyState < 1) {
        pendingVideo = pendingVideo || vid;
      }
    }
  }

  // 2. Inspecionar iframes da pagina
  const iframes = Array.from(document.querySelectorAll('iframe'));
  for (const ifr of iframes) {
    const src = ifr.getAttribute('src') || ifr.src || '';
    if (!src || !/^https?:/i.test(src)) continue;
    if (AD_URL_REGEX.test(src)) continue;

    const rect = ifr.getBoundingClientRect ? ifr.getBoundingClientRect() : { width: 0, height: 0 };
    const area = Math.max(0, rect.width) * Math.max(0, rect.height);
    const isRendered = rect.width > 20 && rect.height > 20;
    const inViewport = isRendered && rect.top < window.innerHeight && rect.bottom > 0 && rect.left < window.innerWidth && rect.right > 0;
    const inAd = isAdContainer(ifr);
    const inPlayer = isPlayerContainer(ifr);

    let ifrScore = 15;
    if (area >= 200000) ifrScore += 45;
    else if (area >= 70000) ifrScore += 20;
    else if (area > 0 && area < 40000) ifrScore -= 30;

    if (isRendered) ifrScore += 10;
    if (inViewport) ifrScore += 40;

    if (inAd) ifrScore -= 80;
    if (inPlayer) ifrScore += 30;

    // Caso o iframe passe a URL da midia como parametro (ex: ?d=https://...m3u8)
    const matchParam = src.match(/[?&](?:d|file|url|source|src|video)=([^&#]+)/i);
    if (matchParam) {
      try {
        const decoded = decodeURIComponent(matchParam[1]);
        if (/^https?:\/\/.*(\.m3u8|\.mp4)/i.test(decoded) && !AD_URL_REGEX.test(decoded)) {
          const decodedKey = normalizeUrl(decoded);
          if (!seenUrls.has(decodedKey)) {
            seenUrls.add(decodedKey);
            candidates.push({
              url: decoded,
              referer: src.startsWith('http') ? src : pageUrl,
              title: pageTitle,
              score: ifrScore + 15,
              duration: 0,
              area,
              inViewport
            });
          }
        }
      } catch {}
    }

    // Caso o proprio src do iframe aponte para um stream direto
    if (/\.(m3u8|mp4)(\?|$)/i.test(src)) {
      const srcKey = normalizeUrl(src);
      if (!seenUrls.has(srcKey)) {
        seenUrls.add(srcKey);
        candidates.push({
          url: src,
          referer: pageUrl,
          title: pageTitle,
          score: ifrScore + 10,
          duration: 0,
          area,
          inViewport
        });
      }
    } else if (inViewport && area >= 70000 && !inAd && /(?:embed|player|video|stream)/i.test(src)) {
      // Iframe de player embutido compativel com extratores do yt-dlp (so dentro da viewport:
      // iframe de embed fora dela costuma ser related/ads)
      const srcKey = normalizeUrl(src);
      if (!seenUrls.has(srcKey)) {
        seenUrls.add(srcKey);
        candidates.push({
          url: src,
          referer: pageUrl,
          title: pageTitle,
          score: ifrScore + 5,
          duration: 0,
          area,
          inViewport
        });
      }
    }
  }

  // 3. Inspecionar recursos de rede via Performance API
  if (typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function') {
    try {
      const resources = performance.getEntriesByType('resource');
      for (const res of resources) {
        const rUrl = res.name || '';
        if (!isStreamUrl(rUrl)) continue;
        if (AD_URL_REGEX.test(rUrl)) continue;
        const rKey = normalizeUrl(rUrl);
        if (seenUrls.has(rKey)) continue;
        seenUrls.add(rKey);

        candidates.push({
          url: rUrl,
          referer: pageUrl,
          title: pageTitle,
          score: 25,
          duration: 0,
          area: 0
        });
      }
    } catch {}
  }

  // 4. Inspecionar HTML geral por URLs de stream (fallback), incluindo HLS tokenizado
  const bodyHtml = document.documentElement.innerHTML || '';
  const streamUrlRegexes = [
    /(https?:\/\/[^\s"'<>\\]+?\.(?:m3u8|mp4)[^\s"'<>\\]*)/gi,
    /(https?:\/\/[^\s"'<>\\]+?\/hls\/[^\s"'<>\\]+)/gi
  ];
  for (const re of streamUrlRegexes) {
    let match;
    while ((match = re.exec(bodyHtml)) !== null) {
      const candidateUrl = match[1];
      if (!candidateUrl) continue;
      if (AD_URL_REGEX.test(candidateUrl)) continue;
      const htmlKey = normalizeUrl(candidateUrl);
      if (seenUrls.has(htmlKey)) continue;
      seenUrls.add(htmlKey);

      candidates.push({
        url: candidateUrl,
        referer: pageUrl,
        title: pageTitle,
        score: 5,
        duration: 0,
        area: 0
      });
    }
  }

  // Selecao por pontuacao maxima, com desempate por viewport, duracao e area
    if (candidates.length > 0) {
      candidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const aIn = a.inViewport ? 1 : 0;
        const bIn = b.inViewport ? 1 : 0;
        if (bIn !== aIn) return bIn - aIn;
        if (b.duration !== a.duration) return b.duration - a.duration;
        return b.area - a.area;
      });

      return {
        url: candidates[0].url,
        referer: candidates[0].referer,
        title: candidates[0].title,
        pendingVideo
      };
    }

    // Fallback final: usar a URL da propria pagina
    return {
      url: pageUrl,
      referer: pageUrl,
      title: pageTitle,
      pendingVideo
    };
  }

  const firstPass = collectCandidates();

  // Metadata aguardada: se o video principal provavel (na viewport) ainda nao tem metadata
  // (duration 0/NaN), re-roda a coleta apos loadedmetadata/durationchange, com teto de 1s,
  // para a duracao real entrar na pontuacao antes de decidir.
  if (firstPass.pendingVideo && !awaitingMetadata) {
    awaitingMetadata = true;
    const el = firstPass.pendingVideo;
    return new Promise((resolve) => {
      let settled = false;
      let timer;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        el.removeEventListener('loadedmetadata', finish);
        el.removeEventListener('durationchange', finish);
        resolve(collectCandidates());
      };
      timer = setTimeout(finish, 1000);
      el.addEventListener('loadedmetadata', finish);
      el.addEventListener('durationchange', finish);
    });
  }

  return firstPass;
}

let lastTriggerTime = 0;
let lastTriggerUrl = '';

function triggerDownload(tab) {
  if (!tab || tab.id === undefined) return;

  const now = Date.now();
  if (now - lastTriggerTime < 1500 && lastTriggerUrl === tab.url) {
    return;
  }
  lastTriggerTime = now;
  lastTriggerUrl = tab.url || '';

  chrome.scripting
    .executeScript({
      target: { tabId: tab.id },
      func: scanMediaFromPage
    })
    .then((results) => {
      const isGeneric = (str) => !str || /^(master|index|playlist|video|stream|manifest)(?:\.[a-z0-9]+)?$/i.test(str.trim());
      const cleanTitle = (str) => {
        if (!str) return '';
        let t = str.replace(/[\r\n\t]+/g, ' ').trim();
        t = t.replace(/\s*[-\u2013\u2014|]\s*(?:Animes Online|Assistir Online|YouTube|Bilibili|Dailymotion).*$/i, '').trim();
        return isGeneric(t) ? '' : t;
      };

      const detected = results && results[0] && results[0].result;
      const finalTitle = (detected && cleanTitle(detected.title)) || cleanTitle(tab.title) || '';
      if (detected && detected.url) {
        sendDownload(detected.url, detected.referer, finalTitle);
      } else if (tab.url) {
        sendDownload(tab.url, tab.url, finalTitle);
      }
    })
    .catch(() => {
      if (tab.url) {
        const isGeneric = (str) => !str || /^(master|index|playlist|video|stream|manifest)(?:\.[a-z0-9]+)?$/i.test(str.trim());
        const cleanTitle = (str) => {
          if (!str) return '';
          let t = str.replace(/[\r\n\t]+/g, ' ').trim();
          t = t.replace(/\s*[-\u2013\u2014|]\s*(?:Animes Online|Assistir Online|YouTube|Bilibili|Dailymotion).*$/i, '').trim();
          return isGeneric(t) ? '' : t;
        };
        sendDownload(tab.url, tab.url, cleanTitle(tab.title));
      }
    });

}

// Keyboard shortcut (Alt+Shift+D).
chrome.commands.onCommand.addListener((command) => {
  if (command === 'download-video') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      triggerDownload(tabs[0]);
    });
  }
});

// Clicking the extension's toolbar icon.
chrome.action.onClicked.addListener((tab) => {
  triggerDownload(tab);
});
