import { Injectable } from "@nestjs/common";
import { getOrCreateDefaultPipeline } from "@yoyo/database";
import { PrismaService } from "../common/prisma.service";

@Injectable()
export class PipelinesService {
  constructor(private readonly prisma: PrismaService) {}

  async getDefault(organizationId: string) {
    return getOrCreateDefaultPipeline(this.prisma.client, organizationId);
  }
}
