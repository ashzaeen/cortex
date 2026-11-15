// Auth.js routes (/api/auth/*). More specific than app/api/[...path], so these never reach the API proxy.
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
