import express from 'express';

const app = express();
const port = process.env.PORT || 3000;

const USERNAME = (process.env.DEXCOM_USERNAME || '').trim();
const PASSWORD = (process.env.DEXCOM_PASSWORD || '').trim();
const BASE_URL = 'https://shareous1.dexcom.com/ShareWebServices/Services';
const APP_ID = 'd89443d2-327c-4a6f-89e5-496bbb0317db';

async function obtenerSessionId() {
  const authRes = await fetch(`${BASE_URL}/General/AuthenticatePublisherAccountByName`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'Dexcom Share/3.0.2.11'
    },
    body: JSON.stringify({
      accountName: USERNAME,
      password: PASSWORD,
      applicationId: APP_ID
    })
  });

  const accountIdRaw = await authRes.text();
  const accountId = accountIdRaw.replace(/"/g, '').trim();

  if (accountId && accountId !== '00000000-0000-0000-0000-000000000000' && accountId.length > 10) {
    const loginRes = await fetch(`${BASE_URL}/General/LoginPublisherAccountById`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Dexcom Share/3.0.2.11'
      },
      body: JSON.stringify({
        accountId: accountId,
        password: PASSWORD,
        applicationId: APP_ID
      })
    });

    const sessText = await loginRes.text();
    const sessionId = sessText.replace(/"/g, '').trim();
    if (sessionId && sessionId !== '00000000-0000-0000-0000-000000000000') {
      return sessionId;
    }
  }

  const directRes = await fetch(`${BASE_URL}/General/LoginPublisherAccountByName`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'Dexcom Share/3.0.2.11'
    },
    body: JSON.stringify({
      accountName: USERNAME,
      password: PASSWORD,
      applicationId: APP_ID
    })
  });

  const directText = await directRes.text();
  const directSessionId = directText.replace(/"/g, '').trim();

  if (!directSessionId || directSessionId === '00000000-0000-0000-0000-000000000000' || directSessionId.length < 10) {
    throw new Error('Credenciales rechazadas por Dexcom.');
  }

  return directSessionId;
}

