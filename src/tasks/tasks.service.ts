import { Injectable, NotFoundException } from '@nestjs/common';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

export interface Task {
  id: number;
  descricao: string;
  inicio: number;
  fim: number;
  status: string;
  resultado: number[] | null;
}

@Injectable()
export class TasksService {
  private readonly filePath = join(process.cwd(), 'data', 'tasks.json');

  private writeQueue: Promise<void> = Promise.resolve();

  private async readTasks(): Promise<Task[]> {
    const content = await readFile(this.filePath, 'utf-8');
    const tasks: unknown = JSON.parse(content);

    if (!Array.isArray(tasks)) {
      throw new Error(`Task data in ${this.filePath} must be a JSON array`);
    }

    return tasks as Task[];
  }

  private async saveTasks(tasks: Task[]): Promise<void> {
    const content = JSON.stringify(tasks, null, 2);
    await writeFile(this.filePath, content, 'utf-8');
  }

  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.writeQueue.then(operation);
    this.writeQueue = result.then(
      () => undefined,
      () => undefined,
    );

    return result;
  }

  async findAll(): Promise<Task[]> {
    return this.readTasks();
  }

  async findOne(id: number): Promise<Task> {
    const tasks = await this.readTasks();
    const task = tasks.find((item) => item.id === id);

    if (!task) {
      throw new NotFoundException('Tarefa não encontrada');
    }

    return task;
  }

  async create(dto: CreateTaskDto): Promise<Task> {
    return this.mutate(async () => {
      const tasks = await this.readTasks();
      const task: Task = {
        id: tasks.reduce((maxId, item) => Math.max(maxId, item.id), 0) + 1,
        descricao: dto.descricao,
        inicio: dto.inicio,
        fim: dto.fim,
        status: 'PENDENTE',
        resultado: null,
      };

      tasks.push(task);
      await this.saveTasks(tasks);

      return task;
    });
  }

  async update(id: number, dto: UpdateTaskDto): Promise<Task> {
    return this.mutate(async () => {
      const tasks = await this.readTasks();
      const index = tasks.findIndex((item) => item.id === id);

      if (index === -1) {
        throw new NotFoundException('Tarefa não encontrada');
      }

      tasks[index] = {
        id,
        descricao: dto.descricao,
        inicio: dto.inicio,
        fim: dto.fim,
        status: dto.status,
        resultado: dto.resultado,
      };

      await this.saveTasks(tasks);

      return tasks[index];
    });
  }

  async patch(id: number, dto: Partial<UpdateTaskDto>): Promise<Task> {
    return this.mutate(async () => {
      const tasks = await this.readTasks();
      const index = tasks.findIndex((item) => item.id === id);

      if (index === -1) {
        throw new NotFoundException('Tarefa não encontrada');
      }

      tasks[index] = {
        ...tasks[index],
        ...dto,
        id,
      };

      await this.saveTasks(tasks);

      return tasks[index];
    });
  }

  async remove(id: number): Promise<void> {
    return this.mutate(async () => {
      const tasks = await this.readTasks();
      const filteredTasks = tasks.filter((item) => item.id !== id);

      if (filteredTasks.length === tasks.length) {
        throw new NotFoundException('Tarefa não encontrada');
      }

      await this.saveTasks(filteredTasks);
    });
  }
}
