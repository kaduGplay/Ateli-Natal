import express from 'express';
import path from 'node:path';
import { config } from './server/config.js';
import { errorHandler, routes } from './server/routes.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

app.use('/api', routes);
app.use('/api', (_req, res) => res.status(404).json({ ok: false, message: 'Rota não encontrada.' }));

app.use(express.static(config.publicDir, { extensions: ['html'], maxAge: config.isProduction ? '1h' : 0 }));
app.get('*', (_req, res) => res.sendFile(path.join(config.publicDir, 'index.html')));

app.use(errorHandler);

export default app;
