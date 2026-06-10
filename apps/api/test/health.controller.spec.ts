import { Test } from '@nestjs/testing';
import { HealthController } from '../src/health/health.controller';
import { HealthService } from '../src/health/health.service';

describe('HealthController', () => {
  it('reports a healthy API process', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthService,
          useValue: { readiness: jest.fn() },
        },
      ],
    }).compile();
    const controller = moduleRef.get(HealthController);

    const response = controller.getHealth();

    expect(response.status).toBe('ok');
    expect(response.service).toBe('api');
    expect(Number.isNaN(Date.parse(response.timestamp))).toBe(false);
    expect(response.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });
});
