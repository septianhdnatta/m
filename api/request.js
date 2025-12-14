export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const token = process.env.GITHUB_TOKEN;
    const path = process.env.GITHUB_JSON_PATH || 'requests.json';
    const branch = process.env.GITHUB_BRANCH || 'main';

    if (!owner || !repo || !token) {
      return res.status(500).json({ error: 'MISSING_ENV' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const requestedBy = String(body.requestedBy || '').trim().slice(0, 50);
    const title = String(body.title || '').trim().slice(0, 100);

    if (!requestedBy || !title) return res.status(400).json({ error: 'INVALID_INPUT' });

    // 1) GET current file (need sha for update) [GitHub contents API requires sha for update] [web:8]
    const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
    const getRes = await fetch(getUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json'
      }
    });

    if (!getRes.ok) {
      const text = await getRes.text();
      return res.status(getRes.status).json({ error: 'GITHUB_GET_FAILED', detail: text.slice(0, 300) });
    }

    const getData = await getRes.json();
    const sha = getData.sha;
    const contentBase64 = (getData.content || '').replace(/\n/g, '');
    const jsonText = Buffer.from(contentBase64, 'base64').toString('utf8');

    let parsed;
    try { parsed = JSON.parse(jsonText); } catch { parsed = { requests: [] }; }
    const requests = Array.isArray(parsed.requests) ? parsed.requests : [];

    requests.push({ title, requestedBy, timestamp: Date.now() });

    const newJson = JSON.stringify({ requests }, null, 2);
    const newContent = Buffer.from(newJson, 'utf8').toString('base64');

    // 2) PUT update file with base64 content + sha [web:8]
    const putUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
    const putRes = await fetch(putUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `New request: ${title}`,
        content: newContent,
        sha,
        branch
      })
    });

    if (!putRes.ok) {
      const text = await putRes.text();
      return res.status(putRes.status).json({ error: 'GITHUB_PUT_FAILED', detail: text.slice(0, 300) });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'SERVER_ERROR', detail: String(e) });
  }
}
