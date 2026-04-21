import { Storage } from "@google-cloud/storage";
import { readFileSync } from "fs";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

const publicPath = process.env.PUBLIC_OBJECT_SEARCH_PATHS.split(',')[0];
const [bucketName, ...pathParts] = publicPath.replace('//', '').split('/');
const objectPath = [...pathParts, 'east-side-studio-logo.png'].join('/');

const logoBuffer = readFileSync('attached_assets/east-side-studio-logo.png');
const bucket = storage.bucket(bucketName);
const file = bucket.file(objectPath);

await file.save(logoBuffer, {
  contentType: 'image/png',
  metadata: {
    cacheControl: 'public, max-age=31536000',
  },
});

console.log(`Logo uploaded to: ${publicPath}/east-side-studio-logo.png`);
console.log(`Public URL: /objects/east-side-studio-logo.png`);