// Endpoint que pide SOLO 1 valor (el actual) y lo pasa a mmol/L
app.get('/glucosa', async (req, res) => {
  try {
    const sessionId = await obtenerSessionId();

    const queryUrl = `${BASE_URL}/Publisher/ReadPublisherLatestGlucoseValues?sessionId=${sessionId}&minutes=1440&maxCount=1`;
    const resp = await fetch(queryUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Length': '0',
        'User-Agent': 'Dexcom Share/3.0.2.11'
      }
    });

    const bodyTexto = await resp.text();
    const lecturas = JSON.parse(bodyTexto);

    if (Array.isArray(lecturas) && lecturas.length > 0) {
      const item = lecturas[0];
      const match = item.ST ? item.ST.match(/\d+/) : null;
      const ts = match ? parseInt(match[0], 10) : Date.now();
      const mmolCalculado = parseFloat((item.Value / 18.018).toFixed(1));

      return res.json({
        mmol: mmolCalculado,
        mgdl: item.Value,
        tendencia: item.Trend,
        hora: new Date(ts).toLocaleTimeString('de-DE', {
          timeZone: 'Europe/Berlin',
          hour: '2-digit',
          minute: '2-digit'
        }),
        timestamp: ts
      });
    }

    return res.status(404).json({ error: 'Sin datos disponibles' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

const HTML_CONTENT = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <title>Glucosa</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background-color: #121212; color: #fff; display: flex; flex-direction: column; align-items: center; min-height: 100vh; padding: 20px; text-align: center; }
    .card { background: #1e1e1e; border-radius: 20px; padding: 25px; width: 100%; max-width: 360px; margin-top: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); transition: background 0.3s; }
    .valor { font-size: 72px; font-weight: 800; line-height: 1; margin: 10px 0; }
    .unidad { font-size: 18px; color: #888; }
    .tendencia { font-size: 34px; margin-top: 5px; }
    .hora { font-size: 14px; color: #aaa; }
    .diferencia { font-size: 15px; margin-top: 12px; font-weight: 600; color: #4dabf7; }
    .bg-alerta-baja { background-color: #8b0000 !important; }
    .bg-alerta-alta { background-color: #b8860b !important; }
    .bg-normal { background-color: #1e1e1e !important; }
    
    .seccion { width: 100%; max-width: 360px; margin-top: 20px; text-align: left; }
    h3 { font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: #777; margin-bottom: 8px; }
    
    .lista { background: #1e1e1e; border-radius: 14px; padding: 10px 15px; }
    .fila { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #2a2a2a; font-size: 14px; }
    .fila:last-child { border-bottom: none; }
    
    .controles { background: #1e1e1e; border-radius: 14px; padding: 15px; display: flex; flex-direction: column; gap: 10px; }
    .input-group { display: flex; justify-content: space-between; align-items: center; font-size: 14px; }
    input[type="number"] { width: 75px; background: #2a2a2a; border: none; color: #fff; padding: 6px 10px; border-radius: 8px; font-size: 16px; text-align: center; }
    button { background: #007aff; color: #fff; border: none; padding: 12px; border-radius: 12px; font-weight: 600; font-size: 15px; cursor: pointer; margin-top: 5px; }
  </style>
</head>
<body>

  <div class="card" id="cardPrincipal">
    <div class="hora" id="horaLectura">Conectando...</div>
    <div class="valor" id="valorGlucosa">--</div>
    <div class="unidad">mmol/L</div>
    <div class="tendencia" id="flechaTendencia"></div>
    <div class="diferencia" id="deltaValor">Calculando variación...</div>
  </div>

  <div class="seccion">
    <h3>Últimas 6 lecturas guardadas</h3>
    <div class="lista" id="listaHistorial">
      <div style="color:#666; font-size:13px; text-align:center;">Esperando datos...</div>
    </div>
  </div>

  <div class="seccion">
    <h3>Alarmas (mmol/L)</h3>
    <div class="controles">
      <div class="input-group">
        <label>Alarma Baja (&le;):</label>
        <input type="number" id="limiteBajo" step="0.1" value="4.2">
      </div>
      <div class="input-group">
        <label>Alarma Alta (&ge;):</label>
        <input type="number" id="limiteAlto" step="0.1" value="10.0">
      </div>
      <button onclick="activarSonido()">Activar Alarma Sonora</button>
    </div>
  </div>

  <script>
    var audioContext = null;
    var flechas = {
      None: '→',
      DoubleUp: '⇈',
      SingleUp: '↑',
      FortyFiveUp: '↗',
      Flat: '→',
      FortyFiveDown: '↘',
      SingleDown: '↓',
      DoubleDown: '⇊'
    };

    function activarSonido() {
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      sonarAlarma();
    }

    function sonarAlarma() {
      if (!audioContext) return;
      try {
        var osc = audioContext.createOscillator();
        var gain = audioContext.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, audioContext.currentTime);
        gain.gain.setValueAtTime(0.3, audioContext.currentTime);
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.start();
        osc.stop(audioContext.currentTime + 0.4);
      } catch (e) {}
    }

    async function actualizar() {
      try {
        var res = await fetch('/glucosa');
        var actual = await res.json();

        if (actual.mmol) {
          document.getElementById('valorGlucosa').innerText = actual.mmol.toFixed(1);
          document.getElementById('horaLectura').innerText = actual.hora;
          document.getElementById('flechaTendencia').innerText = flechas[actual.tendencia] || '→';

          // 1. Recuperar historial local guardado en el iPhone
          var historial = JSON.parse(localStorage.getItem('glucosa_historial') || '[]');

          // 2. Solo añadirlo si es una lectura nueva (comprobando la hora/timestamp)
          if (historial.length === 0 || historial[0].hora !== actual.hora) {
            historial.unshift(actual);
            // Mantener un máximo de 6 valores
            if (historial.length > 6) {
              historial = historial.slice(0, 6);
            }
            // Guardar permanentemente en la memoria del móvil
            localStorage.setItem('glucosa_historial', JSON.stringify(historial));
          }

          // 3. Comparar con el valor anterior
          if (historial.length > 1) {
            var previo = historial[1];
            var diff = (actual.mmol - previo.mmol).toFixed(1);
            var signo = diff > 0 ? '+' : '';
            document.getElementById('deltaValor').innerText = signo + diff + ' mmol/L vs anterior (' + previo.hora + ')';
          } else {
            document.getElementById('deltaValor').innerText = 'Primera lectura registrada (sin anterior aún)';
          }

          // 4. Dibujar la lista de los últimos 6 valores
          var lista = document.getElementById('listaHistorial');
          var filas = '';
          for (var i = 0; i < historial.length; i++) {
            var h = historial[i];
            filas += '<div class="fila">' +
              '<span>' + h.hora + '</span>' +
              '<span style="font-weight:600;">' + h.mmol.toFixed(1) + ' mmol/L</span>' +
              '<span>' + (flechas[h.tendencia] || '→') + '</span>' +
            '</div>';
          }
          lista.innerHTML = filas;

          // 5. Comprobar alarmas
          var bajo = parseFloat(document.getElementById('limiteBajo').value) || 4.2;
          var alto = parseFloat(document.getElementById('limiteAlto').value) || 10.0;
          var card = document.getElementById('cardPrincipal');

          if (actual.mmol <= bajo) {
            card.className = 'card bg-alerta-baja';
            sonarAlarma();
          } else if (actual.mmol >= alto) {
            card.className = 'card bg-alerta-alta';
            sonarAlarma();
          } else {
            card.className = 'card bg-normal';
          }
        }
      } catch (e) {
        document.getElementById('horaLectura').innerText = 'Error al conectar';
      }
    }

    actualizar();
    setInterval(actualizar, 30000);
  </script>
</body>
</html>`;

app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(HTML_CONTENT);
});

app.listen(port, () => {
  console.log(`Servidor activo en puerto ${port}`);
});
