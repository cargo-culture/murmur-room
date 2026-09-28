import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function codexReply(prompt, { signal, command = process.env.MURMUR_CODEX || 'codex' } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'murmur-codex-'));
  const output = join(dir, 'reply.txt');
  await mkdir(join(dir, 'empty'));
  try {
    const args = ['exec', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only', '--ignore-user-config', '--ignore-rules', '-C', join(dir, 'empty'), '-o', output, prompt];
    const result = await new Promise((resolve, reject) => {
      const env = { ...process.env }; delete env.OPENAI_API_KEY; delete env.CODEX_API_KEY;
      const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'], signal, env });
      let error = '';
      child.stderr.on('data', data => { error = (error + data.toString()).slice(-4000); });
      child.on('error', reject);
      child.on('close', code => code === 0 ? resolve() : reject(new Error(error.trim() || `Codex exited ${code}`)));
    });
    void result;
    const text = (await readFile(output, 'utf8')).trim();
    if (!text) throw new Error('Codex returned an empty response.');
    return text.slice(0, 16000);
  } finally { await rm(dir, { recursive: true, force: true }); }
}
