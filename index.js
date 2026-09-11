import express from 'express';
import dexcomShare from 'dexcom-share';

const app = express();
const port = process.env.PORT || 3000;

// Configuración del cliente Dexcom Share
const dexcom = dexcomShare({
  username: process.env.DEXCOM_USERNAME,
  password: process.env.DEXCOM_PASSWORD,
  server: process.env.DEXCOM_SERVER || 'ous'
});

app.get('/glucosa', async (req, res) => {
  try {
    // getEstimatedGlucoseValues() o getLatestGlucose()
    // dexcom-share soporta callback o promesa devolviendo lecturas
    const readings = await dexcom({
      maxCount: 1,
      minutes: 1440
    });

    if (readings && readings.length > 0) {
      const actual = readings[0];
      res.json({
        valor: actual.value,
        tendencia: actual.trendDescription || actual.trend,
        flecha: actual.trendArrow || actual.trendSymbol || '→',
        hora: actual.date || actual.time
      });
    } else {
      res.status(404).json({ error: 'No se encontraron lecturas recientes' });
    }
  } catch (err) {
    // Si falla el método de arriba, probamos la llamada directa documentada
    try {
      // Endpoint directo con formato de cuerpo exacto requerido por WCF
      const authUrl = 'https://shareous1.dexcom.com/ShareWebServices/Services/General/LoginPublisherAccountByName';
      const authRes = await fetch(authUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Dexcom Share/3.0.2.11'
        },
        body: JSON.stringify({
          accountName: process.env.DEXCOM_USERNAME,
          password: process.env.DEXCOM_PASSWORD,
          applicationId: 'd89443d2-327c-4a6f-89e5-496bbb0317db'
        })
      });

      const sessionText = await authRes.text();
      const sessionId = sessionText.replace(/"/g, '').trim();

      if (!sessionId || sessionId.length < 10) {
        return res.status(401).json({ 
          error: 'Error de autenticación en Dexcom. Revisa usuario y contraseña en Render.',
          detalle: sessionId 
        });
      }

      const readUrl = `https://shareous1.dexcom.com/ShareWebServices/Services/Publisher/ReadPublisherLatestGlucoseValues?sessionId=${sessionId}&minutes=1440&maxCount=1`;
      const dataRes = await fetch(readUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Content-Length': '0',
          'User-Agent': 'Dexcom Share/3.0.2.11'
        }
      });

      const rawData = await dataRes.json();
      if (rawData && rawData.length > 0) {
        const item = rawData[0];
        const timestampMatch = item.ST.match(/\d+/);
        const timestamp = timestampMatch ? parseInt(timestampMatch[0], 10) : Date.now();

        return res.json({
          valor: item.Value,
          tendencia: item.Trend,
          hora: new Date(timestamp).toLocaleTimeString()
        });
      }

      return res.status(404).json({ error: 'Sin datos disponibles' });
    } catch (segundoError) {
      return res.status(500).json({ 
        error: segundoError.message 
      });
    }
  }
});

app.get('/', (req, res) => {
  res.send('Servidor Dexcom en línea. Accede a /glucosa');
});

app.listen(port, () => {
  console.log(`Servidor activo en el puerto ${port}`);
});
