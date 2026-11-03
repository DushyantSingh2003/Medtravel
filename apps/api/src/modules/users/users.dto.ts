import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  createLeaveSchema,
  loginHistoryPageSchema,
  cursorQuerySchema,
  teamListSchema,
  teamSchema,
  teamWriteSchema,
  updateUserSchema,
  userDetailSchema,
  userListQuerySchema,
  userPageSchema,
  impersonatingSchema,
  impersonateRequestSchema,
} from '@medtravel/contracts';

export class UserIdParamDto extends createZodDto(z.object({ id: z.uuid() })) {}
export class LeaveParamsDto extends createZodDto(z.object({ id: z.uuid(), leaveId: z.uuid() })) {}
export class TeamIdParamDto extends createZodDto(z.object({ id: z.uuid() })) {}
export class UserListQueryDto extends createZodDto(userListQuerySchema) {}
export class UserPageDto extends createZodDto(userPageSchema) {}
export class UserDetailDto extends createZodDto(userDetailSchema) {}
export class UpdateUserDto extends createZodDto(updateUserSchema) {}
export class CreateLeaveDto extends createZodDto(createLeaveSchema) {}
export class HistoryQueryDto extends createZodDto(cursorQuerySchema) {}
export class LoginHistoryPageDto extends createZodDto(loginHistoryPageSchema) {}
export class TeamDto extends createZodDto(teamSchema) {}
export class TeamListDto extends createZodDto(teamListSchema) {}
export class TeamWriteDto extends createZodDto(teamWriteSchema) {}
export class ImpersonateRequestDto extends createZodDto(impersonateRequestSchema) {}
export class ImpersonationStartedDto extends createZodDto(
  impersonatingSchema.pick({ expiresAt: true }),
) {}
