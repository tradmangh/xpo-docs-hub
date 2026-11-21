// bridge/config.js
// Confirmed against Comentario v3.19.0 webhook specification (docs.comentario.app/en/kb/webhooks/).

module.exports = {
  WEBHOOK_HEADERS: {
    signature: 'x-comentario-signature',
    timestamp: 'x-comentario-timestamp',
    eventId: 'x-comentario-event-id',
    eventType: 'x-comentario-event'
  },
  STATUS_HEADER: 'x-signature',
  MAX_WEBHOOK_AGE_SEC: 300,
  LRU_CAPACITY: 1000,
  loadEnv () {
    return {
      port: Number(process.env.PORT || 8080),
      comentarioUrl: process.env.COMENTARIO_URL,
      botEmail: process.env.BOT_EMAIL,
      botPassword: process.env.BOT_PASSWORD,
      webhookSecret: process.env.WEBHOOK_SECRET,
      statusSecret: process.env.STATUS_SECRET,
      appId: process.env.APP_ID,
      appKey: process.env.APP_KEY,
      installationId: process.env.INSTALLATION_ID
    }
  }
}
