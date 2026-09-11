import express from 'express';

const app = express();
const port = process.env.PORT || 3000;

const USERNAME = (process.env.DEXCOM_USERNAME || '').trim();
const PASSWORD = (process.env.DEXCOM_PASSWORD || '').trim();
const BASE_URL = 'https://shareous1.dexcom.com/ShareWebServices/Services';
const APP_ID = 'd89443d2-327c-4a6f-89e5-496bbb0317db';

let sesionActiva = null;

const HEADERS_DEXCOM = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'User-Agent': 'Dexcom Share/3.0.2.11 CFNetwork/1408.0.4 Darwin/22.5.0'
};

async function obtenerSessionId() {
  const authRes = await fetch(`${BASE_URL}/General/AuthenticatePublisherAccountByName`, {
    method: 'POST',
    headers: HEADERS_DEXCOM,
    body: JSON.stringify({
      accountName: USERNAME,
      password: PASSWORD,
      applicationId: APP_ID
    })
  });

  const accId = (await authRes.text()).replace(/"/g, '').trim();

  if (accId && accId !== '00000000-0000-0000-0000-000000000000' && accId.length > 10) {
    const loginRes = await fetch(`${BASE_URL}/General/LoginPublisherAccountById`, {
      method: 'POST',
      headers: HEADERS_DEXCOM,
      body: JSON.stringify({
        accountId: accId,
        password: PASSWORD,
        applicationId: APP_ID
      })
    });

    const sid = (await loginRes.text()).replace(/"/g, '').trim();
    if (sid && sid !== '00000000-0000-0000-0000-000000000000') {
      sesionActiva = sid;
      return sid;
    }
  }

  const directRes = await fetch(`${BASE_URL}/General/LoginPublisherAccountByName`, {
    method: 'POST',
    headers: HEADERS_DEXCOM,
    body: JSON.stringify({
      accountName: USERNAME,
      password: PASSWORD,
      applicationId: APP_ID
    })
  });

  const directSid = (await directRes.text()).replace(/"/g, '').trim();
  sesionActiva = directSid;
  return directSid;
}

app.get('/datos', async (req, res) => {
  try {
    if (!sesionActiva) await obtenerSessionId();

    const url = `${BASE_URL}/Publisher/ReadPublisherLatestGlucoseValues?sessionId=${sesionActiva}&minutes=1440&maxCount=1`;
    let resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Length': '0',
        'User-Agent': 'Dexcom Share/3.0.2.11 CFNetwork/1408.0.4 Darwin/22.5.0'
      }
    });

    let texto = await resp.text();

    if (texto.includes('SessionIdNotFound') || texto.includes('ArgumentException')) {
      await obtenerSessionId();
      resp = await fetch(`${BASE_URL}/Publisher/ReadPublisherLatestGlucoseValues?sessionId=${sesionActiva}&minutes=1440&maxCount=1`, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Length': '0', 'User-Agent': 'Dexcom Share/3.0.2.11 CFNetwork/1408.0.4 Darwin/22.5.0' }
      });
      texto = await resp.text();
    }

    const data = JSON.parse(texto);
    if (Array.isArray(data) && data.length > 0) {
      const item = data[0];
      const match = item.ST ? item.ST.match(/\d+/) : null;
      const ts = match ? parseInt(match[0], 10) : Date.now();
      const mmol = parseFloat((item.Value / 18.018).toFixed(1));

      return res.json({
        mmol: mmol,
        tendencia: item.Trend,
        hora: new Date(ts).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })
      });
    }

    return res.status(404).json({ error: 'Sin datos disponibles' });
  } catch (err) {
    sesionActiva = null;
    return res.status(500).json({ error: err.message });
  }
});

