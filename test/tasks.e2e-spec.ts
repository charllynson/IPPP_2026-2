import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

async function createApp(
  workingDirectory: string,
): Promise<INestApplication<App>> {
  const originalDirectory = process.cwd();

  try {
    process.chdir(workingDirectory);
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const app = moduleFixture.createNestApplication();
    await app.init();
    return app;
  } finally {
    process.chdir(originalDirectory);
  }
}

describe('TasksController (e2e)', () => {
  let app: INestApplication<App>;
  let temporaryDirectory: string;

  beforeAll(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'tasks-e2e-'));
    await mkdir(join(temporaryDirectory, 'data'));
    await writeFile(join(temporaryDirectory, 'data', 'tasks.json'), '[]');

    app = await createApp(temporaryDirectory);
  });

  afterAll(async () => {
    await app.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('supports the task CRUD routes', async () => {
    const created = await request(app.getHttpServer())
      .post('/tasks')
      .send({ descricao: 'Tarefa via HTTP', inicio: 1, fim: 2 })
      .expect(201);
    const id = created.body.id as number;

    try {
      expect(created.body).toEqual({
        id,
        descricao: 'Tarefa via HTTP',
        inicio: 1,
        fim: 2,
        status: 'PENDENTE',
        resultado: null,
      });

      await request(app.getHttpServer())
        .get('/tasks')
        .expect(200)
        .expect([created.body]);
      await request(app.getHttpServer())
        .get(`/tasks/${id}`)
        .expect(200)
        .expect(created.body);

      const replacement = {
        descricao: 'Tarefa substituída',
        inicio: 10,
        fim: 20,
        status: 'CONCLUIDA',
        resultado: [10, 20],
      };
      await request(app.getHttpServer())
        .put(`/tasks/${id}`)
        .send(replacement)
        .expect(200)
        .expect({ id, ...replacement });

      await request(app.getHttpServer())
        .patch(`/tasks/${id}`)
        .send({ status: 'EM_ANDAMENTO' })
        .expect(200)
        .expect({ ...replacement, id, status: 'EM_ANDAMENTO' });

      await app.close();
      app = await createApp(temporaryDirectory);
      await request(app.getHttpServer())
        .get(`/tasks/${id}`)
        .expect(200)
        .expect({ ...replacement, id, status: 'EM_ANDAMENTO' });
    } finally {
      await request(app.getHttpServer()).delete(`/tasks/${id}`);
    }

    await request(app.getHttpServer()).get(`/tasks/${id}`).expect(404);
  });
});
