import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { ApplicationError, commandMain, invokeCLI, privateDirectory } from './adapter-runtime.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const cases = new Set(['starter', 'busy', 'ambiguous-name', 'similar-email', 'already-current', 'missing-person', 'unsupported-role', 'team-limit']);
export async function runApplication(input, parameters, signal, invocation) {
  if (Object.keys(input).some(key => !['caseId', 'action', 'task'].includes(key)) || !cases.has(input.caseId) ||
      !['operate', 'inspect'].includes(input.action) || typeof input.task !== 'string' || !input.task.trim() ||
      input.task.length > 8000 || input.task.includes('\0')) throw new Error('Select a reviewed case, action and bounded explicit task.');
  const directory = await privateDirectory(root, invocation);
  try {
    const output = await invokeCLI([process.execPath, 'firedrill/browser-driver.mjs', JSON.stringify(input), directory, parameters.model ?? ''], { cwd: root, signal, timeoutMs: 270000 });
    return { application: output, localState: { directory, workspaceFile: join(directory, 'workspace.json') } };
  } catch (error) { if (error instanceof ApplicationError) error.evidence.runDirectory = directory; throw error; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await commandMain(runApplication);
