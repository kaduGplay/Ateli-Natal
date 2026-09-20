import app from '../index.js';
import { config } from './config.js';

app.listen(config.port, () => {
  console.log(`Ateliê Natal em http://localhost:${config.port} (${config.isProduction ? 'produção' : 'desenvolvimento'})`);
});
