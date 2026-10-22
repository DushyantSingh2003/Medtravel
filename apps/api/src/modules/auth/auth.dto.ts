import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  acceptInvitationSchema,
  acceptedSchema,
  authUserSchema,
  backupCodesSchema,
  changePasswordSchema,
  createInvitationSchema,
  createMagicLinkSchema,
  forgotPasswordSchema,
  invitationPreviewSchema,
  loginResultSchema,
  loginSchema,
  otpRequestSchema,
  otpVerifySchema,
  redeemMagicLinkSchema,
  registerSchema,
  resetPasswordSchema,
  sessionIdParamSchema,
  sessionListSchema,
  twoFactorChallengeSchema,
  twoFactorDisableSchema,
  twoFactorEnableSchema,
  twoFactorSetupSchema,
  verifyEmailSchema,
} from '@medtravel/contracts';

export class RegisterDto extends createZodDto(registerSchema) {}
export class LoginDto extends createZodDto(loginSchema) {}
export class OtpRequestDto extends createZodDto(otpRequestSchema) {}
export class OtpVerifyDto extends createZodDto(otpVerifySchema) {}
export class TwoFactorChallengeDto extends createZodDto(twoFactorChallengeSchema) {}
export class TwoFactorEnableDto extends createZodDto(twoFactorEnableSchema) {}
export class TwoFactorDisableDto extends createZodDto(twoFactorDisableSchema) {}
export class BackupCodesRequestDto extends createZodDto(twoFactorEnableSchema) {}
export class ForgotPasswordDto extends createZodDto(forgotPasswordSchema) {}
export class ResetPasswordDto extends createZodDto(resetPasswordSchema) {}
export class ChangePasswordDto extends createZodDto(changePasswordSchema) {}
export class VerifyEmailDto extends createZodDto(verifyEmailSchema) {}
export class CreateInvitationDto extends createZodDto(createInvitationSchema) {}
export class AcceptInvitationDto extends createZodDto(acceptInvitationSchema) {}
export class CreateMagicLinkDto extends createZodDto(createMagicLinkSchema) {}
export class RedeemMagicLinkDto extends createZodDto(redeemMagicLinkSchema) {}
export class SessionIdParamDto extends createZodDto(sessionIdParamSchema) {}
export class InvitationTokenParamDto extends createZodDto(
  z.object({ token: z.string().min(20).max(200) }),
) {}

export class AuthUserDto extends createZodDto(authUserSchema) {}
export class LoginResultDto extends createZodDto(loginResultSchema) {}
export class TwoFactorSetupDto extends createZodDto(twoFactorSetupSchema) {}
export class BackupCodesDto extends createZodDto(backupCodesSchema) {}
export class SessionListDto extends createZodDto(sessionListSchema) {}
export class InvitationPreviewDto extends createZodDto(invitationPreviewSchema) {}
export class AcceptedDto extends createZodDto(acceptedSchema) {}
