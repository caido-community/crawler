/**
 * Backend Validation Schemas
 *
 * These extend the shared schemas with backend-specific validation
 * for API request/response handling.
 */

import { CrawlConfigSchema, CrawlJobStatusSchema } from "shared";
import { z } from "zod";

/**
 * URL validation - ensures valid URL format
 */
export const UrlSchema = z.string().url("Invalid URL format");

/**
 * Job ID validation
 */
export const JobIdSchema = z.string().min(1, "Job ID cannot be empty");

/**
 * Start crawl request validation
 */
export const StartCrawlRequestSchema = z.object({
  targetUrl: UrlSchema,
  isManual: z.boolean().optional().default(false),
});

export type StartCrawlRequest = z.infer<typeof StartCrawlRequestSchema>;

/**
 * Update job request validation
 */
export const UpdateJobRequestSchema = z.object({
  jobId: JobIdSchema,
  status: CrawlJobStatusSchema.optional(),
});

export type UpdateJobRequest = z.infer<typeof UpdateJobRequestSchema>;

/**
 * Update config request validation
 */
export const UpdateConfigRequestSchema = CrawlConfigSchema.partial();

export type UpdateConfigRequest = z.infer<typeof UpdateConfigRequestSchema>;

/**
 * Pagination parameters
 */
export const PaginationSchema = z.object({
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

export type PaginationParams = z.infer<typeof PaginationSchema>;

/**
 * Job filter parameters
 */
export const JobFilterSchema = z.object({
  status: CrawlJobStatusSchema.optional(),
  host: z.string().optional(),
});

export type JobFilterParams = z.infer<typeof JobFilterSchema>;

/**
 * Validates input and returns Result type
 */
export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  // Format Zod errors into readable message
  const issues = result.error.issues ?? [];
  const errors = issues
    .map((e) => `${e.path.join(".")}: ${e.message}`)
    .join(", ");
  return { success: false, error: errors };
}

/**
 * Validates URL format
 */
export function isValidUrl(url: string): boolean {
  return UrlSchema.safeParse(url).success;
}

/**
 * Normalizes and validates a URL
 */
export function normalizeUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    // Normalize: remove trailing slash, lowercase hostname
    parsed.hostname = parsed.hostname.toLowerCase();
    if (parsed.pathname === "/") {
      parsed.pathname = "";
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}
