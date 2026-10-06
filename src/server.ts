import express from 'express';
import cors from 'cors';
import { promoRouter } from './routes/promos';

const app = express();
const PORT = process.env.PORT || 3002;
const HOST = '0.0.0.0';

app.use(cors());
app.use(express.json());

// Log incoming request info
app.use((req, _res, next) => {
  const userId = req.headers['x-user-id'] || 'anonymous';
  console.log(`[planazo-promo :${PORT}] ${req.method} ${req.url} (User: ${userId})`);
  next();
});

// Root & Health check endpoints for Railway
app.get('/', (_req, res) => {
  res.json({
    service: 'planazo-promo',
    status: 'UP',
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (_req, res) => {
  res.json({
    service: 'planazo-promo',
    status: 'UP',
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

// Mount /promos router (§6.1: Cada servicio expone sus rutas SIN /api)
app.use('/promos', promoRouter);

app.listen(Number(PORT), HOST, () => {
  console.log(`🚀 Microservicio planazo-promo activo en http://${HOST}:${PORT}`);
});

export default app;
