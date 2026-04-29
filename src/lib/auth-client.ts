import { createAuthClient } from "better-auth/client";

/** Browser-side auth client — calls /api/auth/* endpoints. */
export const authClient = createAuthClient();
