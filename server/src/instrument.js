import 'dotenv/config';

const { initBackendMonitoring } = await import('./services/monitoringService.js');
initBackendMonitoring();
