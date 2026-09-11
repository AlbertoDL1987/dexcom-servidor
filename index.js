import express from 'express';
import Dexcom from 'dexcom-share';

const app = express();
const port = process.env.PORT || 3000;

// Estas variables tomarán tu usuario y contraseña de forma segura
const dexcom = Dexcom({
  username: process.env.DEXCOM_USERNAME,
  password: process.env.DEXCOM_PASSWORD,
  server: process.env.DEXCOM_SERVER || 'ous' // 'ous' es para Europa / fuera de USA
});

app.get('/glucosa', async (req, res) => {
  try {
    const readings = await dexcom.getLatest();
    if (readings && readings.length > 0) {
      const actual = readings[0];
      res.json({
        valor: actual.value,
        tendencia: actual.trendDescription,
        flecha: actual.trendSymbol,
        hora: actual.date
      });
    } else {
      res.status(404).json({ error: 'No hay datos recientes' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.send('Servidor Dexcom funcionando. Entra a /glucosa para ver el valor.');
});

app.listen(port, () => {
  console.log(`Servidor escuchando en puerto ${port}`);
});
