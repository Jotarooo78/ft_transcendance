// Page de statut : interroge Prometheus (métrique "up") et affiche l'état de chaque service.
const http = require('node:http')

const PROM = process.env.PROMETHEUS_URL || 'http://prometheus:9090/monitoring/prometheus'

async function getStatus() {
  const res = await fetch(`${PROM}/api/v1/query?query=up`, { signal: AbortSignal.timeout(3000) })
  const body = await res.json()
  return body.data.result
    .map((r) => ({ name: r.metric.job, up: r.value[1] === '1' }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function render(services, error) {
  const all = !error && services.every((s) => s.up)
  const rows = services
    .map((s) => `<tr><td>${s.name}</td><td style="color:${s.up ? 'green' : 'red'}">${s.up ? 'Opérationnel' : 'En panne'}</td></tr>`)
    .join('')
  return `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="15">
<title>Statut</title><body style="font-family:sans-serif;max-width:480px;margin:2em auto">
<h1>${error ? 'Statut indisponible' : all ? 'Tous les systèmes sont opérationnels' : 'Incident en cours'}</h1>
<table cellpadding="6">${rows}</table><p><small>Mis à jour : ${new Date().toISOString()}</small></p></body>`
}

http
  .createServer(async (req, res) => {
    if (req.url === '/health') return res.end('ok')
    let services = []
    let error = false
    try {
      services = await getStatus()
    } catch {
      error = true
    }
    res.writeHead(error ? 503 : 200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(render(services, error))
  })
  .listen(8080)
