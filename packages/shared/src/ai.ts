import { z } from "zod";
export const analysisSchema = z
  .object({
    summary: z.string().max(2000),
    facts: z
      .array(
        z
          .object({
            text: z.string().max(1000),
            status: z.enum(["CONFIRMED", "INFERRED", "UNKNOWN"]),
            messageIds: z.array(z.uuid()).max(10),
          })
          .strict(),
      )
      .max(30),
    needs: z.array(z.string().max(1000)).max(20),
    objections: z.array(z.string().max(1000)).max(20),
    missing_information: z.array(z.string().max(1000)).max(20),
    intent: z.string().max(100),
    stage_suggestion: z.string().max(120),
    recommended_action: z.enum([
      "clarify_need",
      "answer_question",
      "present_product",
      "handle_objection",
      "provide_case",
      "discuss_payment",
      "follow_up",
      "pause_sales",
      "recommend_alternative",
    ]),
    reasoning_summary: z.string().max(2000),
    responses: z
      .array(
        z
          .object({
            tone: z.enum(["warm", "confident", "short"]),
            text: z.string().min(1).max(4096),
          })
          .strict(),
      )
      .length(3)
      .refine(
        (r) => new Set(r.map((v) => v.tone)).size === 3,
        "Three distinct tones required",
      ),
  })
  .strict();
export type AnalysisResult = z.infer<typeof analysisSchema>;
export interface AnalysisView {
  id: string;
  contextVersion: string;
  provider: string;
  promptVersion: string;
  createdAt: string;
  result: AnalysisResult;
  stale: boolean;
  suggestions: {
    id: string;
    tone: string;
    text: string;
    feedback: string;
    edited: boolean;
  }[];
  usage: { inputTokens: number; outputTokens: number; cost: string | null }[];
}
