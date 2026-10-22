import { APP_CONFIG } from "../config.js";

const SUPABASE_JS_URL =
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

let connectionPromise = null;

export class AppError extends Error {
  constructor(message, options = {}) {
    super(message, { cause: options.cause });
    this.name = "AppError";
    this.code = options.code ?? "UNKNOWN";
    this.detail = options.detail ?? "";
  }
}

function configIsPlaceholder(value) {
  return (
    !value ||
    value.includes("YOUR_PROJECT_REF") ||
    value.includes("YOUR_PUBLISHABLE") ||
    value.includes("YOUR_ANON")
  );
}

function decodeJwtPayload(token) {
  try {
    const payload = token.split(".")[1];
    if (!payload) {
      return null;
    }

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function keyLooksSecret(key) {
  if (/^sb_secret_/i.test(key)) {
    return true;
  }

  const payload = decodeJwtPayload(key);
  return payload?.role === "service_role";
}

export function getConfigStatus() {
  const url = APP_CONFIG.supabaseUrl?.trim() ?? "";
  const key = APP_CONFIG.supabasePublishableKey?.trim() ?? "";

  if (configIsPlaceholder(url) || configIsPlaceholder(key)) {
    return {
      ready: false,
      message:
        "还没有配置 Supabase。请先在 config.js 中填写 Project URL 和 Publishable/anon key。",
    };
  }

  if (!url.startsWith("https://") || !url.includes(".supabase.co")) {
    return {
      ready: false,
      message: "Supabase Project URL 格式不正确，请从项目 API 设置中重新复制。",
    };
  }

  if (keyLooksSecret(key)) {
    return {
      ready: false,
      message:
        "检测到了 Supabase secret/service_role key。请立即删除它，并改用 Publishable 或 anon public key。",
    };
  }

  return { ready: true, message: "" };
}

function authErrorToAppError(error) {
  const message = error?.message ?? "";

  if (/anonymous.*disabled|anonymous sign-ins are disabled/i.test(message)) {
    return new AppError("Supabase 尚未启用匿名登录。", {
      code: "ANONYMOUS_AUTH_DISABLED",
      detail:
        "请在 Supabase 的 Authentication 设置中启用 Anonymous Sign-Ins，然后刷新页面。",
      cause: error,
    });
  }

  if (/failed to fetch|network|load failed/i.test(message)) {
    return new AppError("无法连接 Supabase。", {
      code: "NETWORK",
      detail:
        "请检查网络连接、Project URL 是否正确，以及浏览器是否阻止了第三方资源。",
      cause: error,
    });
  }

  return new AppError("匿名身份创建失败。", {
    code: "AUTH_FAILED",
    detail: message || "请检查 Supabase Auth 配置后重试。",
    cause: error,
  });
}

async function connect() {
  const status = getConfigStatus();
  if (!status.ready) {
    throw new AppError(status.message, {
      code: "CONFIG",
      detail: "完成配置并发布到 GitHub Pages 后刷新页面。",
    });
  }

  let createClient;

  try {
    ({ createClient } = await import(SUPABASE_JS_URL));
  } catch (error) {
    throw new AppError("Supabase 客户端加载失败。", {
      code: "SDK_LOAD_FAILED",
      detail:
        "无法从 CDN 加载 supabase-js，请检查网络连接后刷新页面。",
      cause: error,
    });
  }

  let client;

  try {
    const projectRef = new URL(APP_CONFIG.supabaseUrl.trim()).hostname.split(".")[0];
    client = createClient(
      APP_CONFIG.supabaseUrl.trim(),
      APP_CONFIG.supabasePublishableKey.trim(),
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          storageKey: `micro-habits-auth-${projectRef}`,
        },
      },
    );
  } catch (error) {
    throw new AppError("Supabase 配置无效。", {
      code: "CONFIG",
      detail: "请确认 URL 和 Publishable/anon key 完全一致。",
      cause: error,
    });
  }

  const {
    data: { session },
    error: sessionError,
  } = await client.auth.getSession();

  if (sessionError) {
    throw authErrorToAppError(sessionError);
  }

  let user = session?.user ?? null;

  if (!user) {
    const { data, error } = await client.auth.signInAnonymously();

    if (error) {
      throw authErrorToAppError(error);
    }

    user = data.user;
  }

  if (!user) {
    throw new AppError("未能创建匿名身份。", {
      code: "AUTH_NO_USER",
      detail: "请确认 Anonymous Sign-Ins 已启用后重试。",
    });
  }

  return { client, user };
}

