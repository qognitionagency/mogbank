import { z } from 'zod';

export const CredentialType = z.enum(['identity', 'kyc', 'compliance', 'kyb']);
export type CredentialType = z.infer<typeof CredentialType>;

export const CredentialSchema = z.object({
  id: z.string().uuid(),
  agent_id: z.string().uuid(),
  credential_type: CredentialType,
  issued_by: z.string(),
  issued_at: z.string().datetime(),
  expires_at: z.string().datetime(),
  revoked: z.boolean().default(false),
  data: z.record(z.unknown()).optional(),
});

export type Credential = z.infer<typeof CredentialSchema>;

export const IssueCredentialSchema = z.object({
  agent_id: z.string().uuid(),
  credential_type: CredentialType,
  issued_by: z.string(),
  data: z.record(z.unknown()).optional(),
  valid_days: z.number().int().positive().default(365),
});

export type IssueCredential = z.infer<typeof IssueCredentialSchema>;