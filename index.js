import express from 'express';

const app = express();
const port = process.env.PORT || 3000;

const USERNAME = (process.env.DEXCOM_USERNAME || '').trim();
const PASSWORD = (process.env.DEXCOM_PASSWORD || '').trim();
const BASE_URL = 'https://shareous1.dexcom.com/ShareWebServices/Services';
const APP_ID = 'd89443d2-327c-4a6f-89e5-496bbb0317db';

async function obtenerSessionId() {
  const loginRes = await fetch(`${BASE_URL}/General/LoginPublisherAccountByName`, {
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

  const texto = await loginRes.text();
  const sessionId = texto.replace(/"/g, '').trim();

  // Si devuelve un GUID vacío o mensaje de error
  if (!sessionId || sessionId === '00000000-0000-0000-0000-000000000000' || sessionId.length < 10) {
    throw new Error(`Fallo de login en Dexcom. Respuesta: ${texto}`);
  }

  return sessionId;
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
    
    if (!bodyTexto) {
      return res.status(502).json({ error: 'Dexcom respondió vacío' });
    }

    const lecturas = JSON.parse(bodyTexto);

    if (Array.isArray(lecturas) && lecturas.length > 0) {
      const actual = lecturas[0];
      const match = actual.ST ? actual.ST.match(/\d+/) : null;
      const timestamp = match ? parseInt(match[0], 10) : Date.now();

      return res.json({
        valor: actual.Value,
        tendencia: actual.Trend,
        hora: new Date(timestamp).toLocaleTimeString()
      });
    }

    return res.status(404).json({ error: 'No hay lecturas disponibles', detalle: bodyTexto });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.send('Servidor Dexcom funcionando');
});

app.listen(port, () => {
  console.log(`Servidor activo en el puerto ${port}`);
});
