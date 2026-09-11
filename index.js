import express from 'express';

const app = express();
const port = process.env.PORT || 3000;

// Credenciales inyectadas de Render
const USERNAME = (process.env.DEXCOM_USERNAME || '').trim();
const PASSWORD = (process.env.DEXCOM_PASSWORD || '').trim();

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
    <div class="diferencia" id="deltaValor">Esperando lectura...</div>
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
    var sessionId = null;
    var APP_ID = 'd89443d2-327c-4a6f-89e5-496bbb0317db';
    var USERNAME = "${USERNAME}";
    var PASSWORD = "${PASSWORD}";

    // Proxy para saltar la restricción CORS desde el navegador del móvil
    var PROXY = 'https://corsproxy.io/?url=';
    var BASE_DEXCOM = 'https://shareous1.dexcom.com/ShareWebServices/Services';

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

    async function loginDexcom() {
      var target = encodeURIComponent(BASE_DEXCOM + '/General/LoginPublisherAccountByName');
      var res = await fetch(PROXY + target, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          accountName: USERNAME,
          password: PASSWORD,
          applicationId: APP_ID
        })
      });

      var text = await res.text();
      var sid = text.replace(/"/g, '').trim();
      if (!sid || sid === '00000000-0000-0000-0000-000000000000' || sid.length < 10) {
        // Intento 2 con Authenticate si el directo falla
        var authTarget = encodeURIComponent(BASE_DEXCOM + '/General/AuthenticatePublisherAccountByName');
        var authRes = await fetch(PROXY + authTarget, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ accountName: USERNAME, password: PASSWORD, applicationId: APP_ID })
        });
        var accId = (await authRes.text()).replace(/"/g, '').trim();

        var loginByIdTarget = encodeURIComponent(BASE_DEXCOM + '/General/LoginPublisherAccountById');
        var idRes = await fetch(PROXY + loginByIdTarget, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ accountId: accId, password: PASSWORD, applicationId: APP_ID })
        });
        sid = (await idRes.text()).replace(/"/g, '').trim();
      }

      sessionId = sid;
      return sid;
    }

    async function obtenerGlucosa() {
      try {
        if (!sessionId) {
          await loginDexcom();
        }

        var readUrl = BASE_DEXCOM + '/Publisher/ReadPublisherLatestGlucoseValues?sessionId=' + sessionId + '&minutes=1440&maxCount=1';
        var res = await fetch(PROXY + encodeURIComponent(readUrl), {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Length': '0'
          }
        });

        var text = await res.text();

        // Si expiró la sesión, reintentar login
        if (text.includes('SessionIdNotFound')) {
          await loginDexcom();
          return obtenerGlucosa();
        }

        var data = JSON.parse(text);
        if (Array.isArray(data) && data.length > 0) {
          var item = data[0];
          var match = item.ST ? item.ST.match(/\d+/) : null;
          var ts = match ? parseInt(match[0], 10) : Date.now();
          var mmol = parseFloat((item.Value / 18.018).toFixed(1));
          var hora = new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

          var lecturaActual = {
            mmol: mmol,
            mgdl: item.Value,
            tendencia: item.Trend,
            hora: hora
          };

          // Mostrar valor grande
          document.getElementById('valorGlucosa').innerText = mmol.toFixed(1);
          document.getElementById('horaLectura').innerText = hora;
          document.getElementById('flechaTendencia').innerText = flechas[item.Trend] || '→';

          // Historial persistente en el navegador
          var historial = JSON.parse(localStorage.getItem('glucosa_hist') || '[]');
          if (historial.length === 0 || historial[0].hora !== hora) {
            historial.unshift(lecturaActual);
            if (historial.length > 6) historial = historial.slice(0, 6);
            localStorage.setItem('glucosa_hist', JSON.stringify(historial));
          }

          // Comparación con el valor anterior
          if (historial.length > 1) {
            var anterior = historial[1];
            var diff = (mmol - anterior.mmol).toFixed(1);
            var signo = diff > 0 ? '+' : '';
            document.getElementById('deltaValor').innerText = signo + diff + ' mmol/L vs anterior (' + anterior.hora + ')';
          } else {
            document.getElementById('deltaValor').innerText = 'Primera lectura (sin anterior aún)';
          }

          // Lista de historial
          var lista = document.getElementById('listaHistorial');
          var filas = '';
          for (var i = 0; i < historial.length; i++) {
            filas += '<div class="fila">' +
              '<span>' + historial[i].hora + '</span>' +
              '<span style="font-weight:600;">' + historial[i].mmol.toFixed(1) + ' mmol/L</span>' +
              '<span>' + (flechas[historial[i].tendencia] || '→') + '</span>' +
            '</div>';
          }
          lista.innerHTML = filas;

          // Alarma de colores
          var bajo = parseFloat(document.getElementById('limiteBajo').value) || 4.2;
          var alto = parseFloat(document.getElementById('limiteAlto').value) || 10.0;
          var card = document.getElementById('cardPrincipal');

          if (mmol <= bajo) {
            card.className = 'card bg-alerta-baja';
            sonarAlarma();
          } else if (mmol >= alto) {
            card.className = 'card bg-alerta-alta';
            sonarAlarma();
          } else {
            card.className = 'card bg-normal';
          }
        }
      } catch (e) {
        document.getElementById('horaLectura').innerText = 'Reconectando con Dexcom...';
      }
    }

    obtenerGlucosa();
    setInterval(obtenerGlucosa, 30000); // Actualiza cada 30 segundos
  </script>
</body>
</html>`;

app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(HTML_APP);
});

app.listen(port, () => {
  console.log(`Servidor activo en puerto ${port}`);
});
