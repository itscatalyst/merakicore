import { signTestJwt } from "./index.js";

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const secret = required("MERAKI_JWT_SECRET");
if (Buffer.byteLength(secret, "utf8") < 32) {
  throw new Error("MERAKI_JWT_SECRET must contain at least 32 UTF-8 bytes");
}

const token = await signTestJwt(
  {
    tenant_id: process.env.MERAKI_TENANT_ID ?? "local",
    subject_id: process.env.MERAKI_SUBJECT_ID ?? "builder",
    actor_id: process.env.MERAKI_ACTOR_ID ?? process.env.MERAKI_SUBJECT_ID ?? "builder",
    session_id: process.env.MERAKI_SESSION_ID ?? "local-session",
    scope: ["profile:read", "profile:write", "evidence:write", "evaluation:write"]
  },
  {
    secret: new TextEncoder().encode(secret),
    issuer: required("MERAKI_JWT_ISSUER"),
    audience: required("MERAKI_JWT_AUDIENCE")
  },
  "12h"
);

process.stdout.write(`${token}\n`);
