(function () {
  "use strict";

  const source = window.OA_REAL_DATA;
  if (!source || !Array.isArray(source.articles) || !source.articles.length) return;

  const articles = source.articles;
  const PAGE_SIZE = 12;
  const genericCardTags = new Set(["程式教育", "兒童學習"]);
  const desiredPrimaryTags = ["Scratch", "APCS", "Python", "兒童程式", "程式教育", "Minecraft", "AI"];
  const categoryDescriptions = {
    "程式學習": "從 Scratch、Python 到遊戲設計，看懂孩子的程式學習路徑與方法。",
    "AI 與科技趨勢": "掌握生成式 AI、數位素養與科技變化，陪孩子建立面向未來的能力。",
    "升學與認證": "APCS、ITS、競賽與學習歷程，協助家長做出適合孩子的升學規劃。",
    "親子教育": "從學習動機、3C 使用到課程選擇，解答家長陪伴孩子時的真實問題。",
    "未來職涯": "看懂科技產業與能力趨勢，理解孩子今天所學如何連接未來。",
    "橘蘋動態": "橘子蘋果的教學實踐、教育合作與重要消息。"
  };

  const $ = (selector) => document.querySelector(selector);
  const storage = {
    get(key) {
      try { return sessionStorage.getItem(key); } catch (_error) { return null; }
    },
    set(key, value) {
      try { sessionStorage.setItem(key, value); } catch (_error) { /* preview privacy mode */ }
    }
  };
  const escapeHtml = (value) => String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

  const categoryCounts = new Map();
  const tagCounts = new Map();
  articles.forEach((article) => {
    article.categories.forEach((name) => categoryCounts.set(name, (categoryCounts.get(name) || 0) + 1));
    article.tags.forEach((name) => tagCounts.set(name, (tagCounts.get(name) || 0) + 1));
  });

  const categories = Object.keys(categoryDescriptions).filter((name) => (categoryCounts.get(name) || 0) > 0);
  const primaryTags = desiredPrimaryTags.filter((name) => (tagCounts.get(name) || 0) >= 5);
  const secondaryTags = [...tagCounts.entries()]
    .filter(([name]) => !primaryTags.includes(name))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hant"))
    .map(([name]) => name);

  const state = {
    category: "",
    tag: "",
    query: "",
    visible: PAGE_SIZE,
    exploreOpen: false,
    moreOpen: false
  };

  function readUrlState() {
    const params = new URLSearchParams(location.search);
    const category = params.get("category") || "";
    const tag = params.get("tag") || "";
    const query = (params.get("q") || "").trim();
    const show = Number.parseInt(params.get("show") || "", 10);
    state.category = categories.includes(category) ? category : "";
    state.tag = tagCounts.has(tag) ? tag : "";
    state.query = query;
    state.visible = Number.isFinite(show) && show > PAGE_SIZE ? Math.ceil(show / PAGE_SIZE) * PAGE_SIZE : PAGE_SIZE;
    if ([state.category, state.tag, state.query].filter(Boolean).length > 1) {
      state.category = state.tag = "";
    }
    state.exploreOpen = Boolean(state.category || state.tag || storage.get("oaArticlesExploreOpen") === "1");
    state.moreOpen = Boolean(state.tag && secondaryTags.includes(state.tag));
  }

  function writeUrl(mode) {
    const url = new URL(location.href);
    url.search = "";
    if (state.category) url.searchParams.set("category", state.category);
    if (state.tag) url.searchParams.set("tag", state.tag);
    if (state.query) url.searchParams.set("q", state.query);
    if (state.visible > PAGE_SIZE) url.searchParams.set("show", String(state.visible));
    try {
      history[mode === "push" ? "pushState" : "replaceState"]({}, "", url);
    } catch (_error) {
      /* file previews can restrict history updates; the page still remains usable */
    }
  }

  function setSingleFilter(kind, value, options) {
    state.category = kind === "category" ? value : "";
    state.tag = kind === "tag" ? value : "";
    state.query = kind === "query" ? value.trim() : "";
    state.visible = PAGE_SIZE;
    state.exploreOpen = kind !== "query";
    state.moreOpen = Boolean(state.tag && secondaryTags.includes(state.tag));
    $("#articleSearch").value = state.query;
    writeUrl("push");
    renderAll();
    if (!options || options.scroll !== false) scrollToResults();
  }

  function clearFilters(options) {
    state.category = "";
    state.tag = "";
    state.query = "";
    state.visible = PAGE_SIZE;
    state.moreOpen = false;
    $("#articleSearch").value = "";
    writeUrl("push");
    renderAll();
    if (!options || options.scroll !== false) scrollToResults();
  }

  function scrollToResults() {
    $("#articles").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function imageMarkup(article, className, eager) {
    if (!article.image) return `<div class="image-fallback">橘蘋觀點</div>`;
    return `<img class="${className}" src="${escapeHtml(article.image)}" alt="文章封面：${escapeHtml(article.title)}" ${eager ? "fetchpriority=\"high\"" : "loading=\"lazy\""} width="1200" height="630">`;
  }

  function bindImageFallbacks(root) {
    root.querySelectorAll("img").forEach((image) => {
      image.addEventListener("error", () => {
        const fallback = document.createElement("div");
        fallback.className = "image-fallback";
        fallback.textContent = "橘蘋觀點";
        image.replaceWith(fallback);
      }, { once: true });
    });
  }

  function cardLabels(article) {
    const specific = article.tags.filter((name) => !genericCardTags.has(name));
    return [...new Set([article.primary_category, ...specific])].slice(0, 2);
  }

  function tagsMarkup(labels) {
    return `<div class="content-tags">${labels.map((label) => `<span>${escapeHtml(label)}</span>`).join("")}</div>`;
  }

  function renderEditorial() {
    const now = new Date();
    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const recent = articles.filter((article) => new Date(`${article.date}T00:00:00`) >= ninetyDaysAgo);
    const guide = recent.find((article) => /指南|攻略|完整/.test(article.title));
    const featured = guide || recent.slice().sort((a, b) => (b.body_chars + b.views) - (a.body_chars + a.views))[0] || articles[0];

    const featuredRoot = $("#featuredArticle");
    featuredRoot.innerHTML = `<a class="featured-card" href="${escapeHtml(featured.url)}">
      <div class="featured-media">${imageMarkup(featured, "featured-image", true)}<span class="featured-badge">深度指南</span></div>
      <div class="featured-copy">
        ${tagsMarkup(cardLabels(featured))}
        <h2>${escapeHtml(featured.title)}</h2>
        <p>${escapeHtml(featured.description)}</p>
        <div class="featured-meta"><span>${escapeHtml(featured.date)}・約 ${featured.reading_minutes} 分鐘閱讀</span><b>閱讀精選 →</b></div>
      </div>
    </a>`;
    bindImageFallbacks(featuredRoot);

    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const pool = articles.filter((article) => article.id !== featured.id);
    const recentPool = pool.filter((article) => new Date(`${article.date}T00:00:00`) >= thirtyDaysAgo);
    const useRecent = recentPool.length >= 3;
    const popular = (useRecent ? recentPool : pool).slice().sort((a, b) => b.views - a.views).slice(0, 3);
    $("#popularHeading").textContent = useRecent ? "近 30 天家長熱門" : "家長熱門";
    $("#popularArticles").innerHTML = popular.map((article, index) => `<a class="popular-row" href="${escapeHtml(article.url)}">
      <span class="popular-number">${String(index + 1).padStart(2, "0")}</span>
      <span><h3>${escapeHtml(article.title)}</h3><small>${escapeHtml(article.primary_category)}・約 ${article.reading_minutes} 分鐘</small></span>
    </a>`).join("");
  }

  function renderCategories() {
    $("#categoryGrid").innerHTML = categories.map((name, index) => {
      const active = state.category === name;
      return `<button type="button" class="category-button" data-category="${escapeHtml(name)}" aria-pressed="${active}">
        <span class="category-number">${String(index + 1).padStart(2, "0")}</span>
        <b>${escapeHtml(name)}</b>
        <small>${categoryCounts.get(name)} 篇文章</small>
        <span class="category-arrow" aria-hidden="true">→</span>
      </button>`;
    }).join("");
  }

  function topicButton(name) {
    const active = state.tag === name;
    return `<button type="button" class="topic-button" data-topic="${escapeHtml(name)}" aria-pressed="${active}">${escapeHtml(name)}<span class="topic-count">${tagCounts.get(name)}</span></button>`;
  }

  function renderTopics() {
    $("#primaryTopics").innerHTML = `<button type="button" class="topic-button" data-topic="" aria-pressed="${!state.category && !state.tag && !state.query}">全部<span class="topic-count">${articles.length}</span></button>` + primaryTags.map(topicButton).join("");
    $("#secondaryTopics").innerHTML = secondaryTags.map(topicButton).join("");
    $("#secondaryTopics").hidden = !state.moreOpen;
    const more = $("#moreTopics");
    more.hidden = !secondaryTags.length;
    more.setAttribute("aria-expanded", String(state.moreOpen));
    more.textContent = `${state.moreOpen ? "收合" : "更多"}主題（${secondaryTags.length}）${state.moreOpen ? " ↑" : " ↓"}`;
  }

  function updateExplore() {
    const toggle = $("#exploreToggle");
    toggle.setAttribute("aria-expanded", String(state.exploreOpen));
    $("#explorePanel").hidden = !state.exploreOpen;
    $("#exploreActionText").textContent = state.exploreOpen ? "收合分類與主題" : "展開分類與主題";
    const condition = state.category || state.tag;
    $("#exploreCurrent").textContent = condition ? `目前方向：${condition}` : "";
    $("#exploreCurrent").hidden = !condition;
    storage.set("oaArticlesExploreOpen", state.exploreOpen ? "1" : "0");
  }

  function relevance(article, keyword) {
    const q = keyword.toLocaleLowerCase("zh-Hant");
    const title = article.title.toLocaleLowerCase("zh-Hant");
    if (title === q) return 120;
    if (title.includes(q)) return 90;
    if (article.tags.some((name) => name.toLocaleLowerCase("zh-Hant") === q)) return 70;
    if (article.categories.some((name) => name.toLocaleLowerCase("zh-Hant").includes(q))) return 50;
    if (article.description.toLocaleLowerCase("zh-Hant").includes(q)) return 25;
    return 0;
  }

  function filteredArticles() {
    let rows = articles.filter((article) => {
      if (state.category) return article.categories.includes(state.category);
      if (state.tag) return article.tags.includes(state.tag);
      if (state.query) {
        const haystack = [article.title, article.description, ...article.tags, ...article.categories].join(" ").toLocaleLowerCase("zh-Hant");
        return haystack.includes(state.query.toLocaleLowerCase("zh-Hant"));
      }
      return true;
    });
    if (state.query) rows = rows.slice().sort((a, b) => relevance(b, state.query) - relevance(a, state.query));
    return rows;
  }

  function articleCard(article) {
    return `<a class="article-card" href="${escapeHtml(article.url)}">
      <div class="article-media">${imageMarkup(article, "article-image", false)}</div>
      <div class="article-copy">
        ${tagsMarkup(cardLabels(article))}
        <h3>${escapeHtml(article.title)}</h3>
        <span class="article-date">${escapeHtml(article.date)}・約 ${article.reading_minutes} 分鐘閱讀</span>
        <p>${escapeHtml(article.description)}</p>
        <span class="article-footer">閱讀文章 →</span>
      </div>
    </a>`;
  }

  function renderArticles() {
    const rows = filteredArticles();
    const shown = Math.min(state.visible, rows.length);
    const active = state.category || state.tag || state.query;
    $("#resultTitle").textContent = active ? "篩選結果" : "最新文章";
    $("#clearFilters").hidden = !active;

    let summary = `找到 ${rows.length} 篇文章`;
    if (state.category) summary = `<strong>${escapeHtml(categoryDescriptions[state.category])}</strong> ${summary}・${escapeHtml(state.category)}`;
    if (state.tag) summary += `・${escapeHtml(state.tag)}`;
    if (state.query) summary = `搜尋「${escapeHtml(state.query)}」：${summary}`;
    $("#resultsSummary").innerHTML = summary;

    const grid = $("#articleGrid");
    grid.innerHTML = rows.slice(0, state.visible).map(articleCard).join("");
    bindImageFallbacks(grid);

    $("#emptyState").hidden = rows.length > 0;
    grid.hidden = rows.length === 0;
    const load = $("#loadMore");
    load.hidden = shown >= rows.length;
    load.textContent = `再顯示 ${Math.min(PAGE_SIZE, rows.length - shown)} 篇（已顯示 ${shown}／${rows.length}）`;
    $("#allShown").hidden = !rows.length || shown < rows.length;
    $("#allShown").textContent = `已顯示全部 ${rows.length} 篇文章`;
  }

  function renderAll() {
    renderCategories();
    renderTopics();
    updateExplore();
    renderArticles();
  }

  $("#searchForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const value = $("#articleSearch").value.trim();
    if (value) setSingleFilter("query", value);
    else clearFilters();
  });

  $("#exploreToggle").addEventListener("click", () => {
    state.exploreOpen = !state.exploreOpen;
    updateExplore();
  });

  $("#moreTopics").addEventListener("click", () => {
    state.moreOpen = !state.moreOpen;
    renderTopics();
  });

  $("#clearFilters").addEventListener("click", () => clearFilters());
  $("#loadMore").addEventListener("click", () => {
    state.visible += PAGE_SIZE;
    writeUrl("replace");
    renderArticles();
  });

  document.addEventListener("click", (event) => {
    const categoryButton = event.target.closest("[data-category]");
    if (categoryButton) setSingleFilter("category", categoryButton.dataset.category);
    const topicButtonElement = event.target.closest("[data-topic]");
    if (topicButtonElement) {
      const topic = topicButtonElement.dataset.topic;
      if (topic) setSingleFilter("tag", topic);
      else clearFilters();
    }
    const quickCategory = event.target.closest("[data-quick-category]");
    if (quickCategory) setSingleFilter("category", quickCategory.dataset.quickCategory);
    const quickTag = event.target.closest("[data-quick-tag]");
    if (quickTag) setSingleFilter("tag", quickTag.dataset.quickTag);
    const emptyAction = event.target.closest("[data-empty-action]");
    if (emptyAction) {
      const value = emptyAction.dataset.emptyAction;
      if (value === "all") clearFilters();
      else setSingleFilter("tag", value);
    }
  });

  window.addEventListener("popstate", () => {
    readUrlState();
    $("#articleSearch").value = state.query;
    renderAll();
  });

  readUrlState();
  $("#articleSearch").value = state.query;
  renderEditorial();
  renderAll();
})();
