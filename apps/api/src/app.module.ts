import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { InfrastructureModule } from './infrastructure';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { SecurityGuard, SessionGuard } from './security';
@Module({
  imports: [InfrastructureModule, AuthModule, WorkspacesModule, HealthModule],
  providers: [{ provide: APP_GUARD, useClass: SecurityGuard }, { provide: APP_GUARD, useClass: SessionGuard }],
})
export class AppModule {}
