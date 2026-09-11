import express from 'express';

const app = express();
const port = process.env.PORT || 3000;

const USERNAME = (process.env.DEXCOM_USERNAME || '').trim();
const PASSWORD = (process.env.DEXCOM_PASSWORD || '').trim();
const BASE_URL = 'https://shareous1.dexcom.com/ShareWebServices/Services';
const APP_ID = 'd89443d2-327c-4a6f-89e5-496bbb0317db';

let sesionGuardada = null;

const HEADERS_DEXCOM = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'User-Agent': 'Dexcom Share/3.0.2.11 CFNetwork/1408.0.4 Darwin/22.5.0',
  'Connection': 'keep-alive'
};

async function iniciarSesion() {
  const authRes = await fetch(`${BASE_URL}/General/AuthenticatePublisherAccountByName`, {
    method: 'POST',
    headers: HEADERS_DEXCOM,
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
      headers: HEADERS_DEXCOM,
      body: JSON.stringify({
        accountId: accountId,
        password: PASSWORD,
        applicationId: APP_ID
      })
    });

    const sessText = await loginRes.text();
    const sid = sessText.replace(/"/g, '').trim();
    if (sid && sid !== '00000000-0000-0000-0000-000000000000') {
      sesionGuardada = sid;
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

  const directText = await directRes.text();
  const sid = directText.replace(/"/g, '').trim();

  if (!sid || sid === '00000000-0000-0000-0000-000000000000' || sid.length < 10) {
    throw new Error(`Credenciales o bloqueo de Dexcom: ${directText}`);
  }

  sesionGuardada = sid;
  return sid;
}

async function pedirLectura(sessionId) {
  const queryUrl = `${BASE_URL}/Publisher/ReadPublisherLatestGlucoseValues?sessionId=${sessionId}&minutes=1440&maxCount=1`;
  const resp = await fetch(queryUrl, {
    method: 'POST',
    headers: {
      ...HEADERS_DEXCOM,
      'Content-Length': '0'
    }
  });

  const body = await resp.text();
  return { status: resp.status, body: body };
}

app.get('/glucosa', async (req, res) => {
  try {
    if (!sesionGuardada) {
      await iniciarSesion();
    }

    let resultado = await pedirLectura(sesionGuardada);

    if (resultado.body.includes('SessionIdNotFound') || resultado.body.includes('ArgumentException')) {
      await iniciarSesion();
      resultado = await pedirLectura(sesionGuardada);
    }

    if (resultado.body.startsWith('<')) {
      return res.status(503).json({
        error: 'Dexcom está saturado temporalmente. Espera 2 minutos antes de recargar.',
        detalle: 'Cloudflare rate limit'
      });
    }

    const lecturas = JSON.parse(resultado.body);

    if (Array.isArray(lecturas) && lecturas.length > 0) {
      const actual = lecturas[0];
      const match = actual.ST ? actual.ST.match(/\d+/) : null;
      const timestamp = match ? parseInt(match[0], 10) : Date.now();
      const mmolCalculado = parseFloat((actual.Value / 18.018).toFixed(1));

      return res.json({
        mmol: mmolCalculado,
        valor: actual.Value,
        tendencia: actual.Trend,
        hora: new Date(timestamp).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin' })
      });
    }

    return res.status(404).json({ error: 'No hay datos recientes disponibles' });
  } catch (err) {
    sesionGuardada = null;
    return res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.send('Servidor Dexcom en línea');
});

app.listen(port, () => {
  console.log(`Servidor activo en puerto ${port}`);
});
