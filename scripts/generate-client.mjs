// Prisma's native migration engine is not needed by the JavaScript client generator.
// Use the same official generator API as the CLI, with engine downloads omitted.
// @prisma/internals is version-pinned alongside prisma and @prisma/client.
import internals from '@prisma/internals';
import { createRequire } from 'node:module';
const { PrismaClientJsGenerator } = createRequire(import.meta.url)('@prisma/client-generator-js');
const { getGenerators } = internals;
const generators = await getGenerators({
  schemaPath: 'packages/database/prisma/schema.prisma',
  skipDownload: true,
  cliCommand: 'npm run db:generate',
  registry: { 'prisma-client-js': { type: 'in-process', generator: new PrismaClientJsGenerator({ cliCommand: 'npm run db:generate', shouldResolvePrismaClient: true }) } },
});
try {
  for (const generator of generators) await generator.generate();
  console.log('Prisma JavaScript client generated using npm-delivered WASM.');
} finally {
  for (const generator of generators) generator.stop();
}
