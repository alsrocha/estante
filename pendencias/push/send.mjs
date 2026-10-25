// Envia o "toque" diário para o celular. O texto da notificação é montado no próprio aparelho.
import webpush from "web-push";

const raw = process.env.PUSH_CONFIG;
if (!raw) {
  console.log("Secret PUSH_CONFIG não configurado; nada a enviar.");
  process.exit(0);
}
const cfg = JSON.parse(raw);
webpush.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey);
try {
  const r = await webpush.sendNotification(cfg.subscription, JSON.stringify({ tipo: "resumo" }), { TTL: 6 * 3600, urgency: "high" });
  console.log("Push enviado:", r.statusCode);
} catch (e) {
  console.error("Falha ao enviar:", e.statusCode, e.body || e.message);
  if (e.statusCode === 404 || e.statusCode === 410) console.error("A assinatura expirou. Gere uma nova configuração no app (Configurações › Push) e atualize o secret.");
  process.exit(1);
}
