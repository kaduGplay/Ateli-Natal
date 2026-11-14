import { processMetaConversions } from '../../src/server/services/meta-conversions.js';
export const handler = async () => ({ statusCode: 200, body: JSON.stringify(await processMetaConversions()) });
