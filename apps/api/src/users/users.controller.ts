import { Controller, Get, UseGuards } from "@nestjs/common";
import { CurrentUser, type CurrentUserPayload } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import { PrismaService } from "../common/prisma.service";

@Controller()
@UseGuards(SessionGuard)
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("me")
  async me(@CurrentUser() user: CurrentUserPayload) {
    const fullUser = await this.prisma.client.user.findUniqueOrThrow({ where: { id: user.id } });
    return {
      id: fullUser.id,
      email: fullUser.email,
      name: fullUser.name,
      emailVerifiedAt: fullUser.emailVerifiedAt
    };
  }
}
