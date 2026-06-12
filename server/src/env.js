// Loads server/.env regardless of the process working directory (npm start
// runs from the repo root). Must be the FIRST import in server.js so env vars
// exist before any module reads them. Real environment variables (e.g. from
// the Render dashboard) always take precedence over the file.
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(dir, '..', '.env') });
