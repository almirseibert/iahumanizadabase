// Processo dedicado de workers (opcional — use quando separar do processo da API).
// EasyPanel: mesmo build, comando `node dist/worker.js`, e defina RUN_WORKERS=false na API.
import { logger } from "./lib/logger.js";
import { startWorkers } from "./workers/index.js";

startWorkers();
logger.info("processo de workers iniciado (standalone)");
