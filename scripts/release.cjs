// Sürüm paketleme ve yayınlama: `npm run release` (yalnızca paketler) ya da
// `npm run release -- --publish` (paketler + GitHub'a yayımlar).
//
// 1. Ön koşullar: temiz çalışma alanı, HEAD üzerinde v<sürüm> tag'i.
// 2. `npm run dist` → release/ içinde kurulum .exe, .blockmap ve latest.yml.
// 3. latest.yml'deki sürüm ve sha512 exe ile doğrulanır; SHA256SUMS.txt yazılır;
//    hepsi release/out/<sürüm>/ klasörüne toplanır.
// 4. --publish: aynı dosyalar PUBLISH_REPOS'taki her repoya Pre-release olarak
//    yüklenir. Kurulu launcher'lar güncellemeyi buradan alır.
//
// Token kodda ya da env'de tutulmaz: git'in kimlik yöneticisinden (git credential
// fill) okunur ve hiçbir yere yazdırılmaz.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
// Kaynak repo: mevcut kurulumlar (alpha.6 öncesi) buradan güncellenir.
// Releases repo: alpha.6 ve sonrası kurulumların güncelleme kaynağı (package.json → build.publish).
const PUBLISH_REPOS = ['HardSetups/HLauncher', 'HardSetups/HLauncher-releases'];

const args = new Set(process.argv.slice(2));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const version = pkg.version;
const tag = `v${version}`;

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
const fail = (msg) => { console.error(`\n✗ ${msg}`); process.exit(1); };
const sha = (algo, file, enc = 'hex') => crypto.createHash(algo).update(fs.readFileSync(file)).digest(enc);

function preflight() {
    if (git('status', '--porcelain')) fail('Çalışma alanı temiz değil; önce commit\'le.');
    let tagCommit;
    try { tagCommit = git('rev-list', '-n', '1', tag); } catch { fail(`${tag} tag'i yok. Önce: git tag ${tag}`); }
    if (tagCommit !== git('rev-parse', 'HEAD')) fail(`HEAD, ${tag} tag'inin commit'i değil.`);
}

function build() {
    console.log(`→ ${version} paketleniyor (npm run dist)…`);
    execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dist'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
}

function collect() {
    const rel = path.join(ROOT, 'release');
    const exeName = `HLauncher-Kurulum-${version}.exe`;
    const files = [exeName, `${exeName}.blockmap`, 'latest.yml'].map((f) => path.join(rel, f));
    for (const f of files) if (!fs.existsSync(f)) fail(`Paket dosyası yok: ${path.relative(ROOT, f)}`);

    // latest.yml gerçekten bu exe'yi mi anlatıyor?
    const yml = fs.readFileSync(files[2], 'utf8');
    const ymlVersion = /^version:\s*(\S+)/m.exec(yml)?.[1];
    const ymlSha512 = /^sha512:\s*(\S+)/m.exec(yml)?.[1];
    if (ymlVersion !== version) fail(`latest.yml sürümü ${ymlVersion}, beklenen ${version}`);
    if (ymlSha512 !== sha('sha512', files[0], 'base64')) fail('latest.yml içindeki sha512 exe ile uyuşmuyor');

    const outDir = path.join(rel, 'out', version);
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(outDir, { recursive: true });
    for (const f of files) fs.copyFileSync(f, path.join(outDir, path.basename(f)));
    const sums = files.map((f) => `${sha('sha256', f)}  ${path.basename(f)}`).join('\n') + '\n';
    fs.writeFileSync(path.join(outDir, 'SHA256SUMS.txt'), sums);
    console.log(`✓ Dosyalar: ${path.relative(ROOT, outDir)}\n${sums}`);
    return fs.readdirSync(outDir).map((f) => path.join(outDir, f));
}

function releaseNotes() {
    const changelog = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
    const start = changelog.indexOf(`## ${version}`);
    if (start < 0) fail(`CHANGELOG.md'de "## ${version}" bölümü yok`);
    const next = changelog.indexOf('\n## ', start + 3);
    return changelog.slice(changelog.indexOf('\n', start) + 1, next < 0 ? undefined : next).trim();
}

function githubToken() {
    const out = execFileSync('git', ['credential', 'fill'], {
        cwd: ROOT, input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8',
        env: { ...process.env, GCM_INTERACTIVE: 'never' },
    });
    const token = /^password=(.+)$/m.exec(out)?.[1];
    if (!token) fail('GitHub kimliği bulunamadı (git credential fill)');
    return token;
}

async function publish(files) {
    const token = githubToken();
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'hlauncher-release' };
    const api = async (method, url, body, extra = {}) => {
        const res = await fetch(url.startsWith('http') ? url : `https://api.github.com${url}`, {
            method, headers: { ...headers, ...extra.headers }, body,
        });
        if (res.status === 404 && extra.allow404) return null;
        if (!res.ok) fail(`GitHub ${method} ${url.split('?')[0]} → HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
        return res.status === 204 ? null : res.json();
    };
    const notes = releaseNotes();

    for (const repo of PUBLISH_REPOS) {
        let release = await api('GET', `/repos/${repo}/releases/tags/${tag}`, undefined, { allow404: true });
        if (!release) {
            // Taslaklar tags ucunda görünmez; aynı tag'li taslak varsa onu kullan
            const list = await api('GET', `/repos/${repo}/releases?per_page=30`);
            release = list.find((r) => r.tag_name === tag) || null;
        }
        const meta = { tag_name: tag, name: `HLauncher ${version}`, body: notes, draft: false, prerelease: version.includes('-') };
        release = release
            ? await api('PATCH', `/repos/${repo}/releases/${release.id}`, JSON.stringify(meta))
            : await api('POST', `/repos/${repo}/releases`, JSON.stringify(meta));

        for (const file of files) {
            const name = path.basename(file);
            const existing = (release.assets || []).find((a) => a.name === name);
            if (existing) await api('DELETE', `/repos/${repo}/releases/assets/${existing.id}`);
            await api('POST', `https://uploads.github.com/repos/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`,
                fs.readFileSync(file), { headers: { 'Content-Type': 'application/octet-stream' } });
            console.log(`  ↑ ${repo}: ${name}`);
        }
        console.log(`✓ Yayımlandı: ${release.html_url}`);
    }
}

(async () => {
    const shouldPublish = args.has('--publish');
    if (shouldPublish) preflight();
    if (!args.has('--skip-build')) build();
    const files = collect();
    if (shouldPublish) await publish(files);
    else console.log('Yalnızca paketlendi. Yayımlamak için: npm run release -- --publish');
})().catch((err) => fail(err.stack || err.message));
