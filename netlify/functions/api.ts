import express from 'express';
import serverless from 'serverless-http';
import { routes, errorHandler } from '../../src/server/routes.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use('/api', routes);
app.use((_req, res) => res.status(404).json({ ok: false, message: 'Rota não encontrada.' }));
app.use(errorHandler);

export const handler = serverless(app);
