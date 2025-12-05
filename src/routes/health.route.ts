import type { FastifyInstance } from 'fastify';
import type { ServiceContainer } from '../services/index.js';

interface HealthResponse {
  status: 'ok' | 'degraded' | 'error' | 'unconfigured';
  timestamp: string;
  services?: {
    sonarr: boolean;
    radarr: boolean;
  };
}

/**
 * Register health check routes
 */
export async function healthRoutes(fastify: FastifyInstance, container: ServiceContainer) {
  // Basic health check
  fastify.get('/health', async () => {
    return {
      status: container.isInitialized ? 'ok' : 'unconfigured',
      timestamp: new Date().toISOString(),
    };
  });

  // Detailed health check with service status
  fastify.get<{ Reply: HealthResponse }>('/health/detailed', async () => {
    // If services aren't initialized, return unconfigured status
    if (!container.isInitialized) {
      return {
        status: 'unconfigured',
        timestamp: new Date().toISOString(),
      };
    }

    const connections = await container.testConnections();
    const allOk = connections.sonarr && connections.radarr;

    return {
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        sonarr: connections.sonarr,
        radarr: connections.radarr,
      },
    };
  });
}
