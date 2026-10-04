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

  const AD_KEYWORD_REGEX = /(?:^|[-_ \/])(ad|ads|advert|advertisement|banner|sponsored|preroll|midroll|postroll|vast|vpaid|outbrain|taboola|popunder|popup)(?:[-_ \/]|$)/i;
  const AD_URL_REGEX = /(doubleclick|googlesyndication|googleadservices|adnxs|adroll|taboola|outbrain|popads|propellerads|exoclick|trafficjunky|juicyads|a-ads|ad-delivery|adsystem)/i;
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

  const candidates = [];
  const seenUrls = new Set();

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
      if (seenUrls.has(rawSrc)) continue;
      seenUrls.add(rawSrc);

      let score = 20;
      const duration = Number.isFinite(vid.duration) && vid.duration > 0 ? vid.duration : 0;
      const isLiveOrDynamic = vid.duration === Infinity;
      const isPlaying = !vid.paused && vid.currentTime > 0;

      const rect = vid.getBoundingClientRect ? vid.getBoundingClientRect() : { width: 0, height: 0 };
      const area = Math.max(0, rect.width) * Math.max(0, rect.height);
      const isVisible = rect.width > 20 && rect.height > 20;

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

      if (isVisible) score += 10;
      if (isPlaying) score += 40;

      // Ponderacao de contexto no DOM
      if (isAdContainer(vid)) {
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
        area
      });
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
    const inAd = isAdContainer(ifr);
    const inPlayer = isPlayerContainer(ifr);

    let ifrScore = 15;
    if (area >= 200000) ifrScore += 45;
    else if (area >= 70000) ifrScore += 20;
    else if (area > 0 && area < 40000) ifrScore -= 30;

    if (inAd) ifrScore -= 80;
    if (inPlayer) ifrScore += 30;

    // Caso o iframe passe a URL da midia como parametro (ex: ?d=https://...m3u8)
    const matchParam = src.match(/[?&](?:d|file|url|source|src|video)=([^&#]+)/i);
    if (matchParam) {
      try {
        const decoded = decodeURIComponent(matchParam[1]);
        if (/^https?:\/\/.*(\.m3u8|\.mp4)/i.test(decoded) && !AD_URL_REGEX.test(decoded)) {
          if (!seenUrls.has(decoded)) {
            seenUrls.add(decoded);
            candidates.push({
              url: decoded,
              referer: src.startsWith('http') ? src : pageUrl,
              title: pageTitle,
              score: ifrScore + 15,
              duration: 0,
              area
            });
          }
        }
      } catch {}
    }

    // Caso o proprio src do iframe aponte para um stream direto
    if (/\.(m3u8|mp4)(\?|$)/i.test(src)) {
      if (!seenUrls.has(src)) {
        seenUrls.add(src);
        candidates.push({
          url: src,
          referer: pageUrl,
          title: pageTitle,
          score: ifrScore + 10,
          duration: 0,
          area
        });
      }
    } else if (area >= 70000 && !inAd && /(?:embed|player|video|stream)/i.test(src)) {
      // Iframe de player embutido compativel com extratores do yt-dlp
      if (!seenUrls.has(src)) {
        seenUrls.add(src);
        candidates.push({
          url: src,
          referer: pageUrl,
          title: pageTitle,
          score: ifrScore + 5,
          duration: 0,
          area
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
        if (!/\.(m3u8|mp4)(\?|$)/i.test(rUrl)) continue;
        if (AD_URL_REGEX.test(rUrl)) continue;
        if (seenUrls.has(rUrl)) continue;
        seenUrls.add(rUrl);

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

  // 4. Inspecionar HTML geral por URLs de stream (fallback)
  const bodyHtml = document.documentElement.innerHTML || '';
  const m3u8Regex = /(https?:\/\/[^\s"'<>\\]+?\.(?:m3u8|mp4)[^\s"'<>\\]*)/gi;
  let match;
  while ((match = m3u8Regex.exec(bodyHtml)) !== null) {
    const candidateUrl = match[1];
    if (!candidateUrl) continue;
    if (AD_URL_REGEX.test(candidateUrl)) continue;
    if (seenUrls.has(candidateUrl)) continue;
    seenUrls.add(candidateUrl);

    candidates.push({
      url: candidateUrl,
      referer: pageUrl,
      title: pageTitle,
      score: 5,
      duration: 0,
      area: 0
    });
  }

  // Selecao por pontuacao maxima com desempate por duracao e area
  if (candidates.length > 0) {
    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.duration !== a.duration) return b.duration - a.duration;
      return b.area - a.area;
    });

    return {
      url: candidates[0].url,
      referer: candidates[0].referer,
      title: candidates[0].title
    };
  }

  // Fallback final: usar a URL da propria pagina
  return {
    url: pageUrl,
    referer: pageUrl,
    title: pageTitle
  };
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
