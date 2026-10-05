import * as path from 'node:path';
import * as vscode from 'vscode';
import { trackableFile } from './privacy';

const include = '**/*.{ts,tsx,js,jsx,mjs,cjs,py,php,go,rs,java,kt,cs,c,cpp,h,hpp,html,css,scss,json,yaml,yml,toml,md,sql,sh,vue,svelte}';
const exclude = '**/{node_modules,.git,dist,build,coverage,.next,vendor,generated,.turbo,target}/**';

export async function captureCheckpoint(folder: vscode.WorkspaceFolder): Promise<Map<string, string>> {
	const files = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, include), exclude, 500);
	const snapshot = new Map<string, string>();
	let totalBytes = 0;
	for (const uri of files.sort((a, b) => a.fsPath.localeCompare(b.fsPath))) {
		if (snapshot.size >= 200) { break; }
		const name = path.relative(folder.uri.fsPath, uri.fsPath);
		if (!trackableFile(name)) { continue; }
		try {
			const stat = await vscode.workspace.fs.stat(uri);
			if (stat.size > 64 * 1024 || totalBytes + stat.size > 2 * 1024 * 1024) { continue; }
			const bytes = await vscode.workspace.fs.readFile(uri);
			if (bytes.includes(0)) { continue; }
			const content = Buffer.from(bytes).toString('utf8');
			snapshot.set(name, content);
			totalBytes += bytes.byteLength;
		} catch { /* A file may be removed while capturing. */ }
	}
	return snapshot;
}