const HTML_APP = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Glucosa">
  <title>Glucosa Monitor</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background-color: #121212; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; text-align: center; }
    .card { background: #1e1e1e; border-radius: 28px; padding: 35px 25px; width: 100%; max-width: 340px; box-shadow: 0 8px 30px rgba(0,0,0,0.6); transition: background 0.3s; }
    .hora { font-size: 15px; color: #888; font-weight: 500; }
    .valor { font-size: 82px; font-weight: 800; line-height: 1.1; margin: 15px 0 5px 0; }
    .unidad { font-size: 20px; color: #888; }
    .tendencia { font-size: 44px; margin: 8px 0; }
    .diferencia { font-size: 16px; font-weight: 600; color: #4dabf7; min-height: 24px; }
    .bg-baja { background-color: #8b0000 !important; }
    .bg-alta { background-color: #b8860b !important; }
    .controles { width: 100%; max-width: 340px; margin-top: 25px; background: #1e1e1e; border-radius: 18px; padding: 18px; }
    .fila { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-size: 15px; }
    input { width: 75px; background: #2a2a2a; border: none; color: #fff; padding: 8px; border-radius: 8px; font-size: 16px; text-align: center; }
    button { width: 100%; background: #007aff; color: #fff; border: none; padding: 12px; border-radius: 12px; font-weight: 600; font-size: 16px; cursor: pointer; }
  </style>
</head>
<body>
  <div class="card" id="card">
    <div class="hora" id="hora">Conectando...</div>
    <div class="valor" id="valor">--</div>
    <div class="unidad">mmol/L</div>
    <div class="tendencia" id="flecha"></div>
    <div class="diferencia" id="diff">--</div>
  </div>

  <div class="controles">
    <div class="fila">
      <label>Alarma baja (&le;):</label>
      <input type="number" id="bajo" step="0.1" value="4.2">
    </div>
    <div class="fila">
      <label>Alarma alta (&ge;):</label>
      <input type="number" id="alto" step="0.1" value="10.0">
    </div>
    <button onclick="activarAudio()">Activar sonido de alerta</button>
  </div>

  <script>
    var audioCtx = null;
    var flechas = { None:'→', DoubleUp:'⇈', SingleUp:'↑', FortyFiveUp:'↗', Flat:'→', FortyFiveDown:'↘', SingleDown:'↓', DoubleDown:'⇊' };

    function activarAudio() {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      sonar();
    }

    function sonar() {
      if (!audioCtx) return;
      try {
        var osc = audioCtx.createOscillator();
        var g = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        g.gain.setValueAtTime(0.3, audioCtx.currentTime);
        osc.connect(g);
        g.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
      } catch(e) {}
    }

    async function cargar() {
      try {
        var r = await fetch('/datos');
        var d = await r.json();

        if (d.mmol) {
          document.getElementById('valor').innerText = d.mmol.toFixed(1);
          document.getElementById('hora').innerText = d.hora;
          document.getElementById('flecha').innerText = flechas[d.tendencia] || '→';

          // Recuperar lectura anterior para calcular la variación
          var anterior = JSON.parse(localStorage.getItem('glucosa_anterior') || 'null');

          if (anterior && anterior.hora !== d.hora) {
            var diff = (d.mmol - anterior.mmol).toFixed(1);
            var signo = diff > 0 ? '+' : '';
            document.getElementById('diff').innerText = signo + diff + ' mmol/L vs anterior (' + anterior.hora + ')';
            localStorage.setItem('glucosa_anterior', JSON.stringify({ mmol: d.mmol, hora: d.hora }));
          } else if (!anterior) {
            document.getElementById('diff').innerText = 'Lectura inicial';
            localStorage.setItem('glucosa_anterior', JSON.stringify({ mmol: d.mmol, hora: d.hora }));
          }

          // Control de colores y aviso sonoro
          var vBajo = parseFloat(document.getElementById('bajo').value) || 4.2;
          var vAlto = parseFloat(document.getElementById('alto').value) || 10.0;
          var c = document.getElementById('card');

          if (d.mmol <= vBajo) {
            c.className = 'card bg-baja';
            sonar();
          } else if (d.mmol >= vAlto) {
            c.className = 'card bg-alta';
            sonar();
          } else {
            c.className = 'card';
          }
        }
      } catch (err) {
        document.getElementById('hora').innerText = 'Reintentando...';
      }
    }

    cargar();
    setInterval(cargar, 30000);
  </script>
</body>
</html>`;

app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(HTML_APP);
});

app.listen(port, () => console.log('Servidor en ejecución'));
