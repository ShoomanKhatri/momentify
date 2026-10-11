import { NestFactory } from '@nestjs/core';
import { ConsoleLogger } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { AppModule } from './app.module.js';
import { ConfigService } from './config/config.service.js';
import { setupApplication } from './setup.js';

if (existsSync('.env')) loadEnvFile('.env');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new ConsoleLogger({ json: true }),
  });
  setupApplication(app);
  const config = app.get(ConfigService);
  await app.listen(config.port, config.host);
}
await bootstrap();
