export default async function handler(req, res) {
  // Allow preflight and HEAD probes (biar gak 405) [web:51]
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'HEAD') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const token = process.env.GITHUB_TOKEN;
    const path = process.env.GITHUB_JSON_PATH || 'requests.json';
    const branch = process.env.GITHUB_BRANCH || 'main';

    if (!owner || !repo || !token) {
      return res.status(500).json({ error: 'MISSING_ENV' });
    }

    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;

    const gh = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json'
      }
    });

    if (!gh.ok) {
      const text = await gh.text();
      return res.status(gh.status).json({ error: 'GITHUB_GET_FAILED', detail: text.slice(0, 300) });
    }

    const data = await gh.json();
    const contentBase64 = (data.content || '').replace(/\n/g, '');
    const jsonText = Buffer.from(contentBase64, 'base64').toString('utf8');

    let parsed;
    try { parsed = JSON.parse(jsonText); } catch { parsed = { requests: [] }; }

    return res.status(200).json({
      sha: data.sha,
      requests: Array.isArray(parsed.requests) ? parsed.requests : []
    });
  } catch (e) {
    return res.status(500).json({ error: 'SERVER_ERROR', detail: String(e) });
  }
}
