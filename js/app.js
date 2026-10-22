import {
  addDays,
  enumerateDateKeys,
  formatFullDate,
  formatShortDate,
  friendlySelectedDate,
  getWeekdayInitial,
  getWeekdayName,
  isFutureDate,
  millisecondsUntilNextMidnight,
  todayKey,
} from "./date-utils.js";
import { getQuoteForDate } from "./quotes.js";
import {
  buildCheckInIndex,
  getBestCurrentStreak,
  getCompletionForDate,
  getCurrentStreak,
  getDailyTrend,
  getGlobalLongestStreak,
  getHabitDates,
  getHabitStats,
  getHeatmapIntensity,
  getRangeCompletion,
  isChecked,
} from "./stats.js";
import {
  AppError,
  createHabit,
  deleteHabit,
  fetchUserData,
  getConfigStatus,
  setCheckIn,
  updateHabit,
} from "./supabase-service.js";

const EMOJIS = [
  "🌱",
  "📚",
  "🏃",
  "💧",
  "🧘",
  "✍️",
  "🌙",
  "☀️",
  "🎯",
  "🎵",
  "🥗",
  "💪",
];

const COLORS = [
  { value: "sage", label: "鼠尾草", hex: "#5b7f6b" },
  { value: "sun", label: "暖阳", hex: "#d99a43" },
  { value: "coral", label: "珊瑚", hex: "#c66f5d" },
  { value: "sky", label: "晴空", hex: "#5f86a5" },
  { value: "lavender", label: "薰衣草", hex: "#84729e" },
  { value: "ink", label: "墨色", hex: "#415352" },
];

const COLOR_VALUES = new Set(COLORS.map((color) => color.value));

const state = {
  phase: "loading",
  view: viewFromHash(),
  selectedDate: todayKey(),
  lastKnownToday: todayKey(),
  habits: [],
  checkIns: [],
  user: null,
  error: null,
  pendingCheckIns: new Set(),
  editingHabitId: null,
  deletingHabitId: null,
};

let midnightTimer = null;
let toastTimer = null;
let formIsSubmitting = false;
let deleteIsSubmitting = false;

const appRoot = document.querySelector("#app");
const habitDialog = document.querySelector("#habit-dialog");
const deleteDialog = document.querySelector("#delete-dialog");
const habitForm = document.querySelector("#habit-form");
const habitFormError = document.querySelector("#habit-form-error");
const habitSubmitButton = document.querySelector("#habit-submit");
const deleteFormError = document.querySelector("#delete-form-error");
const deleteSubmitButton = document.querySelector("#delete-submit");
const toastRoot = document.querySelector("#toast-root");

function viewFromHash() {
  return window.location.hash === "#stats" ? "stats" : "today";
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character],
  );
}

