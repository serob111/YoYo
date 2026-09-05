import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { TenantGuardsModule } from "../common/tenant-guards.module";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";

@Module({
  imports: [AuthModule, TenantGuardsModule],
  controllers: [ProductsController],
  providers: [ProductsService]
})
export class ProductsModule {}
