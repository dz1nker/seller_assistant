import { ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private logger = new Logger('API');
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const requestId = randomUUID();
    const parserError = error && typeof error === 'object' && 'type' in error ? error.type : undefined;
    const status = parserError === 'entity.parse.failed' ? 400 : parserError === 'entity.too.large' ? 413 :
      error instanceof ZodError ? 400 : error instanceof HttpException ? error.getStatus() : 500;
    const message = error instanceof ZodError ? 'Проверьте заполнение полей' :
      error instanceof HttpException ? error.message : status === 400 ? 'Некорректный JSON' : status === 413 ? 'Запрос слишком большой' : 'Внутренняя ошибка сервера';
    if (status >= 500) this.logger.error(JSON.stringify({ requestId, status, category: 'request_failed' }));
    res.status(status).json({ statusCode: status, message, requestId,
      ...(error instanceof ZodError ? { fields: error.issues.map(i => ({ path: i.path.join('.'), message: i.message })) } : {}),
    });
  }
}
