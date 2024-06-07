import { config } from "dotenv";
import * as z from "zod";

config();

const env = z
  .object({
    PLAYHT_API_KEY: z.string(),
    PLAYHT_USER_ID: z.string(),
    SOUL_ENGINE_ORGANIZATION: z.string(),
    SOUL_ENGINE_TOKEN: z.string().optional(),
    SOUL_ENGINE_DEBUG: z.string().optional(),
    PORT: z.string().default("3000"),
  })
  .parse(process.env);

export default env;
