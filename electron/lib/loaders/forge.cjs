// Forge / NeoForge: resmi installer jar'ı indirilir ve MCLC'nin `forge`
// seçeneğine verilir (MCLC installer'ı kendisi işler). NeoForge deneyseldir.
const fs = require('fs');
const path = require('path');
const { httpGetJson, httpGetText } = require('../http.cjs');
const { downloadFile } = require('../download.cjs');
const { getInstallersDir } = require('../paths.cjs');
const log = require('../logger.cjs');

const FORGE_PROMOS = 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json';
const FORGE_MAVEN = 'https://maven.minecraftforge.net/net/minecraftforge/forge';
const NEOFORGE_METADATA = 'https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml';
const NEOFORGE_MAVEN = 'https://maven.neoforged.net/releases/net/neoforged/neoforge';

async function resolveForgeVersion(mcVer) {
    const promos = (await httpGetJson(FORGE_PROMOS)).promos || {};
    const version = promos[`${mcVer}-recommended`] || promos[`${mcVer}-latest`];
    if (!version) throw new Error(`${mcVer} için Forge bulunamadı`);
    return version;
}

// MC 1.21.4 → NeoForge 21.4.x ailesi. 1.20.2 öncesi NeoForge farklı şemadadır, desteklenmez.
function neoForgePrefixFor(mcVer) {
    const m = String(mcVer).match(/^1\.(\d+)(?:\.(\d+))?$/);
    if (!m) return null;
    const minor = parseInt(m[1], 10);
    const patch = parseInt(m[2] || '0', 10);
    if (minor < 20 || (minor === 20 && patch < 2)) return null;
    return `${minor}.${patch}`;
}

function pickNeoForgeVersion(xml, prefix) {
    const versions = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1]);
    const matching = versions.filter((v) => v === prefix || v.startsWith(`${prefix}.`));
    if (!matching.length) return null;
    const stable = matching.filter((v) => !/beta|rc|snapshot/i.test(v));
    const pool = stable.length ? stable : matching;
    return pool[pool.length - 1]; // maven-metadata sıralıdır: en yenisi sonda
}

async function resolveNeoForgeVersion(mcVer) {
    const prefix = neoForgePrefixFor(mcVer);
    if (!prefix) throw new Error(`NeoForge, Minecraft ${mcVer} sürümünü desteklemiyor (1.20.2+ gerekir)`);
    const xml = await httpGetText(NEOFORGE_METADATA);
    const version = pickNeoForgeVersion(xml, prefix);
    if (!version) throw new Error(`${mcVer} için NeoForge sürümü bulunamadı`);
    return version;
}

/**
 * Installer jar'ını indirir (önbellekli) ve yolunu döndürür.
 * @param {'forge'|'neoforge'} kind
 */
async function ensureInstaller(kind, mcVer, onProgress) {
    const label = kind === 'forge' ? 'Forge' : 'NeoForge';
    onProgress({ type: kind, percent: 0, key: 'be.checkingVersions', params: { name: label } });

    let url, fileName;
    if (kind === 'forge') {
        const v = await resolveForgeVersion(mcVer);
        fileName = `forge-${mcVer}-${v}-installer.jar`;
        url = `${FORGE_MAVEN}/${mcVer}-${v}/${fileName}`;
    } else {
        const v = await resolveNeoForgeVersion(mcVer);
        fileName = `neoforge-${v}-installer.jar`;
        url = `${NEOFORGE_MAVEN}/${v}/${fileName}`;
    }

    const dest = path.join(getInstallersDir(), fileName);
    if (fs.existsSync(dest)) {
        log.info(`[${label.toUpperCase()}] Installer önbellekte: ${fileName}`);
        return dest;
    }

    onProgress({ type: kind, percent: 10, key: 'be.downloading', params: { name: label } });
    await downloadFile(url, dest, {
        onProgress: (pct) => onProgress({ type: kind, percent: 10 + Math.floor(pct * 0.85), key: 'be.downloadingPct', params: { name: label, pct } }),
    });
    onProgress({ type: kind, percent: 100, key: 'be.ready', params: { name: label } });
    return dest;
}

module.exports = { ensureInstaller, resolveForgeVersion, resolveNeoForgeVersion, neoForgePrefixFor, pickNeoForgeVersion };
