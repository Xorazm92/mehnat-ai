// =====================================================
// Next.js instrumentation — markazlashgan xato observability
// =====================================================
// Server-tomon so'rov xatolarini strukturali log qiladi va MONITORING_WEBHOOK_URL
// berilgan bo'lsa tashqi observability'ga yuboradi (Slack/Sentry-webhook/boshqa).
// Sozlanmagan bo'lsa — jim, faqat console. Sentry SDK kerak bo'lsa register()'ga
// ulanadi. Hech qachon throw qilmaydi (monitoring asosiy oqimni yiqitmasin).

export function register(): void {
  // Reserved: OpenTelemetry / Sentry init — DSN bo'lsa shu yerda.
}

interface ReqInfo {
  path?: string;
  method?: string;
}
interface CtxInfo {
  routerKind?: string;
  routePath?: string;
  routeType?: string;
}

export async function onRequestError(err: unknown, request: ReqInfo, context: CtxInfo): Promise<void> {
  const e = err as Error;
  const payload = {
    ts: new Date().toISOString(),
    message: e?.message ?? String(err),
    stack: e?.stack,
    path: request?.path,
    method: request?.method,
    route: context?.routePath,
    routerKind: context?.routerKind,
  };
  // Konsolga stack'siz qisqa qator (log-shovqinni kamaytirish uchun).
  console.error("[instrumentation] request error:", JSON.stringify({ ...payload, stack: undefined }));

  const url = process.env.MONITORING_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (postErr) {
    console.error("[instrumentation] webhook post failed:", (postErr as Error).message);
  }
}
