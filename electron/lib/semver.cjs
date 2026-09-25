// Sürüm karşılaştırma (saf, testli): 1.0.0-alpha.6 < 1.0.0-alpha.10 < 1.0.0.
// Ön sürüm etiketleri noktayla bölünüp sayısal parçalar sayı olarak karşılaştırılır (semver §11).

function parse(v) {
    const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/.exec(String(v || '').trim());
    if (!m) return null;
    return { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ? m[4].split('.') : [] };
}

/** a<b → negatif, a=b → 0, a>b → pozitif. Geçersiz sürüm → NaN. */
function compareVersions(a, b) {
    const x = parse(a);
    const y = parse(b);
    if (!x || !y) return NaN;
    for (let i = 0; i < 3; i++) if (x.nums[i] !== y.nums[i]) return x.nums[i] - y.nums[i];
    if (!x.pre.length || !y.pre.length) return (x.pre.length ? -1 : 0) + (y.pre.length ? 1 : 0);
    for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
        const p = x.pre[i];
        const q = y.pre[i];
        if (p === undefined) return -1;
        if (q === undefined) return 1;
        const pn = /^\d+$/.test(p);
        const qn = /^\d+$/.test(q);
        if (pn && qn && Number(p) !== Number(q)) return Number(p) - Number(q);
        if (pn !== qn) return pn ? -1 : 1;
        if (p !== q) return p < q ? -1 : 1;
    }
    return 0;
}

module.exports = { compareVersions };
