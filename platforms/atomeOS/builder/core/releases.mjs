// Resolve the official production release, then pin it for the whole build.
export function productionRelease(html) {
  const match = /Production Release:\s*<a\b[^>]*>\s*(\d+\.\d+)\s*<\/a>/i.exec(html);
  if (!match) throw new Error('Cannot identify the official FreeBSD production release');
  return `${match[1]}-RELEASE`;
}

export async function latestProductionRelease(request = fetch) {
  const response = await request('https://www.freebsd.org/where/', { signal: AbortSignal.timeout(30000), redirect: 'error' });
  if (!response.ok) throw new Error(`Cannot fetch official FreeBSD release index (${response.status})`);
  return productionRelease(await response.text());
}
