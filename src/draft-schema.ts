import { z } from "zod";
export const draftSchema = z
  .object({
    id: z.string(),
    sheetOrder: z.array(z.string()),
    sheets: z.record(
      z.string(),
      z
        .object({
          id: z.string(),
          name: z.string(),
          cellData: z.record(
            z.string(),
            z.record(
              z.string(),
              z
                .object({
                  v: z
                    .union([z.string(), z.number(), z.boolean(), z.null()])
                    .optional(),
                  f: z.string().optional(),
                  t: z.number().optional(),
                })
                .passthrough(),
            ),
          ),
        })
        .passthrough(),
    ),
  })
  .passthrough();
