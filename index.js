import express from 'express';

const app = express();
const port = process.env.PORT || 3000;

const USERNAME = (process.env.DEXCOM_USERNAME || '').trim();
const PASSWORD = (process.env.DEXCOM_PASSWORD || '').trim();
const BASE_URL = 'https://shareous1.dexcom.com/ShareWebServices/Services';
const APP_ID = 'd89443d2-327c-4a6f-89e5-496bbb0317db';

async function obtenerSessionId() {
  // 1. AuthenticatePublisherAccountByName
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

  // 2. Intento directo por si falla el anterior
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
    throw new Error(`Credenciales rechazadas por Dexcom: ${accountIdRaw || directText}`);
  }

  return directSessionId;
}

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

    // Si Dexcom devolvió HTML en lugar de JSON
    if (bodyTexto.startsWith('<')) {
      return res.status(502).json({ 
        error: 'Dexcom devolvió un error de servidor temporal (HTML)', 
        detalle: bodyTexto.substring(0, 100) 
      });
    }

    const lecturas = JSON.parse(bodyTexto);

    if (Array.isArray(lecturas) && lecturas.length > 0) {
      const actual = lecturas[0];
      const match = actual.ST ? actual.ST.match(/\d+/) : null;
      const timestamp = match ? parseInt(match[0], 10) : Date.now();

      return res.json({
        valor: actual.Value,
        tendencia: actual.Trend,
        hora: new Date(timestamp).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin' })
      });
    }

    return res.status(404).json({ error: 'No hay datos recientes disponibles' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.send('Servidor Dexcom en línea');
});

app.listen(port, () => {
  console.log(`Servidor activo en puerto ${port}`);
});
