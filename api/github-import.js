/**
 * GitHub Import
 * Fetches files from a GitHub repository and returns them
 * in a format ready for the code editor/Sandpack preview.
 */

/**
 * Extracts owner and repo from a GitHub URL.
 * Supports: github.com/owner/repo, github.com/owner/repo/tree/branch/path
 */
export function parseGitHubUrl(url) {
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) return null;

    const owner = match[1];
    const repo = match[2].replace(/\.git$/, '');

    // Check for specific path: /tree/branch/path
    const pathMatch = url.match(/\/tree\/[^/]+\/(.+)/);
    const subPath = pathMatch ? pathMatch[1] : null;

    // Check for specific branch
    const branchMatch = url.match(/\/tree\/([^/]+)/);
    const branch = branchMatch ? branchMatch[1] : null;

    return { owner, repo, branch, subPath };
}

/**
 * Fetches the file tree of a GitHub repo using the Git Trees API.
 * Returns flat list of { path, type, sha, size }
 */
async function fetchRepoTree(owner, repo, branch, token) {
    const ref = branch || 'main';
    const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`;
    const headers = {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(url, { headers });
    if (!res.ok) {
        // Try 'master' if 'main' failed
        if (ref === 'main') {
            const retryRes = await fetch(url.replace('/main?', '/master?'), { headers });
            if (retryRes.ok) return (await retryRes.json()).tree;
        }
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `GitHub API error: ${res.status}`);
    }
    return (await res.json()).tree;
}

/**
 * Fetches a single file's content from GitHub.
 */
async function fetchFileContent(owner, repo, path, token) {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const headers = {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(url, { headers });
    if (!res.ok) return null;

    const data = await res.json();
    if (data.encoding === 'base64' && data.content) {
        return Buffer.from(data.content, 'base64').toString('utf-8');
    }
    return null;
}

// File extensions we care about for code editing
const CODE_EXTENSIONS = new Set([
    '.js', '.jsx', '.ts', '.tsx', '.css', '.scss',
    '.html', '.json', '.md', '.svg', '.vue', '.svelte',
]);

// Files/dirs to skip
const SKIP_PATTERNS = [
    'node_modules', '.git', 'dist', 'build', '.next',
    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
    '.DS_Store', '.env', 'coverage', '__pycache__',
];

function shouldInclude(filePath) {
    // Skip known non-code paths
    for (const pattern of SKIP_PATTERNS) {
        if (filePath.includes(pattern)) return false;
    }
    // Only include files with code extensions
    const ext = '.' + filePath.split('.').pop()?.toLowerCase();
    return CODE_EXTENSIONS.has(ext);
}

/**
 * Imports a GitHub repo and returns files in { path: content } format.
 * Limits to 20 files and 200KB total to stay within context limits.
 */
export async function importGitHubRepo(owner, repo, branch, subPath, token) {
    const tree = await fetchRepoTree(owner, repo, branch, token);

    // Filter to code files only
    let codeFiles = tree
        .filter(item => item.type === 'blob' && shouldInclude(item.path))
        .filter(item => !item.size || item.size < 50000); // Skip files > 50KB

    // If subPath specified, only include files under that path
    if (subPath) {
        codeFiles = codeFiles.filter(f => f.path.startsWith(subPath));
    }

    // Prioritize src/ files, then root files
    codeFiles.sort((a, b) => {
        const aInSrc = a.path.startsWith('src/') ? 0 : 1;
        const bInSrc = b.path.startsWith('src/') ? 0 : 1;
        return aInSrc - bInSrc || a.path.localeCompare(b.path);
    });

    // Limit to 20 files
    codeFiles = codeFiles.slice(0, 20);

    // Fetch content for each file
    const files = {};
    let totalSize = 0;
    const MAX_TOTAL = 200000; // 200KB

    for (const file of codeFiles) {
        if (totalSize > MAX_TOTAL) break;

        const content = await fetchFileContent(owner, repo, file.path, token);
        if (content) {
            // Strip subPath prefix for cleaner file names
            const cleanPath = subPath ? file.path.replace(subPath + '/', '') : file.path;
            files[cleanPath] = content;
            totalSize += content.length;
        }
    }

    return {
        files,
        fileCount: Object.keys(files).length,
        totalSize,
        repoUrl: `https://github.com/${owner}/${repo}`,
    };
}

/**
 * Detects if a message contains a GitHub repo URL for import.
 */
export function isGitHubImportRequest(text) {
    return /github\.com\/[^/]+\/[^/\s]+/.test(text) &&
        /\b(import|load|fetch|pull|open|edit|get|clone)\b/i.test(text);
}
