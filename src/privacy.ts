import * as path from 'node:path';

const ignoredDirectories = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', 'vendor', 'generated', '.turbo', 'target']);

export function trackableFile(relativePath: string): boolean {
	const parts = relativePath.replace(/\\/g, '/').split('/');
	const name = parts.at(-1) ?? '';
	if (parts.some(part => ignoredDirectories.has(part))) { return false; }
	if (/(?:^\.env(?:\..*)?$|^\.npmrc$|^\.pypirc$|^\.netrc$|^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?$|credentials?|secrets?|private[-_.]?key|\.key$|\.pem$|\.p12$|\.pfx$|\.crt$|\.cer$|\.asc$|\.gpg$)/i.test(name)) { return false; }
	if (/\.(?:min\.(?:js|css)|map|generated\.[^/]+|g\.[^/]+)$/i.test(name)) { return false; }
	return !!name && !path.isAbsolute(relativePath) && !parts.includes('..');
}

export function redactCommand(raw: string): string {
	let value = raw.trim().replace(/[\r\n]+/g, ' ');
	if (!value) { return ''; }
	// Commands that expose credential files or embed data as shell input are retained only as a private marker.
	if (/(?:^|[\s'"/])(?:\.env(?:\.[\w.-]+)?|\.npmrc|\.pypirc|\.netrc|id_(?:rsa|dsa|ecdsa|ed25519)|[^\s/]*\.(?:pem|key|p12|pfx|crt|cer))(?:[\s'"/]|$)|<<[-\w]*\s|^(?:echo|printf|export|set|read)\b|\b(?:node|python(?:3)?|bash|sh)\s+(?:-e|-c)\s+|\bcurl\b.*\s(?:-d|--data(?:-raw|-binary)?)\s/i.test(value)) { return '[private command]'; }
	if (/["'](?:password|passwd|token|api[_-]?key|secret|authorization)["']\s*:/i.test(value)) { return '[private command]'; }
	value = value.replace(/([A-Za-z_][A-Za-z0-9_]*(?:PASSWORD|PASSWD|PWD|TOKEN|API_?KEY|SECRET|AUTHORIZATION|PRIVATE_KEY|ACCESS_KEY)[A-Za-z0-9_]*\s*=\s*)(?:["'][^"']*["']|[^\s;&|]+)/gi, '$1[REDACTED]');
	value = value.replace(/([a-z][a-z0-9+.-]*:\/\/)([^\s/@]+):([^\s/@]+)@/gi, '$1[REDACTED]@');
	value = value.replace(/(^|\s)((?:-u|--user)\s+)(?:["'][^"']*["']|[^\s;&|]+)/gi, '$1$2[REDACTED]');
	value = value.replace(/(\bBearer\s+)[^\s'";]+/gi, '$1[REDACTED]');
	value = value.replace(/(\b(?:Authorization|Proxy-Authorization|X-API-Key)\s*[:=]\s*)(?:["']?[^\s;"']+(?:\s+[^\s;"']+)?)/gi, '$1[REDACTED]');
	value = value.replace(/(\b(?:password|passwd|pwd|token|api[_-]?key|secret|client[_-]?secret|access[_-]?key|auth[_-]?token)\b\s*[:=]\s*)(?:["'][^"']*["']|[^\s;&|]+)/gi, '$1[REDACTED]');
	value = value.replace(/(^|\s)((?:--(?:password|passwd|token|api[-_]?key|secret|client[-_]?secret|access[-_]?key)|-p)\s+)(?:["'][^"']*["']|[^\s;&|]+)/gi, '$1$2[REDACTED]');
	value = value.replace(/(\b(?:Authorization|Proxy-Authorization)\s*:\s*)[^\s'";]+/gi, '$1[REDACTED]');
	return value.slice(0, 1000);
}

export function isDependencyInstall(command: string): boolean {
	return /^(?:(?:npm|pnpm|yarn|bun)\s+(?:install|add|ci)\b|pip(?:3)?\s+install\b|python(?:3)?\s+-m\s+pip\s+install\b|composer\s+(?:install|require)\b|go\s+get\b|cargo\s+add\b)/i.test(command.trim());
}
