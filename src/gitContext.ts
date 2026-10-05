import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export async function gitContext(cwd: string): Promise<{ branch: string; commit: string } | undefined> {
	try {
		const [branch, commit] = await Promise.all([
			exec('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], { cwd, timeout: 2500 }),
			exec('git', ['rev-parse', '--short', 'HEAD'], { cwd, timeout: 2500 }),
		]);
		return { branch: branch.stdout.trim(), commit: commit.stdout.trim() };
	} catch { return undefined; }
}