function icon(name, className = "") {
  const paths = {
    leaf:
      '<path d="M20 4C12 5 6 10 5 19c9 1 15-5 15-15Z"/><path d="M5 19c3-5 7-8 12-11"/>',
    calendar:
      '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
    chart:
      '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    edit: '<path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z"/><path d="m14 7 3 3"/>',
    trash:
      '<path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    cloud:
      '<path d="M7 18h10a4 4 0 0 0 .6-7.9A6 6 0 0 0 6.1 9 4.5 4.5 0 0 0 7 18Z"/><path d="m9.5 13 2 2 3.5-4"/>',
    sparkles:
      '<path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4L12 3Z"/><path d="m18.5 14 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/>',
    arrow: '<path d="M5 12h14M14 7l5 5-5 5"/>',
    calendarCheck:
      '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18m-12 5 2 2 4-4"/>',
  };

  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? ""}</svg>`;
}

function brandMarkup(compact = false) {
  return `
    <a class="brand ${compact ? "brand-compact" : ""}" href="#today" aria-label="微习惯首页">
      <span class="brand-symbol" aria-hidden="true">
        <span></span>
      </span>
      <span class="brand-copy">
        <strong>微习惯</strong>
        ${compact ? "" : "<small>每天进步一点点</small>"}
      </span>
    </a>
  `;
}

function navigationMarkup(mobile = false) {
  const activeToday = state.view === "today";
  const activeStats = state.view === "stats";

  if (mobile) {
    return `
      <nav class="bottom-nav" aria-label="主要导航">
        <a href="#today" class="bottom-nav-item ${activeToday ? "is-active" : ""}" ${
          activeToday ? 'aria-current="page"' : ""
        }>
          ${icon("calendarCheck")}
          <span>今天</span>
        </a>
        <button class="bottom-nav-add" type="button" data-action="add-habit" aria-label="添加习惯">
          ${icon("plus")}
        </button>
        <a href="#stats" class="bottom-nav-item ${activeStats ? "is-active" : ""}" ${
          activeStats ? 'aria-current="page"' : ""
        }>
          ${icon("chart")}
          <span>统计</span>
        </a>
      </nav>
    `;
  }

  return `
    <nav class="side-nav" aria-label="主要导航">
      <a href="#today" class="side-nav-item ${activeToday ? "is-active" : ""}" ${
        activeToday ? 'aria-current="page"' : ""
      }>
        <span class="side-nav-icon">${icon("calendarCheck")}</span>
        <span>今天</span>
      </a>
      <a href="#stats" class="side-nav-item ${activeStats ? "is-active" : ""}" ${
        activeStats ? 'aria-current="page"' : ""
      }>
        <span class="side-nav-icon">${icon("chart")}</span>
        <span>统计</span>
      </a>
    </nav>
  `;
}

function renderShell(content) {
  return `
    <div class="app-shell">
      <aside class="sidebar">
        ${brandMarkup()}
        <button class="button button-primary sidebar-add" type="button" data-action="add-habit">
          ${icon("plus")}
          <span>添加习惯</span>
        </button>
        ${navigationMarkup()}
        <div class="sidebar-footer">
          <div class="cloud-status">
            <span class="cloud-icon">${icon("cloud")}</span>
            <div>
              <strong>云端已连接</strong>
              <span>匿名账户 · 仅本浏览器</span>
            </div>
          </div>
          <p>微小，但持续。</p>
        </div>
      </aside>

      <div class="mobile-topbar">
        ${brandMarkup(true)}
        <button class="icon-button mobile-add" type="button" data-action="add-habit" aria-label="添加习惯">
          ${icon("plus")}
        </button>
      </div>

      <main id="main-content" class="main-content" tabindex="-1">
        ${content}
      </main>
      ${navigationMarkup(true)}
    </div>
  `;
}

function renderLoading() {
  return `
    <div class="boot-screen">
      <div class="boot-mark" aria-hidden="true">微</div>
      <p>正在整理今天的小进步…</p>
    </div>
  `;
}

function renderStatusPage(title, message, detail = "", options = {}) {
  const isSetup = options.setup;

  return `
    <main id="main-content" class="status-page" tabindex="-1">
      <section class="status-card">
        <div class="status-brand">${brandMarkup()}</div>
        <div class="status-illustration ${isSetup ? "is-setup" : ""}" aria-hidden="true">
          <span class="status-orbit"></span>
          <span class="status-leaf">${icon("leaf")}</span>
          <span class="status-dot"></span>
        </div>
        <p class="eyebrow">${isSetup ? "开始之前" : "连接遇到问题"}</p>
        <h1>${escapeHtml(title)}</h1>
        <p class="status-message">${escapeHtml(message)}</p>
        ${detail ? `<p class="status-detail">${escapeHtml(detail)}</p>` : ""}

        ${
          isSetup
            ? `
              <ol class="setup-steps">
                <li><span>01</span><p>创建 Supabase 项目，并启用匿名登录。</p></li>
                <li><span>02</span><p>在 SQL Editor 中执行 <code>supabase/schema.sql</code>。</p></li>
                <li><span>03</span><p>把 Project URL 与 Publishable key 填进 <code>config.js</code>。</p></li>
              </ol>
              <div class="status-actions">
                <a class="button button-primary" href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">
                  打开 Supabase ${icon("arrow")}
                </a>
                <a class="button button-ghost" href="./README.md" target="_blank">查看配置说明</a>
              </div>
            `
            : `
              <div class="status-actions">
                <button class="button button-primary" type="button" data-action="retry">
                  重新连接
                </button>
                <a class="button button-ghost" href="./README.md" target="_blank">查看排查说明</a>
              </div>
            `
        }
      </section>
    </main>
  `;
}

function renderTodayView() {
  const index = buildCheckInIndex(state.checkIns);
  const quote = getQuoteForDate(state.selectedDate);
  const totals = getCompletionForDate(
    state.habits,
    index,
    state.selectedDate,
  );
  const today = todayKey();
  const viewingToday = state.selectedDate === today;
  const nextDisabled = state.selectedDate >= today;
  const bestStreak = getBestCurrentStreak(state.habits, index, today);
  const remaining = Math.max(0, totals.eligible - totals.completed);
  const allComplete = totals.eligible > 0 && remaining === 0;

  return `
    <header class="view-header today-header">
      <div class="view-heading">
        <p class="eyebrow">${viewingToday ? "每日小步" : "回看记录"}</p>
        <h1>${viewingToday ? "把今天，过得清楚一点。" : "每一天，都算数。"}</h1>
        <p class="view-subtitle">
          ${viewingToday ? "不必做得很多，只要开始了就好。" : `正在查看 ${formatShortDate(state.selectedDate)} 的记录。`}
        </p>
      </div>

      <div class="date-switcher" aria-label="切换日期">
        <button class="icon-button" type="button" data-action="change-date" data-offset="-1" aria-label="前一天">
          ${icon("left")}
        </button>
        <div class="date-display" tabindex="-1" aria-live="polite">
          <span>${escapeHtml(formatFullDate(state.selectedDate))}</span>
          ${viewingToday ? "<small>今天</small>" : `<small>${escapeHtml(friendlySelectedDate(state.selectedDate))}</small>`}
        </div>
        <button class="icon-button" type="button" data-action="change-date" data-offset="1" aria-label="后一天" ${
          nextDisabled ? "disabled" : ""
        }>
          ${icon("right")}
        </button>
        ${
          viewingToday
            ? ""
            : '<button class="today-jump" type="button" data-action="go-today">回到今天</button>'
        }
      </div>
    </header>

    <article class="quote-banner" aria-label="每日名言">
      <span class="quote-glyph" aria-hidden="true">“</span>
      <div class="quote-copy">
        <p>${escapeHtml(quote.text)}</p>
        <footer>
          <span>${escapeHtml(quote.author)}</span>
          ${quote.source ? `<small>${escapeHtml(quote.source)}</small>` : ""}
        </footer>
      </div>
      <span class="quote-decoration" aria-hidden="true">${icon("leaf")}</span>
    </article>

    <section class="overview-grid" aria-label="当日概览">
      <article class="overview-card progress-overview">
        <div class="progress-ring" style="--progress: ${totals.percentage}">
          <div class="progress-ring-inner">
            <strong>${totals.percentage}<small>%</small></strong>
            <span>${viewingToday ? "今日完成" : "当日完成"}</span>
          </div>
        </div>
        <div class="overview-copy">
          <p class="overview-label">${escapeHtml(friendlySelectedDate(state.selectedDate))}的进度</p>
          <h2>${totals.eligible ? `完成 ${totals.completed} / ${totals.eligible} 个习惯` : "从第一个微习惯开始"}</h2>
          <p>${getProgressMessage(totals, allComplete, viewingToday)}</p>
        </div>
      </article>

      <article class="overview-card streak-overview">
        <div class="streak-spark">${icon("sparkles")}</div>
        <div>
          <p class="overview-label">当前的坚持</p>
          <strong class="streak-number">${bestStreak}<small>天</small></strong>
          <p>${bestStreak ? "连续记录正在慢慢长大。" : "今天打卡后，连续记录就会开始。"}</p>
        </div>
      </article>
    </section>

    <section class="habits-section">
      <div class="section-heading">
        <div>
          <p class="eyebrow">${viewingToday ? "今天的选择" : "那天的记录"}</p>
          <h2>我的习惯 <span>${state.habits.length}</span></h2>
        </div>
        <button class="text-button" type="button" data-action="add-habit">
          ${icon("plus")} 添加
        </button>
      </div>
      ${
        state.habits.length
          ? `<div class="habit-list">${state.habits
              .map((habit) => renderHabitCard(habit, index))
              .join("")}</div>`
          : renderEmptyHabits()
      }
    </section>
  `;
}

function getProgressMessage(totals, allComplete, viewingToday) {
  if (!totals.eligible) {
    return "创建一个小到不可能失败的习惯，然后按下第一次打卡。";
  }

  if (allComplete) {
    return viewingToday
      ? "今天的计划已经全部完成，给自己一点掌声。"
      : "这一天全部完成，做得很好。";
  }

  if (totals.completed === 0) {
    return viewingToday
      ? "先完成最小的那一个，剩下的会变得容易。"
      : "这一天还没有记录，也可以现在补上。";
  }

  return `再完成 ${totals.eligible - totals.completed} 个，今天就很完整了。`;
}

function renderHabitCard(habit, index) {
  const completed = isChecked(index, habit.id, state.selectedDate);
  const viewingToday = state.selectedDate === todayKey();
  const dateSet = getHabitDates(index, habit.id);
  const streak = getCurrentStreak(dateSet, todayKey());
  const weekDates = enumerateDateKeys(state.selectedDate, 7);
  const pending = state.pendingCheckIns.has(
    checkInPendingKey(habit.id, state.selectedDate),
  );
  const color = COLOR_VALUES.has(habit.color) ? habit.color : "sage";

  return `
    <article class="habit-card tone-${color} ${completed ? "is-complete" : ""}">
      <div class="habit-icon" aria-hidden="true">${escapeHtml(habit.emoji)}</div>

      <div class="habit-info">
        <div class="habit-title-row">
          <h3>${escapeHtml(habit.name)}</h3>
          <span class="streak-badge">
            ${icon("sparkles")}
            ${streak ? `${streak} 天` : "今天开始"}
          </span>
        </div>
        <div class="habit-week" aria-label="最近七天打卡记录">
          ${weekDates
            .map((dateKey) => {
              const checked = dateSet.has(dateKey);
              const isSelected = dateKey === state.selectedDate;
              const label = `${formatShortDate(dateKey)} ${getWeekdayName(dateKey)}，${
                checked ? "已打卡" : "未打卡"
              }`;
              return `<span class="habit-day ${checked ? "is-checked" : ""} ${
                isSelected ? "is-selected" : ""
              }" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">
                <small>${getWeekdayInitial(dateKey)}</small>
                <i>${checked ? icon("check") : ""}</i>
              </span>`;
            })
            .join("")}
        </div>
      </div>

      <button
        class="check-button ${completed ? "is-checked" : ""}"
        type="button"
        data-action="toggle-checkin"
        data-habit-id="${escapeHtml(habit.id)}"
        aria-label="${completed ? "撤销" : viewingToday ? "完成" : "补打"}“${escapeHtml(habit.name)}”的打卡"
        aria-pressed="${completed}"
        ${pending ? "disabled" : ""}
      >
        <span class="check-button-icon">${completed ? icon("check") : icon("plus")}</span>
        <span>${pending ? "保存中" : completed ? "已打卡" : viewingToday ? "打卡" : "补打卡"}</span>
      </button>

      <details class="habit-menu">
        <summary class="icon-button" aria-label="更多操作">${icon("more")}</summary>
        <div class="habit-menu-panel">
          <button type="button" data-action="edit-habit" data-habit-id="${escapeHtml(habit.id)}">
            ${icon("edit")} 编辑习惯
          </button>
          <button class="is-danger" type="button" data-action="delete-habit" data-habit-id="${escapeHtml(habit.id)}">
            ${icon("trash")} 删除习惯
          </button>
        </div>
      </details>
    </article>
  `;
}

function renderEmptyHabits() {
  return `
    <div class="empty-state">
      <div class="empty-illustration" aria-hidden="true">
        <span class="empty-pot"></span>
        <span class="empty-sprout">${icon("leaf")}</span>
      </div>
      <h3>还没有习惯</h3>
      <p>从一杯水、一页书，或者五分钟的伸展开始。</p>
      <button class="button button-primary" type="button" data-action="add-habit">
        ${icon("plus")} 创建第一个习惯
      </button>
    </div>
  `;
}

function renderStatsView() {
  if (!state.habits.length) {
    return `
      <header class="view-header stats-header">
        <div class="view-heading">
          <p class="eyebrow">看见变化</p>
          <h1>每一道痕迹，都是你走过的路。</h1>
          <p class="view-subtitle">有了打卡记录后，这里会慢慢长出你的成长曲线。</p>
        </div>
      </header>
      <div class="empty-state stats-empty">
        <div class="stats-empty-art" aria-hidden="true">
          <span></span><span></span><span></span><span></span><span></span>
        </div>
        <h3>统计数据还在等待第一笔记录</h3>
        <p>先创建一个习惯，完成今天的打卡吧。</p>
        <button class="button button-primary" type="button" data-action="add-habit">
          ${icon("plus")} 创建习惯
        </button>
      </div>
    `;
  }

  const today = todayKey();
  const index = buildCheckInIndex(state.checkIns);
  const bestStreak = getBestCurrentStreak(state.habits, index, today);
  const longestStreak = getGlobalLongestStreak(state.habits, index);
  const todayCompletion = getCompletionForDate(state.habits, index, today);
  const weekCompletion = getRangeCompletion(state.habits, index, today, 7);
  const trend = getDailyTrend(state.habits, index, today, 7);
  const maxDaily = Math.max(...trend.map((day) => day.eligible), 1);
  const heatmapDates = enumerateDateKeys(today, 30);

  return `
    <header class="view-header stats-header">
      <div class="view-heading">
        <p class="eyebrow">看见变化</p>
        <h1>每一次坚持，都有迹可循。</h1>
        <p class="view-subtitle">数据不会催促你，它只是安静地记录你已经走了多远。</p>
      </div>
      <div class="stats-date">截至 ${escapeHtml(formatFullDate(today))}</div>
    </header>

    <section class="metric-grid" aria-label="核心统计">
      ${renderMetricCard("当前最佳连续", bestStreak, "天", "火焰般的稳定", "streak")}
      ${renderMetricCard("今日完成率", todayCompletion.percentage, "%", `${todayCompletion.completed} / ${todayCompletion.eligible} 个习惯`, "today")}
      ${renderMetricCard("近 7 天完成率", weekCompletion.percentage, "%", `${weekCompletion.completed} 次完成`, "week")}
      ${renderMetricCard("历史最长连续", longestStreak, "天", "你曾抵达的地方", "record")}
    </section>

    <section class="analytics-grid">
      <article class="data-card trend-card">
        <div class="data-card-heading">
          <div>
            <p class="eyebrow">最近七天</p>
            <h2>每日完成</h2>
          </div>
          <span class="chart-legend"><i></i> 已完成</span>
        </div>
        <div class="bar-chart" role="img" aria-label="最近七天每日完成数量柱状图">
          ${trend
            .map((day) => {
              const height = day.completed
                ? Math.max(12, (day.completed / maxDaily) * 100)
                : 4;
              const isToday = day.dateKey === today;
              return `
                <div class="bar-column ${isToday ? "is-today" : ""}">
                  <span class="bar-value">${day.completed || ""}</span>
                  <div class="bar-track">
                    <span class="bar-fill" style="--bar-height: ${height}%"></span>
                  </div>
                  <span class="bar-label">${getWeekdayInitial(day.dateKey)}</span>
                </div>
              `;
            })
            .join("")}
        </div>
      </article>

      <article class="data-card heatmap-card">
        <div class="data-card-heading">
          <div>
            <p class="eyebrow">最近三十天</p>
            <h2>打卡足迹</h2>
          </div>
          <div class="heat-legend" aria-label="颜色越深表示完成度越高">
            <span>少</span>
            <i></i><i></i><i></i><i></i>
            <span>多</span>
          </div>
        </div>
        <div class="heatmap" aria-label="最近三十天整体完成度">
          ${heatmapDates
            .map((dateKey) => {
              const completion = getCompletionForDate(
                state.habits,
                index,
                dateKey,
              );
              const level = getHeatmapIntensity(completion.percentage);
              const label = `${formatShortDate(dateKey)}：完成 ${completion.completed}/${completion.eligible}`;
              return `<span class="heat-cell level-${level}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"></span>`;
            })
            .join("")}
        </div>
        <div class="heatmap-caption">
          <span>${escapeHtml(formatShortDate(heatmapDates[0]))}</span>
          <span>${escapeHtml(formatShortDate(heatmapDates.at(-1)))}</span>
        </div>
      </article>
    </section>

    <section class="habit-breakdown">
      <div class="section-heading">
        <div>
          <p class="eyebrow">逐个看见</p>
          <h2>习惯表现</h2>
        </div>
        <span class="section-note">按创建顺序</span>
      </div>
      <div class="breakdown-list">
        ${state.habits
          .map((habit) => renderHabitBreakdown(habit, index, today))
          .join("")}
      </div>
    </section>
  `;
}

function renderMetricCard(label, value, unit, caption, tone) {
  return `
    <article class="metric-card metric-${tone}">
      <p>${escapeHtml(label)}</p>
      <strong>${value}<small>${unit}</small></strong>
      <span>${escapeHtml(caption)}</span>
    </article>
  `;
}

function renderHabitBreakdown(habit, index, today) {
  const stats = getHabitStats(habit, index, today);
  const color = COLOR_VALUES.has(habit.color) ? habit.color : "sage";
  const weekWidth = Math.max(stats.last7.percentage, stats.last7.eligible ? 3 : 0);

  return `
    <article class="breakdown-item tone-${color}">
      <div class="breakdown-icon" aria-hidden="true">${escapeHtml(habit.emoji)}</div>
      <div class="breakdown-main">
        <div class="breakdown-title">
          <h3>${escapeHtml(habit.name)}</h3>
          <span>连续 ${stats.currentStreak} 天 · 最长 ${stats.longestStreak} 天</span>
        </div>
        <div class="completion-row">
          <span>近 7 天</span>
          <div class="completion-track">
            <i style="--completion-width: ${weekWidth}%"></i>
          </div>
          <strong>${stats.last7.percentage}%</strong>
        </div>
      </div>
      <div class="breakdown-30">
        <strong>${stats.last30.percentage}%</strong>
        <span>近 30 天</span>
      </div>
    </article>
  `;
}

function render() {
  if (state.phase === "loading") {
    appRoot.innerHTML = renderLoading();
    return;
  }

  if (state.phase === "setup") {
    appRoot.innerHTML = renderStatusPage(
      "先连接你的云数据库",
      state.error?.message ?? "完成 Supabase 配置后就可以开始使用。",
      "所有配置都可以在浏览器中完成，不需要安装 Node.js。",
      { setup: true },
    );
    return;
  }

  if (state.phase === "error") {
    appRoot.innerHTML = renderStatusPage(
      state.error?.message ?? "暂时无法加载数据",
      state.error?.detail ?? "请稍后重试。",
      state.error?.code === "ANONYMOUS_AUTH_DISABLED"
        ? "设置路径：Supabase Dashboard → Authentication → Providers → Anonymous Sign-Ins。"
        : "",
    );
    return;
  }

  const content =
    state.view === "stats" ? renderStatsView() : renderTodayView();
  appRoot.innerHTML = renderShell(content);
  closeOpenHabitMenus();
}

function checkInPendingKey(habitId, dateKey) {
  return `${habitId}:${dateKey}`;
}

function showToast(message, tone = "success") {
  window.clearTimeout(toastTimer);
  toastRoot.replaceChildren();

  const toast = document.createElement("div");
  toast.className = `toast toast-${tone}`;
  toast.setAttribute("role", tone === "error" ? "alert" : "status");
  toast.textContent = message;
  toastRoot.append(toast);

  requestAnimationFrame(() => toast.classList.add("is-visible"));
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
    window.setTimeout(() => toast.remove(), 250);
  }, 3_200);
}

function closeOpenHabitMenus() {
  document.querySelectorAll(".habit-menu[open]").forEach((menu) => {
    menu.removeAttribute("open");
  });
}

function errorFromUnknown(error) {
  if (error instanceof AppError) {
    return error;
  }

  console.error("[微习惯] Unexpected error:", error);
  return new AppError("发生了一个意外错误。", {
    code: "UNEXPECTED",
    detail: "请刷新页面后重试。",
    cause: error,
  });
}

async function bootstrap() {
  state.phase = "loading";
  state.error = null;
  render();

  const configStatus = getConfigStatus();
  if (!configStatus.ready) {
    state.phase = "setup";
    state.error = new AppError(configStatus.message, {
      code: "CONFIG",
      detail: "请参考项目 README 完成 Supabase 初始化。",
    });
    render();
    return;
  }

  try {
    const data = await fetchUserData();
    state.user = data.user;
    state.habits = data.habits;
    state.checkIns = data.checkIns;
    state.selectedDate = todayKey();
    state.lastKnownToday = todayKey();
    state.phase = "ready";
    render();
    scheduleMidnightRefresh();
  } catch (error) {
    state.error = errorFromUnknown(error);
    state.phase = "error";
    render();
  }
}

function scheduleMidnightRefresh() {
  window.clearTimeout(midnightTimer);

  midnightTimer = window.setTimeout(() => {
    syncDateAfterPassage();
    scheduleMidnightRefresh();
  }, millisecondsUntilNextMidnight());
}

function syncDateAfterPassage() {
  const newToday = todayKey();

  if (newToday === state.lastKnownToday) {
    return;
  }

  if (
    state.selectedDate === state.lastKnownToday ||
    isFutureDate(state.selectedDate)
  ) {
    state.selectedDate = newToday;
  }

  state.lastKnownToday = newToday;
  render();
}

function populateDialogOptions() {
  const emojiOptions = document.querySelector("#emoji-options");
  emojiOptions.innerHTML = EMOJIS.map(
    (emoji) => `
      <button class="emoji-choice" type="button" data-emoji-choice="${emoji}" aria-label="选择 ${emoji}" aria-pressed="false">
        ${emoji}
      </button>
    `,
  ).join("");

  const colorOptions = document.querySelector("#color-options");
  colorOptions.innerHTML = COLORS.map(
    (color) => `
      <label class="color-choice" title="${color.label}">
        <input type="radio" name="color" value="${color.value}" ${
          color.value === "sage" ? "checked" : ""
        } />
        <span style="--swatch: ${color.hex}"></span>
        <small>${color.label}</small>
      </label>
    `,
  ).join("");
}

function setSelectedEmoji(emoji) {
  const emojiInput = document.querySelector("#habit-emoji");
  emojiInput.value = emoji;
  document.querySelectorAll("[data-emoji-choice]").forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.emojiChoice === emoji),
    );
  });
}

function openHabitDialog(mode, habit = null) {
  state.editingHabitId = mode === "edit" ? habit.id : null;
  document.querySelector("#habit-dialog-title").textContent =
    mode === "edit" ? "编辑习惯" : "添加习惯";
  habitSubmitButton.textContent = mode === "edit" ? "保存修改" : "保存习惯";
  habitFormError.textContent = "";
  habitForm.elements.name.value = habit?.name ?? "";
  setSelectedEmoji(habit?.emoji ?? "🌱");

  const selectedColor = COLOR_VALUES.has(habit?.color)
    ? habit.color
    : "sage";
  const colorInput = habitForm.querySelector(
    `input[name="color"][value="${selectedColor}"]`,
  );
  if (colorInput) {
    colorInput.checked = true;
  }

  if (!habitDialog.open) {
    habitDialog.showModal();
  }

  window.setTimeout(() => {
    habitForm.elements.name.focus();
    habitForm.elements.name.select();
  }, 50);
}

function closeDialog(dialog) {
  if (dialog?.open) {
    dialog.close();
  }
}

function openDeleteDialog(habit) {
  state.deletingHabitId = habit.id;
  document.querySelector("#delete-habit-name").textContent = habit.name;
  deleteFormError.textContent = "";
  deleteDialog.showModal();
  window.setTimeout(() => deleteSubmitButton.focus(), 50);
}

function setButtonBusy(button, busy, busyLabel, idleLabel) {
  button.disabled = busy;
  button.textContent = busy ? busyLabel : idleLabel;
}

async function handleHabitSubmit(event) {
  event.preventDefault();
  if (formIsSubmitting) {
    return;
  }

  const formData = new FormData(habitForm);
  const name = String(formData.get("name") ?? "").trim();
  const emoji = String(formData.get("emoji") ?? "").trim() || "🌱";
  const selectedColor = String(formData.get("color") ?? "sage");
  const color = COLOR_VALUES.has(selectedColor) ? selectedColor : "sage";

  if (!name) {
    habitFormError.textContent = "给这个习惯起一个名字吧。";
    habitForm.elements.name.focus();
    return;
  }

  if (Array.from(emoji).length > 8) {
    habitFormError.textContent = "图标最多输入 8 个字符。";
    habitForm.elements.emoji.focus();
    return;
  }

  formIsSubmitting = true;
  habitFormError.textContent = "";
  setButtonBusy(
    habitSubmitButton,
    true,
    "保存中…",
    state.editingHabitId ? "保存修改" : "保存习惯",
  );

  try {
    if (state.editingHabitId) {
      const updated = await updateHabit(state.editingHabitId, {
        name,
        emoji,
        color,
      });
      state.habits = state.habits.map((habit) =>
        habit.id === updated.id ? updated : habit,
      );
      showToast("习惯已经更新。");
    } else {
      const position = state.habits.reduce(
        (highest, habit) => Math.max(highest, habit.position),
        0,
      );
      const created = await createHabit({
        name,
        emoji,
        color,
        position: position + 1,
      });
      state.habits = [...state.habits, created];
      showToast("新习惯已经种下，今天就开始吧。");
    }

    closeDialog(habitDialog);
    render();
  } catch (error) {
    const appError = errorFromUnknown(error);
    habitFormError.textContent = appError.detail
      ? `${appError.message} ${appError.detail}`
      : appError.message;
  } finally {
    formIsSubmitting = false;
    setButtonBusy(
      habitSubmitButton,
      false,
      "保存中…",
      state.editingHabitId ? "保存修改" : "保存习惯",
    );
  }
}

async function handleDeleteSubmit() {
  if (deleteIsSubmitting || !state.deletingHabitId) {
    return;
  }

  deleteIsSubmitting = true;
  deleteFormError.textContent = "";
  setButtonBusy(deleteSubmitButton, true, "删除中…", "确认删除");

  try {
    await deleteHabit(state.deletingHabitId);
    state.habits = state.habits.filter(
      (habit) => habit.id !== state.deletingHabitId,
    );
    state.checkIns = state.checkIns.filter(
      (checkIn) => checkIn.habit_id !== state.deletingHabitId,
    );
    state.deletingHabitId = null;
    closeDialog(deleteDialog);
    showToast("习惯及其打卡记录已经删除。");
    render();
  } catch (error) {
    const appError = errorFromUnknown(error);
    deleteFormError.textContent = appError.message;
  } finally {
    deleteIsSubmitting = false;
    setButtonBusy(deleteSubmitButton, false, "删除中…", "确认删除");
  }
}

async function toggleCheckIn(habitId) {
  const dateKey = state.selectedDate;
  const pendingKey = checkInPendingKey(habitId, dateKey);

  if (state.pendingCheckIns.has(pendingKey)) {
    return;
  }

  const index = buildCheckInIndex(state.checkIns);
  const wasCompleted = isChecked(index, habitId, dateKey);
  const previousCheckIns = state.checkIns;
  state.pendingCheckIns.add(pendingKey);

  if (wasCompleted) {
    state.checkIns = state.checkIns.filter(
      (checkIn) =>
        !(checkIn.habit_id === habitId && checkIn.checked_date === dateKey),
    );
  } else {
    state.checkIns = [
      ...state.checkIns,
      {
        id: `optimistic-${habitId}-${dateKey}`,
        habit_id: habitId,
        checked_date: dateKey,
        created_at: new Date().toISOString(),
      },
    ];
  }

  render();

  try {
    await setCheckIn(habitId, dateKey, !wasCompleted);
    showToast(
      wasCompleted
        ? "已撤销打卡，随时可以再来一次。"
        : dateKey === todayKey()
          ? "打卡完成，今天又前进了一小步。"
          : "补打卡已保存。",
    );
  } catch (error) {
    state.checkIns = previousCheckIns;
    const appError = errorFromUnknown(error);
    showToast(appError.message, "error");
  } finally {
    state.pendingCheckIns.delete(pendingKey);
    render();
    document
      .querySelector(
        `[data-action="toggle-checkin"][data-habit-id="${habitId}"]`,
      )
      ?.focus();
  }
}

function handleDocumentClick(event) {
  const actionTarget = event.target.closest("[data-action]");
  const emojiTarget = event.target.closest("[data-emoji-choice]");

  if (emojiTarget) {
    setSelectedEmoji(emojiTarget.dataset.emojiChoice);
    return;
  }

  if (!actionTarget) {
    return;
  }

  const action = actionTarget.dataset.action;

  if (action === "add-habit") {
    closeOpenHabitMenus();
    openHabitDialog("add");
    return;
  }

  if (action === "edit-habit") {
    const habit = state.habits.find(
      (item) => item.id === actionTarget.dataset.habitId,
    );
    if (habit) {
      closeOpenHabitMenus();
      openHabitDialog("edit", habit);
    }
    return;
  }

  if (action === "delete-habit") {
    const habit = state.habits.find(
      (item) => item.id === actionTarget.dataset.habitId,
    );
    if (habit) {
      closeOpenHabitMenus();
      openDeleteDialog(habit);
    }
    return;
  }

  if (action === "toggle-checkin") {
    closeOpenHabitMenus();
    void toggleCheckIn(actionTarget.dataset.habitId);
    return;
  }

  if (action === "change-date") {
    const offset = Number(actionTarget.dataset.offset);

    const candidate = addDays(state.selectedDate, offset);
    if (candidate <= todayKey()) {
      state.selectedDate = candidate;
      render();
      const focusTarget =
        document.querySelector(
          `[data-action="change-date"][data-offset="${offset}"]:not(:disabled)`,
        ) ?? document.querySelector(".date-display");
      focusTarget?.focus();
    }
    return;
  }

  if (action === "go-today") {
    state.selectedDate = todayKey();
    render();
    document.querySelector(".date-display")?.focus();
    return;
  }

  if (action === "retry") {
    void bootstrap();
  }
}

function wireEvents() {
  populateDialogOptions();
  document.addEventListener("click", handleDocumentClick);
  habitForm.addEventListener("submit", (event) => {
    void handleHabitSubmit(event);
  });
  deleteSubmitButton.addEventListener("click", () => {
    void handleDeleteSubmit();
  });

  document.querySelectorAll("[data-dialog-close]").forEach((button) => {
    button.addEventListener("click", () => {
      closeDialog(document.querySelector(`#${button.dataset.dialogClose}`));
    });
  });

  [habitDialog, deleteDialog].forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) {
        closeDialog(dialog);
      }
    });
  });

  document.querySelector("#habit-emoji").addEventListener("input", (event) => {
    const value = event.target.value.trim();
    document.querySelectorAll("[data-emoji-choice]").forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.emojiChoice === value),
      );
    });
  });

  window.addEventListener("hashchange", () => {
    state.view = viewFromHash();
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      syncDateAfterPassage();
    }
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".habit-menu")) {
      closeOpenHabitMenus();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeOpenHabitMenus();
    }
  });
}

function initialize() {
  if (!window.location.hash) {
    window.history.replaceState(null, "", "#today");
  } else if (!["#today", "#stats"].includes(window.location.hash)) {
    window.history.replaceState(null, "", "#today");
  }

  state.view = viewFromHash();
  wireEvents();
  void bootstrap();
}

initialize();
