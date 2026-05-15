import { z } from 'zod';

export const AgentType = z.enum(['langchain', 'crewai', 'autogen', 'custom']);
export type AgentType = z.infer<typeof AgentType>;

export const KYAStatus = z.enum(['pending', 'verified', 'suspended']);
export type KYAStatus = z.infer<typeof KYAStatus>;

export const AgentSchema = z.object({
  id: z.string().uuid(),
  wallet_address: z.string(),
  public_key: z.string(),
  principal_address: z.string(),
  agent_type: AgentType,
  kya_score: z.number().int().min(0).max(100),
  kya_status: KYAStatus,
  email: z.string().email().optional(),
  metadata: z.record(z.unknown()).optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type Agent = z.infer<typeof AgentSchema>;

export const AgentRegistrationSchema = z.object({
  agent_type: AgentType.optional().default('custom'),
  email: z.string().email(),
  principal_address: z.string().min(1),
  metadata: z.record(z.unknown()).optional().default({}),
  framework: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
  endpoint_url: z.string().url().optional(),
  openapi_schema: z.string().optional(),
  company_name: z.string().optional(),
  jurisdiction: z.string().optional(),
});

export type AgentRegistration = z.infer<typeof AgentRegistrationSchema>;

export const AgentUpdateSchema = z.object({
  kya_status: KYAStatus.optional(),
  kya_score: z.number().int().min(0).max(100).optional(),
  metadata: z.record(z.unknown()).optional(),
  email: z.string().email().optional(),
});

export type AgentUpdate = z.infer<typeof AgentUpdateSchema>;