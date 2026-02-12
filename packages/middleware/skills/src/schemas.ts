import { z } from "zod";

export const SkillMetadataSchema = z.object({
  name: z.string(),
  description: z.string(),
  version: z.string().optional(),
  author: z.string().optional(),
  tags: z.array(z.string()).optional(),
  requires: z.array(z.string()).optional(),
});

export type SkillMetadata = z.infer<typeof SkillMetadataSchema>;
