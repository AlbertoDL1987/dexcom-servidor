import express from 'express';

const app = express();
const port = process.env.PORT || 3000;

const USERNAME = process.env.DEXCOM_USERNAME;
const PASSWORD = process.env.DEXCOM_PASSWORD;
// Usamos el servidor europeo/internacional por defecto
const BASE_URL = 'https://shareous1.dexcom.com/ShareWebServices/Services';

const APPLICATION_ID = 'd89443d2-327c-4a6f-89e5-496bbb0317db';

// Función para obtener el sessionId de Dexcom
async function getSessionId() {
  // 1. Obtener AccountId
  const accRes = await fetch(`${BASE_URL}/General/AuthenticatePublisherAccountByName`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      accountName: USERNAME,
      password: PASSWORD,
      applicationId: APPLICATION_ID
    })
  });
  const accountId = (await accRes.text()).replace(/"/g, '');

  if (!accountId || accountId.includes('AccountNotFound') || accountId.includes('PasswordInvalid')) {
    throw new Error('Credenciales de Dexcom incorrectas');
  }

  // 2. Obtener SessionId
  const sessRes = await fetch(`${BASE_URL}/General/LoginPublisherAccountById`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      accountId: accountId,
      password: PASSWORD,
      applicationId: APPLICATION_ID
    })
  });
  const sessionId = (await sessRes.text()).replace(/"/g, '');
  return sessionId;
}

// Mapeo de tendencias a flechas y texto
const TRENDS = {
  None: { arrow: '→', text: 'Sin datos' },
  DoubleUp: { arrow: '⇈', text: 'Subiendo muy rápido' },
  SingleUp: { arrow: '↑', text: 'Subiendo rápido' },
  FortyFiveUp: { arrow: '↗', text: 'Subiendo' },
  Flat: { arrow: '→', text: 'Estable' },
  FortyFiveDown: { arrow: '↘', text: 'Bajando' },
  SingleDown: { arrow: '↓', text: 'Bajando rápido' },
  DoubleDown: { arrow: '⇊', text: 'Bajando muy rápido' },
  NotComputable: { arrow: '?', text: 'No computable' },
  RateOutOfRange: { arrow: '!', text: 'Fuera de rango' }
};

app.get('/glucosa', async (req, res) => {
  try {
    const sessionId = await getSessionId();

    const glucoseRes = await fetch(
      `${BASE_URL}/Publisher/ReadPublisherLatestGlucoseValues?sessionId=${sessionId}&minutes=1440&maxCount=1`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Content-Length': '0' }
      }
    );

    const data = await glucoseRes.json();

    if (data && data.length > 0) {
      const lectura = data[0];
      const trendInfo = TRENDS[lectura.Trend] || { arrow: '→', text: lectura.Trend };

      // Convertir marca de tiempo de Dexcom /Date(1234567890)/
      const timestampMatch = lectura.ST.match(/\d+/);
      const timestamp = timestampMatch ? parseInt(timestampMatch[0], 10) : Date.now();

      res.json({
        valor: lectura.Value,
        flecha: trendInfo.arrow,
        tendencia: trendInfo.text,
        fecha: new Date(timestamp).toISOString()
      });
    } else {
      res.status(404).json({ error: 'No hay lecturas disponibles' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.send('Servidor Dexcom en línea. Accede a /glucosa');
});

app.listen(port, () => {
  console.log(`Servidor activo en el puerto ${port}`);
});
