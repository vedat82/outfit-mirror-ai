import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import clothesRouter from './routes/clothes.js';
import outfitsRouter from './routes/outfits.js';
import paymentRouter from './routes/payment.js';
import aiRouter from './routes/ai.js';
import { monitoringContextMiddleware, setupBackendErrorHandler } from './services/monitoringService.js';

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: false, limit: '20mb' }));
app.use(monitoringContextMiddleware);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/clothes', clothesRouter);
app.use('/api/outfits', outfitsRouter);
app.use('/api/payment', paymentRouter);
app.use('/payment', paymentRouter);
app.use('/api/ai', aiRouter);
app.use('/ai', aiRouter);

setupBackendErrorHandler(app);

app.use((error, _req, res, _next) => {
  res.status(error.statusCode || 500).json({
    message: error.message || 'Internal server error'
  });
});

app.listen(port, () => {
  console.log(`Daily Outfit Planner API running on http://localhost:${port}`);
});
