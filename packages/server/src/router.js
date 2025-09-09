// Lightweight path matcher for server + middleware
// Example: matchRoute('/api/runs/123/status', '/api', '/runs/:id/status')
//   => { params: { id: '123' } }
export function matchRoute(url, basePath, template) {
    if (!url.startsWith(basePath))
        return null;
    const q = url.indexOf('?');
    const path = url.slice(basePath.length, q >= 0 ? q : undefined) || '/';
    const tSegs = template.split('/').filter(Boolean);
    const pSegs = path.split('/').filter(Boolean);
    if (tSegs.length !== pSegs.length)
        return null;
    const params = {};
    for (let i = 0; i < tSegs.length; i++) {
        const t = tSegs[i];
        const p = pSegs[i];
        if (t.startsWith(':')) {
            const name = t.slice(1);
            if (!name)
                return null;
            params[name] = p;
        }
        else if (t !== p) {
            return null;
        }
    }
    return { params };
}
