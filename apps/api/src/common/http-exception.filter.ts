import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import type { Request, Response } from "express";
import { ZodError } from "zod";
import { DomainError } from "./domain-errors";

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = request.requestId;

    if (exception instanceof DomainError) {
      response.status(exception.httpStatus).json({
        code: exception.code,
        message: exception.message,
        requestId
      });
      return;
    }

    if (exception instanceof ZodError) {
      response.status(400).json({
        code: "VALIDATION_ERROR",
        message: exception.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        requestId
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const code = typeof body === "object" && body !== null && "code" in body ? (body as { code: unknown }).code : "HTTP_ERROR";
      response.status(status).json({
        code: typeof code === "string" ? code : "HTTP_ERROR",
        message: exception.message,
        requestId
      });
      return;
    }

    this.logger.error("Unhandled exception", exception instanceof Error ? exception.stack : exception);
    response.status(500).json({
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred.",
      requestId
    });
  }
}
