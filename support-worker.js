// Cloudflare Worker для формы поддержки MetroFlow.
// В настройках Worker добавьте secrets:
//   BOT_TOKEN      — новый токен Telegram-бота (не опубликованный в чате)
//   OWNER_CHAT_ID  — ваш числовой Telegram chat_id
// Разрешённый сайт: https://krylovmaksim42-beep.github.io

const ALLOWED_ORIGIN = "https://krylovmaksim42-beep.github.io";
const recentRequests = new Map();

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" }
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = cors(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }
    if (origin !== ALLOWED_ORIGIN) {
      return json({ ok: false, error: "Источник запроса не разрешён." }, 403, headers);
    }
    if (request.method !== "POST") {
      return json({ ok: false, error: "Метод не поддерживается." }, 405, headers);
    }
    if (!env.BOT_TOKEN || !env.OWNER_CHAT_ID) {
      return json({ ok: false, error: "Сервер поддержки ещё не настроен." }, 503, headers);
    }

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const now = Date.now();
    const previous = recentRequests.get(ip) || [];
    const active = previous.filter(time => now - time < 10 * 60 * 1000);
    if (active.length >= 5) {
      return json({ ok: false, error: "Слишком много обращений. Попробуйте позже." }, 429, headers);
    }

    let data;
    try {
      if (Number(request.headers.get("Content-Length") || 0) > 12000) {
        return json({ ok: false, error: "Сообщение слишком большое." }, 413, headers);
      }
      data = await request.json();
    } catch {
      return json({ ok: false, error: "Некорректный формат обращения." }, 400, headers);
    }

    const username = String(data.username || "").trim();
    const message = String(data.message || "").trim();
    if (!/^@[A-Za-z0-9_]{5,32}$/.test(username)) {
      return json({ ok: false, error: "Укажите корректный Telegram username." }, 400, headers);
    }
    if (message.length < 3 || message.length > 2000) {
      return json({ ok: false, error: "Сообщение должно содержать от 3 до 2000 символов." }, 400, headers);
    }

    const text = [
      "📩 Новое обращение MetroFlow",
      "",
      "Telegram: " + username,
      "",
      "Сообщение:",
      message
    ].join("\n");

    let telegramResponse;
    try {
      telegramResponse = await fetch("https://api.telegram.org/bot" + env.BOT_TOKEN + "/sendMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: env.OWNER_CHAT_ID,
          text,
          disable_web_page_preview: true
        })
      });
    } catch {
      return json({ ok: false, error: "Не удалось связаться с Telegram. Попробуйте позже." }, 502, headers);
    }

    const telegramResult = await telegramResponse.json().catch(() => ({}));
    if (!telegramResponse.ok || !telegramResult.ok) {
      return json({ ok: false, error: "Telegram не принял сообщение. Проверьте настройки бота." }, 502, headers);
    }

    active.push(now);
    recentRequests.set(ip, active);
    return json({ ok: true }, 200, headers);
  }
};
