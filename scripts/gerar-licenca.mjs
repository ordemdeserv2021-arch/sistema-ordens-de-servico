import { neon } from '@neondatabase/serverless';
import { generateLicenseCode, hashLicenseCode } from '../api/_lib/license.js';

const days = Number.parseInt(process.argv[2], 10);
const note = process.argv.slice(3).join(' ').trim() || null;

if (!Number.isInteger(days) || days < 1 || days > 3660) {
    console.error('Uso: npm run licenca -- <dias> [observação]\nExemplo: npm run licenca -- 30 Empresa XYZ');
    process.exit(1);
}
if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL não está configurada.');
    process.exit(1);
}

const code = generateLicenseCode();

const sql = neon(process.env.DATABASE_URL);
await sql`
    insert into public.license_codes (code_hash, days, note)
    values (${hashLicenseCode(code)}, ${days}, ${note})
`;

console.log(`Código de licença (${days} dias): ${code}`);