export function getConnection() {
  if (!connectionPromise) {
    connectionPromise = connect().catch((error) => {
      connectionPromise = null;
      throw error;
    });
  }

  return connectionPromise;
}

function databaseErrorToAppError(error, fallback) {
  console.error("[微习惯] Supabase request failed:", error);

  if (error?.code === "23505") {
    return new AppError("这条记录已经存在。", {
      code: "DUPLICATE",
      cause: error,
    });
  }

  if (error?.code === "42501" || error?.code === "42P01") {
    return new AppError("云数据库权限或表结构尚未配置完成。", {
      code: "DATABASE_SETUP",
      detail:
        "请确认已经执行 schema.sql，并启用了 habits 与 check_ins 的 RLS 策略。",
      cause: error,
    });
  }

  if (/failed to fetch|network|load failed/i.test(error?.message ?? "")) {
    return new AppError("云端连接暂时不可用。", {
      code: "NETWORK",
      detail: "请检查网络连接后重试，本次操作没有保存。",
      cause: error,
    });
  }

  return new AppError(fallback, {
    code: "DATABASE_ERROR",
    detail: error?.message ?? "云端服务返回了未知错误。",
    cause: error,
  });
}

export async function fetchUserData() {
  const { client, user } = await getConnection();

  const [habitsResult, checkInsResult] = await Promise.all([
    client
      .from("habits")
      .select("id,user_id,name,emoji,color,position,created_at,updated_at")
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    client
      .from("check_ins")
      .select("id,user_id,habit_id,checked_date,created_at")
      .order("checked_date", { ascending: true }),
  ]);

  if (habitsResult.error) {
    throw databaseErrorToAppError(
      habitsResult.error,
      "读取习惯失败，请稍后重试。",
    );
  }

  if (checkInsResult.error) {
    throw databaseErrorToAppError(
      checkInsResult.error,
      "读取打卡记录失败，请稍后重试。",
    );
  }

  return {
    user,
    habits: habitsResult.data ?? [],
    checkIns: checkInsResult.data ?? [],
  };
}

export async function createHabit({ name, emoji, color, position }) {
  const { client, user } = await getConnection();
  const { data, error } = await client
    .from("habits")
    .insert({
      user_id: user.id,
      name: name.trim(),
      emoji,
      color,
      position,
    })
    .select("id,user_id,name,emoji,color,position,created_at,updated_at")
    .single();

  if (error) {
    throw databaseErrorToAppError(error, "创建习惯失败，请稍后重试。");
  }

  return data;
}

export async function updateHabit(habitId, { name, emoji, color }) {
  const { client } = await getConnection();
  const { data, error } = await client
    .from("habits")
    .update({ name: name.trim(), emoji, color })
    .eq("id", habitId)
    .select("id,user_id,name,emoji,color,position,created_at,updated_at")
    .single();

  if (error) {
    throw databaseErrorToAppError(error, "更新习惯失败，请稍后重试。");
  }

  return data;
}

export async function deleteHabit(habitId) {
  const { client } = await getConnection();
  const { error } = await client.from("habits").delete().eq("id", habitId);

  if (error) {
    throw databaseErrorToAppError(error, "删除习惯失败，请稍后重试。");
  }
}

export async function setCheckIn(habitId, dateKey, completed) {
  const { client, user } = await getConnection();

  if (completed) {
    const { error } = await client.from("check_ins").upsert(
      {
        user_id: user.id,
        habit_id: habitId,
        checked_date: dateKey,
      },
      {
        onConflict: "habit_id,checked_date",
        ignoreDuplicates: true,
      },
    );

    if (error) {
      throw databaseErrorToAppError(
        error,
        "打卡没有保存成功，请稍后重试。",
      );
    }

    return;
  }

  const { error } = await client
    .from("check_ins")
    .delete()
    .eq("habit_id", habitId)
    .eq("checked_date", dateKey);

  if (error) {
    throw databaseErrorToAppError(
      error,
      "撤销打卡失败，请稍后重试。",
    );
  }
}
