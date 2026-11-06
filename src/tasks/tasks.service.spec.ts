import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NotFoundException } from '@nestjs/common';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TasksService } from './tasks.service';

describe('TasksService', () => {
  let originalDirectory: string;
  let temporaryDirectory: string;
  let service: TasksService;

  beforeEach(async () => {
    originalDirectory = process.cwd();
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'tasks-service-'));
    await mkdir(join(temporaryDirectory, 'data'));
    await writeFile(join(temporaryDirectory, 'data', 'tasks.json'), '[]');

    process.chdir(temporaryDirectory);
    service = new TasksService();
    process.chdir(originalDirectory);
  });

  afterEach(async () => {
    process.chdir(originalDirectory);
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('creates tasks, serializes concurrent writes, and persists them', async () => {
    const firstTask: CreateTaskDto = {
      descricao: 'Primeira tarefa',
      inicio: 1,
      fim: 2,
    };
    const secondTask: CreateTaskDto = {
      descricao: 'Segunda tarefa',
      inicio: 3,
      fim: 4,
    };

    const createdTasks = await Promise.all([
      service.create(firstTask),
      service.create(secondTask),
    ]);

    expect(createdTasks.map((task) => task.id)).toEqual([1, 2]);
    expect(await service.findAll()).toEqual([
      {
        id: 1,
        descricao: firstTask.descricao,
        inicio: firstTask.inicio,
        fim: firstTask.fim,
        status: 'PENDENTE',
        resultado: null,
      },
      {
        id: 2,
        descricao: secondTask.descricao,
        inicio: secondTask.inicio,
        fim: secondTask.fim,
        status: 'PENDENTE',
        resultado: null,
      },
    ]);

    const persistedContent = await readFile(
      join(temporaryDirectory, 'data', 'tasks.json'),
      'utf-8',
    );
    expect(JSON.parse(persistedContent)).toHaveLength(2);

    let restartedService: TasksService;
    process.chdir(temporaryDirectory);
    try {
      restartedService = new TasksService();
    } finally {
      process.chdir(originalDirectory);
    }
    expect(await restartedService.findAll()).toHaveLength(2);
  });

  it('supports finding, replacing, patching, and removing tasks', async () => {
    const created = await service.create({
      descricao: 'Tarefa original',
      inicio: 1,
      fim: 2,
    });

    const updatedTask: UpdateTaskDto = {
      descricao: 'Tarefa atualizada',
      inicio: 10,
      fim: 20,
      status: 'CONCLUIDA',
      resultado: [10, 20],
    };
    expect(await service.update(created.id, updatedTask)).toEqual({
      id: created.id,
      descricao: updatedTask.descricao,
      inicio: updatedTask.inicio,
      fim: updatedTask.fim,
      status: updatedTask.status,
      resultado: updatedTask.resultado,
    });
    expect(await service.patch(created.id, { status: 'EM_ANDAMENTO' })).toEqual(
      {
        id: created.id,
        descricao: updatedTask.descricao,
        inicio: updatedTask.inicio,
        fim: updatedTask.fim,
        status: 'EM_ANDAMENTO',
        resultado: updatedTask.resultado,
      },
    );
    expect(await service.findOne(created.id)).toEqual({
      id: created.id,
      descricao: updatedTask.descricao,
      inicio: updatedTask.inicio,
      fim: updatedTask.fim,
      status: 'EM_ANDAMENTO',
      resultado: updatedTask.resultado,
    });

    await service.remove(created.id);
    await expect(service.findOne(created.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
